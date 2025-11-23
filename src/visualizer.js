const startButton = document.getElementById('start');
const stopButton = document.getElementById('stop');
const modeSelect = document.getElementById('mode');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

let running = false;
let animationId = null;
let latestFrequency = [];
let smoothFrequency = [];
let currentMode = 'bars';

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function updateData(frequency, waveform) {
  if (!frequency || !waveform) return;
  latestFrequency = frequency;

  // Initialize smoothing arrays
  if (smoothFrequency.length !== frequency.length) {
    smoothFrequency = new Array(frequency.length).fill(0);
  }
}

function drawBars() {
  if (!latestFrequency.length) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const barCount = latestFrequency.length;
  const barWidth = (canvas.width / barCount) * 1.2;
  const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
  gradient.addColorStop(0, 'rgba(34, 211, 238, 0.6)');
  gradient.addColorStop(0.5, 'rgba(168, 85, 247, 0.8)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0.9)');

  for (let i = 0; i < barCount; i++) {
    const target = latestFrequency[i];
    smoothFrequency[i] = lerp(smoothFrequency[i], target, 0.12);
    const barHeight = (smoothFrequency[i] / 255) * (canvas.height * 0.55);
    const x = i * barWidth;
    const y = canvas.height - barHeight;
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, barWidth * 0.8, barHeight + 4);
  }
}

function drawOrbit() {
  if (!latestFrequency.length) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = Math.min(canvas.width, canvas.height) * 0.25;
  const bars = latestFrequency.length;

  for (let i = 0; i < bars; i++) {
    const angle = (i / bars) * Math.PI * 2;
    const magnitude = latestFrequency[i];
    smoothFrequency[i] = lerp(smoothFrequency[i], magnitude, 0.1);

    const innerRadius = radius * 0.65;
    const barLength = (smoothFrequency[i] / 255) * (radius * 0.9);
    const startX = centerX + Math.cos(angle) * innerRadius;
    const startY = centerY + Math.sin(angle) * innerRadius;
    const endX = centerX + Math.cos(angle) * (innerRadius + barLength);
    const endY = centerY + Math.sin(angle) * (innerRadius + barLength);

    const hue = 180 + (i / bars) * 120;
    const alpha = 0.25 + (smoothFrequency[i] / 255) * 0.65;
    ctx.strokeStyle = `hsla(${hue}, 90%, 65%, ${alpha})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    const dotRadius = 4 + (smoothFrequency[i] / 255) * 6;
    ctx.fillStyle = `hsla(${hue}, 90%, 72%, ${alpha})`;
    ctx.beginPath();
    ctx.arc(endX, endY, dotRadius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function render() {
  if (!running) return;

  if (!latestFrequency.length) {
    animationId = requestAnimationFrame(render);
    return;
  }

  if (currentMode === 'orbit') {
    drawOrbit();
  } else {
    drawBars();
  }

  animationId = requestAnimationFrame(render);
}

function startVisualizer() {
  running = true;
  chrome.runtime.sendMessage({ type: 'VISUALIZER_READY' });
  chrome.runtime.sendMessage({ type: 'RESTART_CAPTURE' });

  if (!animationId) {
    animationId = requestAnimationFrame(render);
  }
}

function stopVisualizer() {
  running = false;
  chrome.runtime.sendMessage({ type: 'STOP_CAPTURE' });
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'AUDIO_DATA') {
    updateData(message.frequency, message.waveform);
  }
});

startButton.addEventListener('click', startVisualizer);
stopButton.addEventListener('click', stopVisualizer);
modeSelect.addEventListener('change', (event) => {
  currentMode = event.target.value;
});

// Announce readiness when page loads so the offscreen analyzer can start streaming data.
chrome.runtime.sendMessage({ type: 'VISUALIZER_READY' });
