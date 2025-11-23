"""
DSP-based analysis pipeline used as a placeholder until ML models are available.
The functions here prioritize providing musical-feeling features that are easy to
consume from the frontend while being lightweight enough for local execution.
"""

from __future__ import annotations

from typing import Dict, List, Tuple

import librosa
import numpy as np

from .model_hooks import run_music_tagging, run_structure_model


def _band_energies(y: np.ndarray, sr: int, hop_length: int) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Return frame-wise low/mid/high energy using mel bands."""
    mel = librosa.feature.melspectrogram(y=y, sr=sr, n_fft=2048, hop_length=hop_length, n_mels=64)
    mel_db = librosa.power_to_db(mel, ref=np.max)
    thirds = np.array_split(mel_db, 3, axis=0)
    low = thirds[0].mean(axis=0)
    mid = thirds[1].mean(axis=0)
    high = thirds[2].mean(axis=0)
    return low, mid, high


def _classify_onsets(onset_frames: np.ndarray, low: np.ndarray, mid: np.ndarray, high: np.ndarray) -> List[Dict[str, float]]:
    events: List[Dict[str, float]] = []
    for frame in onset_frames:
        frame = int(frame)
        energies = {"low": low[frame], "mid": mid[frame], "high": high[frame]}
        band = max(energies, key=energies.get)
        if band == "low":
            event_type = "kick"
        elif band == "mid":
            event_type = "snare"
        else:
            event_type = "hat"
        strength = float(np.interp(energies[band], [min(energies.values()), max(energies.values()) + 1e-6], [0.2, 1.0]))
        events.append({"frame": frame, "type": event_type, "strength": strength})
    return events


def _infer_sections(beat_times: np.ndarray, onset_times: np.ndarray, energy_curve: np.ndarray, sr: int, hop_length: int) -> List[Dict[str, float]]:
    sections: List[Dict[str, float]] = []
    if len(energy_curve) == 0:
        return sections
    frame_times = librosa.frames_to_time(np.arange(len(energy_curve)), sr=sr, hop_length=hop_length)
    window = max(1, len(frame_times) // 20)
    energy_smooth = np.convolve(energy_curve, np.ones(window) / window, mode="same")
    thresholds = {
        "low": np.percentile(energy_smooth, 40),
        "mid": np.percentile(energy_smooth, 60),
        "high": np.percentile(energy_smooth, 80),
    }

    current_label = "intro"
    start_time = 0.0
    for i, energy in enumerate(energy_smooth):
        t = frame_times[i]
        label = current_label
        if energy > thresholds["high"]:
            label = "drop"
        elif energy > thresholds["mid"]:
            label = "build"
        elif energy < thresholds["low"]:
            label = "break"
        if label != current_label:
            sections.append({"start": start_time, "end": t, "label": current_label})
            current_label = label
            start_time = t
    sections.append({"start": start_time, "end": float(frame_times[-1]), "label": current_label})

    if sections:
        sections[0]["label"] = "intro"
        sections[-1]["label"] = "outro"
    return sections


def analyze_track(file_path: str) -> Dict:
    """Analyze an audio file and return a structured JSON-friendly dictionary.

    The analysis intentionally mirrors what a future ML-driven pipeline will output,
    so that the frontend contract remains stable as the system evolves.
    """

    y, sr = librosa.load(file_path, sr=None, mono=True)
    duration = librosa.get_duration(y=y, sr=sr)
    hop_length = 512

    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, hop_length=hop_length)
    beat_times = librosa.frames_to_time(beat_frames, sr=sr, hop_length=hop_length)

    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop_length)
    onset_frames = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr, hop_length=hop_length)
    onset_times = librosa.frames_to_time(onset_frames, sr=sr, hop_length=hop_length)

    low, mid, high = _band_energies(y, sr, hop_length)
    events = _classify_onsets(onset_frames, low, mid, high)
    for event in events:
        event["time"] = float(librosa.frames_to_time(event.pop("frame"), sr=sr, hop_length=hop_length))

    energy_curve = (0.5 * np.array(low) + 0.35 * np.array(mid) + 0.15 * np.array(high)).tolist()

    sections = _infer_sections(beat_times, onset_times, np.array(energy_curve), sr, hop_length)
    tags = run_music_tagging(file_path)
    if "energy_curve" not in tags:
        tags["energy_curve"] = energy_curve

    return {
        "duration": float(duration),
        "bpm": float(tempo),
        "beat_times": beat_times.tolist(),
        "sections": sections,
        "events": events,
        "tags": tags,
    }
