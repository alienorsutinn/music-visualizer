const canvas = document.getElementById('visualizer');
const ctx = canvas.getContext('2d');
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const playPauseBtn = document.getElementById('play-pause');
const sceneSelect = document.getElementById('scene-select');
const audioEl = document.getElementById('audio');

let audioCtx;
let analyser;
let sourceNode;
let dataArray;
let timeData;
let metrics = createMetrics();
let running = false;
let currentScene = 'side-scroller';
let sideState = createSideScrollerState();
let roomState = createRoomState();
const dpr = window.devicePixelRatio || 1;

function resize() {
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

function getViewport() {
  return {
    width: canvas.width / dpr,
    height: canvas.height / dpr,
  };
}

function createMetrics() {
  return {
    energy: 0,
    low: 0,
    mid: 0,
    high: 0,
    beat: false,
    smoothedEnergy: 0,
    history: [],
    lastTime: 0,
  };
}

function createSideScrollerState() {
  return {
    trackLength: 8000,
    camera: 0,
    parallaxSeeds: [Math.random() * 1000, Math.random() * 2000, Math.random() * 3000],
    actColors: [
      ['#0b1930', '#1e3a8a'],
      ['#0b203d', '#145ea8'],
      ['#330f47', '#b02885'],
      ['#1b0f2d', '#f59e0b'],
    ],
    pulses: [],
    player: { y: 0, vy: 0, glow: 0 },
    shake: 0,
    lastTime: 0,
  };
}

function createRoomState() {
  return {
    pulse: 0,
    lean: 0,
    colorShift: 0,
    lastTime: 0,
  };
}

function setupAudio(file) {
  const url = URL.createObjectURL(file);
  audioEl.src = url;
  audioEl.load();

  if (!audioCtx) {
    audioCtx = new AudioContext();
  }

  if (sourceNode) {
    sourceNode.disconnect();
  }

  sourceNode = audioCtx.createMediaElementSource(audioEl);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.75;
  sourceNode.connect(analyser);
  analyser.connect(audioCtx.destination);

  const bufferLength = analyser.frequencyBinCount;
  dataArray = new Uint8Array(bufferLength);
  timeData = new Uint8Array(bufferLength);
}

function handleFile(file) {
  if (!file) return;
  setupAudio(file);
  playPauseBtn.textContent = 'Play';
  running = true;
  audioEl.play();
  audioCtx.resume();
}

fileInput.addEventListener('change', (e) => {
  const [file] = e.target.files || [];
  handleFile(file);
});

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragging');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragging');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragging');
  const [file] = e.dataTransfer.files || [];
  handleFile(file);
});

playPauseBtn.addEventListener('click', () => {
  if (!audioEl.src) return;
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') audioCtx.resume();

  if (audioEl.paused) {
    audioEl.play();
    playPauseBtn.textContent = 'Pause';
  } else {
    audioEl.pause();
    playPauseBtn.textContent = 'Play';
  }
});

sceneSelect.addEventListener('change', (e) => {
  currentScene = e.target.value;
  sideState = createSideScrollerState();
  roomState = createRoomState();
});

audioEl.addEventListener('play', () => {
  playPauseBtn.textContent = 'Pause';
});

audioEl.addEventListener('pause', () => {
  playPauseBtn.textContent = 'Play';
});

