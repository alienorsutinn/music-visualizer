// Offscreen document responsible for Web Audio analysis of the captured tab stream.
// Receives MediaStream from the background, pipes it into an analyser, and emits
// frequency magnitudes back to the background for the visualizer page.

let audioContext;
let analyser;
let dataArray;
let animationId;

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'BEGIN_PROCESSING' && message.stream) {
    startAnalyser(message.stream);
  }
});

async function startAnalyser(stream) {
  if (audioContext) {
    return;
  }

  audioContext = new AudioContext();
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.85;

  const source = audioContext.createMediaStreamSource(stream);
  source.connect(analyser);

  const bufferLength = analyser.frequencyBinCount;
  dataArray = new Uint8Array(bufferLength);

  const tick = () => {
    analyser.getByteFrequencyData(dataArray);
    chrome.runtime.sendMessage({ type: 'AUDIO_DATA', payload: Array.from(dataArray) });
    animationId = requestAnimationFrame(tick);
  };

  tick();
}

self.addEventListener('unload', () => {
  if (animationId) cancelAnimationFrame(animationId);
  if (audioContext) audioContext.close();
});
