const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const barsButton = document.getElementById('mode-bars');
const radialButton = document.getElementById('mode-radial');
const micButton = document.getElementById('start-mic');
const fileInput = document.getElementById('file-input');
const overlay = document.getElementById('overlay');

let mode = 'bars';
let audioContext;
let analyser;
let dataArray = new Uint8Array(0);
let smoothed = [];
let sourceNode = null;
let animationId = null;
let outputGain = null;
let activeElement = null;

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

barsButton.addEventListener('click', () => switchMode('bars'));
radialButton.addEventListener('click', () => switchMode('radial'));
micButton.addEventListener('click', startMicrophone);
fileInput.addEventListener('change', handleFileSelection);

function switchMode(next) {
  mode = next;
  barsButton.classList.toggle('active', mode === 'bars');
  radialButton.classList.toggle('active', mode === 'radial');
}

async function ensureAnalyser() {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  if (!outputGain) {
    outputGain = audioContext.createGain();
    outputGain.gain.value = 1;
    outputGain.connect(audioContext.destination);
  }
  if (!analyser) {
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.85;
    analyser.maxDecibels = -10;
    analyser.minDecibels = -90;
    dataArray = new Uint8Array(analyser.frequencyBinCount);
  }
}

function stopActiveMediaElement() {
  if (!activeElement) return;
  try {
    activeElement.pause();
    activeElement.src = '';
    activeElement.load();
  } catch (e) {
    console.warn('Unable to stop previous media element', e);
  }
  activeElement = null;
}

function setSource(node, { monitor = false, element = null } = {}) {
  if (sourceNode) {
    try { sourceNode.disconnect(); } catch (e) {}
  }
  if (element) {
    stopActiveMediaElement();
    activeElement = element;
  }
  sourceNode = node;
  sourceNode.connect(analyser);
  if (monitor && outputGain) {
    try {
      sourceNode.connect(outputGain);
    } catch (e) {
      console.warn('Failed to route audio to output', e);
    }
  }
  hideOverlay();
}

async function startMicrophone() {
  try {
    await ensureAnalyser();
    await audioContext.resume();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const micSource = audioContext.createMediaStreamSource(stream);
    setSource(micSource, { monitor: false });
  } catch (err) {
    console.error('Microphone capture failed', err);
    showOverlay('Microphone unavailable', 'Check mic permissions or choose an audio file instead.');
  }
}

function handleFileSelection(event) {
  const [file] = event.target.files || [];
  if (!file) return;

  const url = URL.createObjectURL(file);
  startFilePlayback(url);
}

async function startFilePlayback(url) {
  try {
    await ensureAnalyser();
    await audioContext.resume();

    const audio = new Audio();
    audio.src = url;
    audio.loop = true;
    audio.crossOrigin = 'anonymous';
    audio.play();

    const elementSource = audioContext.createMediaElementSource(audio);
    setSource(elementSource, { monitor: true, element: audio });
  } catch (err) {
    console.error('Failed to play selected file', err);
    showOverlay('Playback error', 'The selected file could not be played.');
  }
}

function showOverlay(title, subtitle) {
  overlay.classList.add('visible');
  overlay.querySelector('.overlay-title').textContent = title;
  overlay.querySelector('.overlay-subtitle').textContent = subtitle;
}

function hideOverlay() {
  overlay.classList.remove('visible');
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function draw() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  ctx.clearRect(0, 0, width, height);

  if (!analyser || !sourceNode) {
    animationId = requestAnimationFrame(draw);
    return;
  }

  analyser.getByteFrequencyData(dataArray);

  const sampleCount = mode === 'bars' ? 96 : 140;
  const step = Math.max(1, Math.floor(dataArray.length / sampleCount));

  const samples = new Array(sampleCount).fill(0).map((_, i) => {
    const start = i * step;
    let sum = 0;
    for (let j = start; j < Math.min(start + step, dataArray.length); j++) {
      sum += dataArray[j];
    }
    return sum / step;
  });

  const smoothing = 0.18;
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
  const barWidth = Math.max(3, width / barCount);
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#9f7aea');
  gradient.addColorStop(0.35, '#22d3ee');
  gradient.addColorStop(1, '#0ea5e9');

  for (let i = 0; i < barCount; i++) {
    const magnitude = values[i] / 255;
    const eased = Math.pow(magnitude, 1.5);
    const barHeight = eased * (height * 0.7);
    const x = i * barWidth;
    const y = height - barHeight;

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(x + 2, y, barWidth - 4, barHeight, 8);
    ctx.fill();
  }
}

function renderRadial(values, width, height) {
  const radius = Math.min(width, height) * 0.22;
  const cx = width / 2;
  const cy = height / 2 + 20;
  const spokeCount = values.length;
  const angleStep = (Math.PI * 2) / spokeCount;

  ctx.save();
  ctx.translate(cx, cy);

  for (let i = 0; i < spokeCount; i++) {
    const magnitude = values[i] / 255;
    const eased = Math.pow(magnitude, 1.4);
    const inner = radius;
    const outer = radius + eased * radius * 1.3;
    const angle = i * angleStep;

    const x1 = Math.cos(angle) * inner;
    const y1 = Math.sin(angle) * inner;
    const x2 = Math.cos(angle) * outer;
    const y2 = Math.sin(angle) * outer;

    const hue = 180 + i * 0.7;
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

  const glow = ctx.createRadialGradient(0, 0, radius * 0.2, 0, 0, radius * 1.2);
  glow.addColorStop(0, 'rgba(34, 211, 238, 0.25)');
  glow.addColorStop(1, 'rgba(12, 18, 34, 0)');
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

draw();