function updateMetrics(time) {
  if (!analyser) return;
  analyser.getByteFrequencyData(dataArray);
  analyser.getByteTimeDomainData(timeData);

  const len = dataArray.length;
  let sum = 0, low = 0, mid = 0, high = 0;
  for (let i = 0; i < len; i++) {
    const v = dataArray[i];
    sum += v;
    if (i < len * 0.15) low += v;
    else if (i < len * 0.5) mid += v;
    else high += v;
  }

  metrics.energy = sum / len / 255;
  metrics.low = (low / (len * 0.15)) / 255;
  metrics.mid = (mid / (len * 0.35)) / 255;
  metrics.high = (high / (len * 0.5)) / 255;

  metrics.smoothedEnergy = lerp(metrics.smoothedEnergy, metrics.energy, 0.1);
  metrics.history.push(metrics.energy);
  if (metrics.history.length > 60) metrics.history.shift();
  const avgEnergy = metrics.history.reduce((a, b) => a + b, 0) / metrics.history.length;
  metrics.beat = metrics.energy > avgEnergy + 0.12;
  metrics.lastTime = time;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function renderSideScroller(time) {
  const { width, height } = getViewport();
  const state = sideState;
  const dt = Math.min((time - state.lastTime) / 1000, 0.05) || 0.016;
  state.lastTime = time;

  const baseSpeed = 110 + metrics.energy * 120;
  state.camera += baseSpeed * dt;
  if (state.camera > state.trackLength) state.camera = 0;

  const progress = state.camera / state.trackLength;
  const actIndex = Math.floor(progress * state.actColors.length) % state.actColors.length;
  const [bgTop, bgBottom] = state.actColors[actIndex];

  // Camera shake on beat
  if (metrics.beat) state.shake = 4 + metrics.energy * 4;
  state.shake = lerp(state.shake, 0, 0.1);

  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);

  // Sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, bgTop);
  sky.addColorStop(1, bgBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  // Parallax layers
  const horizon = height * 0.6;
  drawHills(width, horizon, state.parallaxSeeds[0], 0.4, '#0ea5e9', 0.6);
  drawHills(width, horizon + 30, state.parallaxSeeds[1], 0.25, '#38bdf8', 0.4);
  drawHills(width, horizon + 50, state.parallaxSeeds[2], 0.15, '#7dd3fc', 0.25);

  // Energy pulses
  if (metrics.beat) {
    state.pulses.push({ x: state.camera + 300, life: 1 });
  }
  state.pulses = state.pulses.filter(p => p.life > 0);
  state.pulses.forEach((p) => {
    p.life = lerp(p.life, 0, 0.03);
    const screenX = worldToScreenX(p.x, state.camera, width);
    ctx.save();
    ctx.globalAlpha = p.life;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(screenX - 8, horizon - 120, 16, 120 + Math.sin(time / 200) * 10);
    ctx.restore();
  });

  // Ground
  const groundPoints = buildGround(width, state.camera);
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  groundPoints.forEach((y, i) => ctx.lineTo(i, horizon - y));
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fillStyle = 'rgba(15,23,42,0.8)';
  ctx.shadowColor = 'rgba(59,130,246,0.4)';
  ctx.shadowBlur = 20;
  ctx.fill();
  ctx.shadowBlur = 0;

  // Obstacles / crystals
  ctx.fillStyle = 'rgba(14,165,233,0.8)';
  for (let i = 0; i < 6; i++) {
    const worldX = Math.floor(state.camera / 120) * 120 + i * 160;
    const screenX = worldToScreenX(worldX, state.camera, width);
    const heightMod = 40 + Math.sin(worldX * 0.01) * 20 + metrics.energy * 80;
    ctx.save();
    ctx.translate(screenX, horizon - 10 - heightMod);
    ctx.scale(1, 1 + metrics.mid * 0.4);
    ctx.beginPath();
    ctx.moveTo(0, -heightMod * 0.5);
    ctx.lineTo(20, heightMod * 0.5);
    ctx.lineTo(-20, heightMod * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Player
  const playerX = width * 0.25;
  const baseline = horizon - groundPoints[Math.floor(playerX)] + 6;
  if (metrics.beat) state.player.vy = -60 - metrics.energy * 50;
  state.player.vy += 220 * dt;
  state.player.y += state.player.vy * dt;
  if (state.player.y > baseline) {
    state.player.y = baseline;
    state.player.vy *= -0.25;
  }
  state.player.glow = lerp(state.player.glow, metrics.energy, 0.2);

  ctx.save();
  ctx.translate(playerX, state.player.y - 18);
  ctx.fillStyle = '#e0f2fe';
  ctx.shadowColor = 'rgba(255,255,255,0.7)';
  ctx.shadowBlur = 25 + state.player.glow * 30;
  const wobble = Math.sin(time / 150) * 4;
  ctx.fillRect(-14 + wobble, -14, 28, 28);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(56,189,248,0.8)';
  ctx.lineWidth = 3;
  ctx.strokeRect(-14 + wobble, -14, 28, 28);
  ctx.restore();

  // HUD
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('Act ' + (actIndex + 1), width - 70, 20);
  ctx.restore();
}

function drawHills(width, horizon, seed, amplitude, color, alpha) {
  ctx.save();
  ctx.beginPath();
  for (let x = 0; x <= width; x += 10) {
    const worldX = x + seed + sideState.camera * amplitude * 0.6;
    const y = Math.sin(worldX * 0.004) * 30 * amplitude + Math.cos(worldX * 0.002) * 20 * amplitude;
    ctx.lineTo(x, horizon - y - 40 * amplitude);
  }
  ctx.lineTo(width, horizon + 200);
  ctx.lineTo(0, horizon + 200);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.fill();
  ctx.restore();
}

function buildGround(width, camera) {
  const points = new Array(width);
  for (let x = 0; x < width; x++) {
    const worldX = x + camera;
    const terrain = Math.sin(worldX * 0.01) * 25 + Math.cos(worldX * 0.003) * 30;
    const energyBump = metrics.low * 60 + metrics.mid * 30;
    points[x] = terrain * 0.4 + energyBump;
  }
  return points;
}

function worldToScreenX(worldX, camera, width) {
  const track = sideState.trackLength;
  const normalized = ((worldX - camera) % track + track) % track;
  return normalized;
}

function renderMovingRoom(time) {
  const { width, height } = getViewport();
  const state = roomState;
  const dt = Math.min((time - state.lastTime) / 1000, 0.05) || 0.016;
  state.lastTime = time;

  if (metrics.beat) state.pulse = 1;
  state.pulse = lerp(state.pulse, 0, 0.1);
  state.lean = lerp(state.lean, (metrics.mid - metrics.low) * 0.4, 0.05);
  state.colorShift = lerp(state.colorShift, metrics.high, 0.08);

  ctx.clearRect(0, 0, width, height);

  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, `rgba(${30 + state.colorShift * 80}, 41, 82, 1)`);
  bg.addColorStop(1, `rgba(12, 18, 36, 1)`);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate(Math.sin(time / 6000) * 0.02 + state.lean * 0.05);
  const baseW = width * 0.65;
  const baseH = height * 0.6;
  const squish = 1 + metrics.low * 0.3 + state.pulse * 0.4;
  const depth = 160 + metrics.mid * 80 + state.pulse * 50;

  const top = -baseH / 2 * squish;
  const bottom = baseH / 2 * squish;
  const left = -baseW / 2 * (1 + metrics.mid * 0.2);
  const right = baseW / 2 * (1 + metrics.mid * 0.2);

  // Floor
  ctx.beginPath();
  ctx.moveTo(left + 40, bottom - 40);
  ctx.lineTo(0, bottom + depth);
  ctx.lineTo(0, bottom + depth);
  ctx.lineTo(right - 40, bottom - 40);
  ctx.lineTo(left + 40, bottom - 40);
  ctx.closePath();
  ctx.fillStyle = 'rgba(56,189,248,0.15)';
  ctx.strokeStyle = 'rgba(56,189,248,0.5)';
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();

  // Walls
  drawWall([left, top], [left + 50, bottom - 40], [-right + 50, bottom - 40], [-right, top]);
  drawWall([right, top], [right - 50, bottom - 40], [-left + 50, bottom - 40], [-left, top]);
  drawCeiling([left, top], [right, top], [0, bottom - depth * 0.7]);

  // Grid lines on floor
  ctx.save();
  ctx.strokeStyle = 'rgba(125,211,252,0.35)';
  ctx.lineWidth = 1;
  const gridSteps = 6;
  for (let i = 1; i < gridSteps; i++) {
    const t = i / gridSteps;
    const x = lerp(left + 40, right - 40, t);
    ctx.beginPath();
    ctx.moveTo(x, bottom - 40);
    ctx.lineTo(lerp(0, x, 0.1), bottom + depth * 0.8);
    ctx.stroke();
  }
  for (let j = 1; j < gridSteps; j++) {
    const t = j / gridSteps;
    const y = lerp(bottom - 40, bottom + depth * 0.6, t);
    ctx.beginPath();
    ctx.moveTo(left + 40, y - t * 20);
    ctx.lineTo(right - 40, y - t * 20);
    ctx.stroke();
  }
  ctx.restore();

  // Performer zone
  const bass = metrics.low;
  const performerRadius = 35 + bass * 90 + state.pulse * 30;
  ctx.save();
  ctx.shadowColor = 'rgba(236, 72, 153, 0.8)';
  ctx.shadowBlur = 30 + bass * 40;
  ctx.fillStyle = `rgba(236,72,153,${0.45 + bass * 0.35})`;
  ctx.beginPath();
  ctx.arc(0, 20 - state.pulse * 15, performerRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(59,130,246,0.8)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  // Camera vignette
  const vignette = ctx.createRadialGradient(0, 0, Math.min(width, height) * 0.2, 0, 0, Math.max(width, height) * 0.7);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = vignette;
  ctx.fillRect(-width, -height, width * 2, height * 2);

  ctx.restore();
}

function drawWall(a, b, c, d) {
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.lineTo(c[0], c[1]);
  ctx.lineTo(d[0], d[1]);
  ctx.closePath();
  ctx.fillStyle = 'rgba(59,130,246,0.08)';
  ctx.strokeStyle = 'rgba(59,130,246,0.4)';
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();
}

function drawCeiling(leftTop, rightTop, anchor) {
  ctx.beginPath();
  ctx.moveTo(leftTop[0], leftTop[1]);
  ctx.lineTo(anchor[0], anchor[1]);
  ctx.lineTo(rightTop[0], rightTop[1]);
  ctx.closePath();
  ctx.fillStyle = 'rgba(14,165,233,0.08)';
  ctx.strokeStyle = 'rgba(14,165,233,0.3)';
  ctx.fill();
  ctx.stroke();
}

function drawIdle() {
  const { width, height } = getViewport();
  ctx.clearRect(0, 0, width, height);
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, '#0f172a');
  grad.addColorStop(1, '#1e293b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '18px system-ui, sans-serif';
  ctx.fillText('Drop an audio file to launch a tiny music film', 24, height / 2);
}

function loop(time) {
  if (!running || !analyser) {
    drawIdle();
    requestAnimationFrame(loop);
    return;
  }

  updateMetrics(time);

  if (currentScene === 'side-scroller') {
    renderSideScroller(time);
  } else {
    renderMovingRoom(time);
  }

  requestAnimationFrame(loop);
}

loop(0);
