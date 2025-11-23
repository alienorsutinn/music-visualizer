const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const barsButton = document.getElementById('mode-bars');
const radialButton = document.getElementById('mode-radial');

let mode = 'bars';
let frequencyData = new Float32Array(0);
let smoothed = [];
let animationId = null;

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Register this tab with the background and request audio data.
chrome.runtime.sendMessage({ type: 'VISUALIZER_PORT' });
chrome.runtime.sendMessage({ type: 'VISUALIZER_READY' });

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'AUDIO_DATA' && Array.isArray(message.payload)) {
    frequencyData = new Float32Array(message.payload);
    if (smoothed.length !== frequencyData.length) {
      smoothed = new Array(frequencyData.length).fill(0);
    }
  }
});

barsButton.addEventListener('click', () => switchMode('bars'));
radialButton.addEventListener('click', () => switchMode('radial'));

function switchMode(next) {
  mode = next;
  barsButton.classList.toggle('active', mode === 'bars');
  radialButton.classList.toggle('active', mode === 'radial');
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function draw() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  ctx.clearRect(0, 0, width, height);

  if (frequencyData.length === 0) {
    animationId = requestAnimationFrame(draw);
    return;
  }

  const sampleCount = mode === 'bars' ? 96 : 120;
  const step = Math.max(1, Math.floor(frequencyData.length / sampleCount));

  const samples = new Array(sampleCount).fill(0).map((_, i) => {
    const start = i * step;
    let sum = 0;
    for (let j = start; j < Math.min(start + step, frequencyData.length); j++) {
      sum += frequencyData[j];
    }
    return sum / step;
  });

  // Smooth values for fluid motion.
  const smoothing = 0.2;
  samples.forEach((value, index) => {
    smoothed[index] = lerp(smoothed[index] || 0, value, smoothing);
  });

  if (mode === 'bars') {
    renderBars(smoothed, width, height);
  } else {
    renderRadial(smoothed, width, height);
  }

  animationId = requestAnimationFrame(draw);
}

function renderBars(values, width, height) {
  const barCount = values.length;
  const barWidth = Math.max(2, width / barCount);
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#7c3aed');
  gradient.addColorStop(0.4, '#22d3ee');
  gradient.addColorStop(1, '#0ea5e9');

  for (let i = 0; i < barCount; i++) {
    const magnitude = values[i] / 255;
    const eased = Math.pow(magnitude, 1.5);
    const barHeight = eased * (height * 0.65);
    const x = i * barWidth;
    const y = height - barHeight;

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(x + 2, y, barWidth - 4, barHeight, 6);
    ctx.fill();
  }
}

function renderRadial(values, width, height) {
  const radius = Math.min(width, height) * 0.22;
  const cx = width / 2;
  const cy = height / 2 + 30;
  const spokeCount = values.length;
  const angleStep = (Math.PI * 2) / spokeCount;

  ctx.save();
  ctx.translate(cx, cy);
  for (let i = 0; i < spokeCount; i++) {
    const magnitude = values[i] / 255;
    const eased = Math.pow(magnitude, 1.4);
    const inner = radius;
    const outer = radius + eased * radius * 1.2;
    const angle = i * angleStep;

    const x1 = Math.cos(angle) * inner;
    const y1 = Math.sin(angle) * inner;
    const x2 = Math.cos(angle) * outer;
    const y2 = Math.sin(angle) * outer;

    const hue = 180 + i * 0.8;
    ctx.strokeStyle = `hsla(${hue}, 80%, 65%, 0.9)`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.beginPath();
    ctx.fillStyle = `hsla(${hue}, 95%, 70%, 0.9)`;
    ctx.arc(x2, y2, 5 + eased * 6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Soft glow center
  const glow = ctx.createRadialGradient(0, 0, radius * 0.2, 0, 0, radius * 1.2);
  glow.addColorStop(0, 'rgba(34, 211, 238, 0.3)');
  glow.addColorStop(1, 'rgba(12, 18, 34, 0)');
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

draw();
