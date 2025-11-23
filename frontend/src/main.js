import { startVisuals } from './visuals.js';

const BACKEND_URL = window.BACKEND_URL || 'http://localhost:8000';

const fileInput = document.getElementById('fileInput');
const analyzeButton = document.getElementById('analyzeButton');
const bpmValue = document.getElementById('bpmValue');
const beatCount = document.getElementById('beatCount');
const sectionLabels = document.getElementById('sectionLabels');
const backendUrl = document.getElementById('backendUrl');
backendUrl.textContent = BACKEND_URL;

let audioEl = null;
let analysis = null;

async function uploadAndAnalyze(file) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${BACKEND_URL}/analyze`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error('Analysis failed');
  }

  return response.json();
}

function updateDebugPanel(data) {
  bpmValue.textContent = data.bpm?.toFixed(1) ?? '-';
  beatCount.textContent = data.beat_times ? data.beat_times.length : '-';
  sectionLabels.textContent = data.sections ? data.sections.map((s) => s.label).join(', ') : '-';
}

analyzeButton.addEventListener('click', async () => {
  const file = fileInput.files[0];
  if (!file) {
    alert('Please select an audio file first.');
    return;
  }

  analyzeButton.disabled = true;
  analyzeButton.textContent = 'Analyzing...';
  try {
    analysis = await uploadAndAnalyze(file);
    updateDebugPanel(analysis);

    if (audioEl) {
      audioEl.pause();
    }
    audioEl = new Audio(URL.createObjectURL(file));
    audioEl.play();

    const canvas = document.getElementById('visualCanvas');
    startVisuals(audioEl, analysis, canvas);
  } catch (err) {
    console.error(err);
    alert('Failed to analyze track. Check the backend logs.');
  } finally {
    analyzeButton.disabled = false;
    analyzeButton.textContent = 'Analyze & Play';
  }
});
