# Aurora Film Engine (Prototype)

A plain HTML/CSS/JS music film experiment that turns any dropped audio file into a tiny animated scene.

## Scenes
- **Side-scroller journey**: a Californication-inspired ride across rolling terrain, crystals, and parallax layers. The player icon hops on beats, the world shifts per energy, and each act uses different hues.
- **Moving room performance**: a Jamiroquai-style elastic room where floor and walls slide, tilt, and pulse. The center stage glows with bass, and beats snap the room into exaggerated poses.

## Usage
1. Open `index.html` in your browser (no build step required).
2. Drop or select an audio file (mp3/wav/etc.).
3. Choose a scene and hit Play/Pause to control playback.

The visuals rely on the Web Audio API (AudioContext + AnalyserNode) to react to frequency energy and simple beat detection.
