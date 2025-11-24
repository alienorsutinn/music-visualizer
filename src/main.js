import { AudioEngine } from './audioEngine.js';

const fileInput = document.getElementById('file-input');
const analyzeButton = document.getElementById('analyze');
const playPauseButton = document.getElementById('play-pause');
const statusEl = document.getElementById('status');
const bpmEl = document.getElementById('bpm');
const beatCountEl = document.getElementById('beat-count');
const onsetCountEl = document.getElementById('onset-count');
const sectionListEl = document.getElementById('sections');
const logTableBody = document.getElementById('log-body');
const audioEl = document.getElementById('audio');

const engine = new AudioEngine();
let selectedFile = null;
let rafId = null;

function updateStatus(text) {
  statusEl.textContent = text;
}

fileInput.addEventListener('change', (e) => {
  const [file] = e.target.files;
  selectedFile = file || null;
  if (file) {
    updateStatus(`Ready to analyze: ${file.name}`);
  } else {
    updateStatus('No file selected');
  }
});

analyzeButton.addEventListener('click', async () => {
  if (!selectedFile) {
    updateStatus('Choose a file first.');
    return;
  }
  try {
    updateStatus('Decoding and analyzing...');
    await engine.loadFile(selectedFile);
    engine.attachToAudioElement(audioEl);
    bpmEl.textContent = engine.getBeatGrid().bpm.toFixed(1);
    beatCountEl.textContent = engine.getBeatGrid().beats.length;
    onsetCountEl.textContent = engine.onsets.length;
    renderSections();
    updateStatus('Analysis complete. Press Play to hear the track.');
    playPauseButton.disabled = false;
  } catch (err) {
    console.error(err);
    updateStatus('Analysis failed. See console for details.');
  }
});

playPauseButton.addEventListener('click', async () => {
  if (!engine.buffer) return;
  await engine.context.resume();
  if (audioEl.paused) {
    audioEl.play();
    playPauseButton.textContent = 'Pause';
    startLogging();
  } else {
    audioEl.pause();
    playPauseButton.textContent = 'Play';
    stopLogging();
  }
});

function renderSections() {
  sectionListEl.innerHTML = '';
  engine.getSections().forEach((sec, idx) => {
    const li = document.createElement('li');
    li.textContent = `#${idx + 1} ${sec.kind} — ${sec.start.toFixed(1)}s to ${sec.end.toFixed(1)}s`;
    sectionListEl.appendChild(li);
  });
}

function startLogging() {
  stopLogging();
  const loop = () => {
    const t = audioEl.currentTime;
    const f = engine.getFeaturesAtTime(t);
    logRow(f);
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);
}

function stopLogging() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
}

function logRow(f) {
  if (!logTableBody) return;
  const tr = document.createElement('tr');
  const cells = [
    f.time.toFixed(2),
    f.isOnBeat ? 'yes' : 'no',
    f.lowEnergy.toFixed(2),
    f.midEnergy.toFixed(2),
    f.highEnergy.toFixed(2),
    f.overallEnergy.toFixed(2),
    f.kickLike ? 'kick' : f.snareLike ? 'snare' : f.hatLike ? 'hat' : '-',
    f.sectionIndex !== null && engine.sections[f.sectionIndex]
      ? engine.sections[f.sectionIndex].kind
      : '-',
  ];
  cells.forEach((text) => {
    const td = document.createElement('td');
    td.textContent = text;
    tr.appendChild(td);
  });

  logTableBody.prepend(tr);
  while (logTableBody.children.length > 10) {
    logTableBody.removeChild(logTableBody.lastChild);
  }
}

updateStatus('Choose a file to begin.');
