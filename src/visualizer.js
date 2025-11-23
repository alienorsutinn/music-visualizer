(() => {
  const canvas = document.getElementById('visualizerCanvas');
  const ctx = canvas.getContext('2d');

  const filePicker = document.getElementById('filePicker');
  const playBtn = document.getElementById('playBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const modeSelect = document.getElementById('modeSelect');
  const fileNameEl = document.getElementById('fileName');
  const timeInfoEl = document.getElementById('timeInfo');
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  const app = document.getElementById('app');

  let audioContext;
  let analyser;
  let sourceNode;
  let audioEl;
  let freqData;
  let timeData;
  let smoothedData;
  let animationId;
  let currentMode = 'neon';
  let gradientShift = 0;

  function initAudio() {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.75;
    const bufferLength = analyser.frequencyBinCount;
    freqData = new Uint8Array(bufferLength);
    timeData = new Uint8Array(bufferLength);
    smoothedData = new Float32Array(bufferLength);
  }

  function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!audioContext) {
      initAudio();
    }

    if (audioEl) {
      audioEl.pause();
      if (sourceNode) sourceNode.disconnect();
    }

    const objectUrl = URL.createObjectURL(file);
    audioEl = new Audio();
    audioEl.src = objectUrl;
    audioEl.crossOrigin = 'anonymous';
    audioEl.addEventListener('loadeddata', () => URL.revokeObjectURL(objectUrl), { once: true });
    audioEl.addEventListener('timeupdate', updateTimeInfo);
    audioEl.addEventListener('ended', () => updateTimeInfo(true));

    sourceNode = audioContext.createMediaElementSource(audioEl);
    sourceNode.connect(analyser);
    sourceNode.connect(audioContext.destination);

    fileNameEl.textContent = file.name;
    updateTimeInfo();
    play();
  }

  function play() {
    if (!audioEl) return;
    if (!audioContext) initAudio();
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    audioEl.play();
    if (!animationId) animate();
  }

  function pause() {
    if (!audioEl) return;
    audioEl.pause();
    updateTimeInfo();
  }

  function setMode(value) {
    currentMode = value;
  }

  function resizeCanvas() {
    const { clientWidth, clientHeight } = canvas;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = clientWidth * dpr;
    canvas.height = clientHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function getDimensions() {
    const dpr = window.devicePixelRatio || 1;
    return {
      width: canvas.width / dpr,
      height: canvas.height / dpr,
    };
  }

  function formatTime(seconds) {
    if (Number.isNaN(seconds)) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  function updateTimeInfo(ended = false) {
    if (!audioEl) return;
    const current = ended ? audioEl.duration : audioEl.currentTime;
    const duration = audioEl.duration || 0;
    timeInfoEl.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
  }

  function getAverageEnergy(range = 64) {
    let total = 0;
    const limit = Math.min(range, smoothedData.length);
    for (let i = 0; i < limit; i += 1) {
      total += smoothedData[i];
    }
    return total / limit;
  }

  function drawBackground() {
    gradientShift += 0.0015;
    const { width, height } = getDimensions();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Hard clear the canvas before drawing, preventing previous frames from stacking.
    ctx.clearRect(0, 0, width, height);

    const g = ctx.createLinearGradient(0, 0, width, height);
    const shift = (Math.sin(gradientShift) + 1) / 2;
    g.addColorStop(0, `rgb(12, 18, 34)`);
    g.addColorStop(1, `rgb(${18 + shift * 24}, ${38 + shift * 38}, 72)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);

    // Subtle, deterministic glow bands to add motion without leaving trails.
    const glow = ctx.createRadialGradient(width * 0.25, height * 0.2, 80, width * 0.25, height * 0.2, width * 0.8);
    glow.addColorStop(0, 'rgba(90, 150, 255, 0.08)');
    glow.addColorStop(1, 'rgba(90, 150, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    const glow2 = ctx.createRadialGradient(width * 0.8, height * 0.15, 40, width * 0.8, height * 0.15, width * 0.6);
    glow2.addColorStop(0, 'rgba(255, 124, 210, 0.08)');
    glow2.addColorStop(1, 'rgba(255, 124, 210, 0)');
    ctx.fillStyle = glow2;
    ctx.fillRect(0, 0, width, height);

    ctx.restore();
  }

  function drawNeonBars() {
    const { width, height } = getDimensions();
    const barCount = 96;
    const step = Math.floor(smoothedData.length / barCount);
    const barWidth = width / barCount;

    const gradient = ctx.createLinearGradient(0, 0, 0, height * 0.6);
    gradient.addColorStop(0, '#7b5bff');
    gradient.addColorStop(0.5, '#ff4fbf');
    gradient.addColorStop(1, '#36d1ff');

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < barCount; i += 1) {
      const value = smoothedData[i * step] / 255;
      const barHeight = value * (height * 0.6);
      const x = i * barWidth;
      const y = height - barHeight;

      ctx.fillStyle = gradient;
      ctx.shadowBlur = 16;
      ctx.shadowColor = 'rgba(54, 209, 255, 0.6)';
      ctx.fillRect(x, y, barWidth * 0.8, barHeight);
    }
    ctx.restore();

    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(0, height - 2, width, 2);
    ctx.restore();
  }

  function drawHaloRing() {
    const { width, height } = getDimensions();
    const cx = width / 2;
    const cy = height / 2;
    const barCount = 120;
    const step = Math.floor(smoothedData.length / barCount);
    const baseRadius = Math.min(width, height) * 0.22;
    const energy = getAverageEnergy(80) / 255;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(gradientShift * 0.8);

    const hueShift = Math.floor(200 + 80 * energy);
    for (let i = 0; i < barCount; i += 1) {
      const value = smoothedData[i * step] / 255;
      const angle = (i / barCount) * Math.PI * 2;
      const radius = baseRadius + value * baseRadius * 0.8;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;

      ctx.strokeStyle = `hsla(${hueShift + i * 0.6}, 90%, ${60 + value * 20}%, 0.9)`;
      ctx.lineWidth = 3 + value * 6;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * baseRadius, Math.sin(angle) * baseRadius);
      ctx.lineTo(x, y);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.strokeStyle = `hsla(${hueShift + 40}, 80%, 65%, 0.6)`;
    ctx.lineWidth = 4;
    const pulse = baseRadius * (0.95 + energy * 0.1);
    ctx.arc(0, 0, pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawLiquidBlob() {
    const { width, height } = getDimensions();
    const cx = width / 2;
    const cy = height / 2;
    const points = 120;
    const step = Math.floor(smoothedData.length / points);
    const baseRadius = Math.min(width, height) * 0.18;
    const energy = getAverageEnergy(50) / 255;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    for (let i = 0; i <= points; i += 1) {
      const angle = (i / points) * Math.PI * 2;
      const value = smoothedData[(i % points) * step] / 255;
      const radius = baseRadius + value * baseRadius * 0.8 + Math.sin(gradientShift * 2 + angle) * 8;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();

    const gradient = ctx.createRadialGradient(0, 0, baseRadius * 0.3, 0, 0, baseRadius * 1.4);
    gradient.addColorStop(0, `rgba(130, 222, 255, 0.8)`);
    gradient.addColorStop(1, `rgba(196, 124, 255, ${0.4 + energy * 0.3})`);

    ctx.fillStyle = gradient;
    ctx.shadowBlur = 40;
    ctx.shadowColor = 'rgba(130, 222, 255, 0.5)';
    ctx.fill();

    ctx.lineWidth = 3;
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.35 + energy * 0.2})`;
    ctx.stroke();
    ctx.restore();
  }

  function animate() {
    animationId = requestAnimationFrame(animate);
    if (!analyser || !freqData) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    analyser.getByteFrequencyData(freqData);
    analyser.getByteTimeDomainData(timeData);
    for (let i = 0; i < freqData.length; i += 1) {
      smoothedData[i] += (freqData[i] - smoothedData[i]) * 0.08;
    }

    drawBackground();

    ctx.save();
    ctx.translate(0.5, 0.5);
    switch (currentMode) {
      case 'halo':
        drawHaloRing();
        break;
      case 'blob':
        drawLiquidBlob();
        break;
      default:
        drawNeonBars();
    }
    ctx.restore();
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      app.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen();
    }
  }

  function init() {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    filePicker.addEventListener('change', handleFileSelect);
    playBtn.addEventListener('click', play);
    pauseBtn.addEventListener('click', pause);
    modeSelect.addEventListener('change', (e) => setMode(e.target.value));
    fullscreenBtn.addEventListener('click', toggleFullscreen);

    animate();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
