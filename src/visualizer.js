const startButton = document.getElementById('start');
const stopButton = document.getElementById('stop');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

let audioContext;
let analyser;
let source;
let dataArray;
let animationId;
let stream;

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

async function startVisualizer() {
  if (audioContext) {
    return;
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new AudioContext();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;

    source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);

    draw();
  } catch (error) {
    console.error('Error accessing microphone:', error);
  }
}

function stopVisualizer() {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }

  if (audioContext) {
    audioContext.close();
    audioContext = null;
    analyser = null;
    source = null;
    dataArray = null;
  }
}

function draw() {
  if (!analyser || !dataArray) return;

  analyser.getByteFrequencyData(dataArray);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const barWidth = (canvas.width / dataArray.length) * 1.5;
  let x = 0;

  for (let i = 0; i < dataArray.length; i++) {
    const barHeight = dataArray[i];
    const gradient = ctx.createLinearGradient(0, canvas.height, 0, canvas.height - barHeight);
    gradient.addColorStop(0, '#0f172a');
    gradient.addColorStop(1, '#22d3ee');

    ctx.fillStyle = gradient;
    ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

    x += barWidth + 1;
  }

  animationId = requestAnimationFrame(draw);
}

startButton.addEventListener('click', startVisualizer);
stopButton.addEventListener('click', stopVisualizer);
