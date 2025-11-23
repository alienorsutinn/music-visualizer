let audioContext;
let analyser;
let freqData;
let timeData;
let animationId;
let stream;
let visualizerReady = false;

function stopCapture() {
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
    freqData = null;
    timeData = null;
  }
}

function sendFrame() {
  if (!analyser || !freqData || !timeData) return;

  analyser.getByteFrequencyData(freqData);
  analyser.getByteTimeDomainData(timeData);

  if (visualizerReady) {
    chrome.runtime.sendMessage({
      type: 'AUDIO_DATA',
      frequency: Array.from(freqData),
      waveform: Array.from(timeData),
    });
  }

  animationId = requestAnimationFrame(sendFrame);
}

function startAnalyser(capturedStream) {
  audioContext = new AudioContext();
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 512;

  const source = audioContext.createMediaStreamSource(capturedStream);
  source.connect(analyser);

  freqData = new Uint8Array(analyser.frequencyBinCount);
  timeData = new Uint8Array(analyser.frequencyBinCount);

  animationId = requestAnimationFrame(sendFrame);
}

function startCapture(tabId) {
  stopCapture();

  chrome.tabCapture.capture({
    targetTabId: tabId,
    audio: true,
    video: false,
  }, (capturedStream) => {
    if (chrome.runtime.lastError || !capturedStream) {
      console.error('Tab capture failed:', chrome.runtime.lastError?.message);
      return;
    }

    stream = capturedStream;
    startAnalyser(capturedStream);
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (!message?.type) return;

  if (message.type === 'OFFSCREEN_BEGIN_CAPTURE') {
    startCapture(message.tabId);
  }

  if (message.type === 'OFFSCREEN_STOP_CAPTURE') {
    stopCapture();
  }

  if (message.type === 'OFFSCREEN_VISUALIZER_READY') {
    visualizerReady = true;
  }
});
