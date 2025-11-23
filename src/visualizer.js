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
let bandEnergy = { low: 0, mid: 0, high: 0 };
let beatLevel = 0;

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
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0.82;
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

function frequencyToIndex(hz) {
  if (!audioContext || !analyser) return 0;
  const nyquist = audioContext.sampleRate / 2;
  return Math.min(
    analyser.frequencyBinCount - 1,
    Math.max(0, Math.round((hz / nyquist) * analyser.frequencyBinCount)),
  );
}

function analyzeSpectrum() {
  analyser.getByteFrequencyData(dataArray);

  const sampleCount = mode === 'bars' ? 160 : 200;
  const samples = new Array(sampleCount).fill(0);
  const binCount = dataArray.length - 1;

  for (let i = 0; i < sampleCount; i++) {
    // Log-like distribution to emphasise lows/mids while keeping highs reactive.
    const t = i / (sampleCount - 1);
    const logIndex = Math.pow(t, 1.35) * binCount;
    const idx = Math.min(binCount, Math.max(0, Math.floor(logIndex)));
    const value = dataArray[idx];
    const eased = Math.pow(value / 255, 0.85) * 255;
    samples[i] = eased;
  }

  const smoothing = 0.22;
  samples.forEach((value, index) => {
    smoothed[index] = lerp(smoothed[index] || 0, value, smoothing);
  });

  // Band energies for low / mid / high dynamics and a loose beat accent.
  const lowRange = [frequencyToIndex(20), frequencyToIndex(180)];
  const midRange = [frequencyToIndex(180), frequencyToIndex(2000)];
  const highRange = [frequencyToIndex(2000), frequencyToIndex(8000)];

  function averageRange([start, end]) {
    const s = Math.max(0, Math.min(start, dataArray.length - 1));
    const e = Math.max(s + 1, Math.min(end, dataArray.length));
    let sum = 0;
    for (let i = s; i < e; i++) sum += dataArray[i];
    return sum / (e - s);
  }

  const low = averageRange(lowRange) / 255;
  const mid = averageRange(midRange) / 255;
  const high = averageRange(highRange) / 255;

  bandEnergy.low = lerp(bandEnergy.low, low, 0.1);
  bandEnergy.mid = lerp(bandEnergy.mid, mid, 0.1);
  bandEnergy.high = lerp(bandEnergy.high, high, 0.1);

  const rms = Math.sqrt(samples.reduce((acc, v) => acc + (v * v), 0) / samples.length) / 255;
  const avg = (bandEnergy.low + bandEnergy.mid + bandEnergy.high) / 3;
  if (rms > avg * 1.3) {
    beatLevel = 1;
  }
  beatLevel *= 0.9;

  return { samples: smoothed.slice(), energies: { ...bandEnergy }, beat: beatLevel };
}

function draw() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  ctx.clearRect(0, 0, width, height);

  if (!analyser || !sourceNode) {
    animationId = requestAnimationFrame(draw);
    return;
  }

  const analysis = analyzeSpectrum();

  if (mode === 'bars') {
    renderBars(analysis, width, height);
  } else {
    renderRadial(analysis, width, height);
  }

  animationId = requestAnimationFrame(draw);
}

function renderBars({ samples, energies, beat }, width, height) {
  const centerSpread = Math.floor(samples.length * 0.5);
  const half = Math.floor(centerSpread / 2);
  const barWidth = Math.max(4, width / (half * 2 + 2));

  const gradient = ctx.createLinearGradient(0, height * 0.2, 0, height);
  const brightness = 0.6 + energies.high * 0.4;
  gradient.addColorStop(0, `rgba(155, 139, 255, ${brightness})`);
  gradient.addColorStop(0.35, `rgba(34, 211, 238, ${brightness})`);
  gradient.addColorStop(1, `rgba(14, 165, 233, ${brightness})`);

  const centerGlow = ctx.createRadialGradient(
    width / 2,
    height * 0.55,
    10,
    width / 2,
    height * 0.55,
    height * 0.5,
  );
  centerGlow.addColorStop(0, `rgba(90, 235, 255, ${0.28 + beat * 0.4})`);
  centerGlow.addColorStop(1, 'rgba(5, 9, 20, 0)');
  ctx.fillStyle = centerGlow;
  ctx.fillRect(0, 0, width, height);

  const center = samples.length / 2;
  for (let i = 0; i < half; i++) {
    const leftIndex = center - i - 1;
    const rightIndex = center + i;
    const combined = (samples[leftIndex] + samples[rightIndex]) / 2;

    const weight = Math.exp(-Math.pow((i - half * 0.2) / (half * 0.6), 2));
    const magnitude = Math.pow((combined / 255) * weight, 1.4);

    const barHeight = magnitude * (height * (0.65 + energies.low * 0.3));
    const xLeft = width / 2 - (i + 1) * barWidth;
    const xRight = width / 2 + i * barWidth;
    const y = height - barHeight;

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(xLeft + 2, y, barWidth - 4, barHeight, 10);
    ctx.roundRect(xRight + 2, y, barWidth - 4, barHeight, 10);
    ctx.fill();
  }

  // Accent dots driven by mid/high bands for extra crispness.
  const dotCount = 32;
  for (let i = 0; i < dotCount; i++) {
    const t = i / dotCount;
    const idx = Math.floor(t * samples.length);
    const level = samples[idx] / 255;
    const angle = t * Math.PI * 2;
    const radius = (height * 0.14) + level * 60 + energies.mid * 40;
    const x = width / 2 + Math.cos(angle) * radius;
    const y = height * 0.58 + Math.sin(angle) * (radius * 0.4);
    ctx.fillStyle = `hsla(${200 + energies.high * 80}, 85%, ${60 + level * 30}%, ${0.25 + level * 0.5})`;
    ctx.beginPath();
    ctx.arc(x, y, 2 + level * 3 + beat * 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function renderRadial({ samples, energies, beat }, width, height) {
  const cx = width / 2;
  const cy = height / 2 + 10;
  const radius = Math.min(width, height) * (0.2 + energies.low * 0.1);
  const spokeCount = samples.length;
  const angleStep = (Math.PI * 2) / spokeCount;

  ctx.save();
  ctx.translate(cx, cy);

  const halo = ctx.createRadialGradient(0, 0, radius * 0.25, 0, 0, radius * 1.6);
  halo.addColorStop(0, `rgba(146, 118, 255, ${0.3 + beat * 0.5})`);
  halo.addColorStop(1, 'rgba(5, 9, 20, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(-width, -height, width * 2, height * 2);

  for (let i = 0; i < spokeCount; i++) {
    const magnitude = samples[i] / 255;
    const tone = Math.pow(magnitude, 1.2);
    const inner = radius * (0.7 + energies.mid * 0.2);
    const outer = inner + tone * radius * (1.1 + energies.high * 0.6 + beat * 0.4);
    const angle = i * angleStep;

    const x1 = Math.cos(angle) * inner;
    const y1 = Math.sin(angle) * inner;
    const x2 = Math.cos(angle) * outer;
    const y2 = Math.sin(angle) * outer;

    const hue = 180 + energies.high * 60 + i * 0.35;
    ctx.strokeStyle = `hsla(${hue}, 85%, ${60 + tone * 25}%, ${0.55 + beat * 0.25})`;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.beginPath();
    ctx.fillStyle = `hsla(${hue + 20}, 95%, ${65 + energies.high * 20}%, ${0.55 + tone * 0.4})`;
    ctx.arc(x2, y2, 4 + tone * 6 + beat * 2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

draw();
