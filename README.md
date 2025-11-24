# Aurora Audio Analysis Lab

A plain HTML/JS/CSS prototype that focuses on **offline audio analysis** so later visuals can feel musical. It decodes a selected track, extracts band energies, onsets, tempo/beat grid, and rough song sections, and exposes the data through a simple `AudioEngine` API.

## Files
- `index.html` – minimal UI to pick a file, run analysis, play audio, and inspect debug info.
- `src/audioEngine.js` – offline analysis engine (frame energies, onsets, tempo, beat grid, sections).
- `src/main.js` – UI glue that wires the engine to the page and realtime debug table.
- `src/styles.css` – layout and styling for the debug panel.

## How to run
1. Open `index.html` in your browser (no build tools required).
2. Select an audio file (mp3/wav/ogg) and click **Analyze**.
3. When analysis completes, press **Play**. The realtime debug table will show beat alignment, band energies, onset type, and current section.

## Feature API (summary)
- `AudioEngine.loadFile(file)` decodes the file, runs offline analysis, and stores results.
- `AudioEngine.attachToAudioElement(audio)` connects playback to the same `AudioContext`.
- `AudioEngine.getFeaturesAtTime(t)` returns low/mid/high/overall energies, beat proximity, onset flags (kick/snare/hat), and section index.
- `AudioEngine.getBeatGrid()` returns `{ bpm, beats }` for downstream syncing.
- `AudioEngine.getSections()` returns coarse song sections with labels like intro/build/drop/break.
