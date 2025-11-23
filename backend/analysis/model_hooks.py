"""
Stub interfaces for future ML-enhanced analysis stages.
Implementations are intentionally lightweight placeholders so the API surface
remains stable when real models are integrated.
"""

from typing import Dict


def run_source_separation(audio_path: str) -> Dict[str, str]:
    """Separate the mixture into stems (vocals, drums, bass, other).

    This placeholder simply returns the original path for each stem name. Replace
    with a real source-separation model (e.g., Demucs or Open-Unmix) in the
    future.
    """
    return {
        "vocals": audio_path,
        "drums": audio_path,
        "bass": audio_path,
        "other": audio_path,
    }


def run_music_tagging(audio_path: str) -> Dict:
    """Predict high-level tags such as genre, mood, and instrumentation.

    For now, this returns heuristic tags with an energy curve placeholder. Swap
    with a model such as Musicnn or MERT for production use.
    """
    return {
        "mood": ["energetic", "confident"],
        "genre": ["electronic"],
        "instruments": ["drums", "synth"],
    }


def run_structure_model(audio_path: str) -> Dict:
    """Refine structural segmentation using an ML model.

    A future version could leverage self-similarity matrices or transformers to
    align sections with human-labeled structure. Currently returns an empty
    structure to signal no refinement.
    """
    return {"sections": []}
