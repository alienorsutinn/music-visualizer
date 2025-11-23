// Background service worker orchestrating tab capture and visualizer communication.
// Flow:
// 1. Popup sends START_TAB_CAPTURE -> background captures the current active tab's audio via chrome.tabCapture.
// 2. Background opens the visualizer tab (extension page) and keeps the MediaStream in memory.
// 3. Visualizer sends VISUALIZER_READY -> background ensures an offscreen document is running and passes the stream to it.
// 4. Offscreen document performs Web Audio analysis and streams frequency data back to background.
// 5. Background relays the analysed data to the visualizer so the UI renders the modes.

let capturedStream = null;
let visualizerTabId = null;
let offscreenCreated = false;

const OFFSCREEN_URL = chrome.runtime.getURL('src/offscreen.html');

chrome.runtime.onInstalled.addListener(() => {
  console.log('Aurora Pulse installed');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'START_TAB_CAPTURE') {
    handleStartCapture().then(sendResponse);
    return true;
  }

  if (message?.type === 'VISUALIZER_READY') {
    // Ensure the offscreen document exists and deliver the captured stream for analysis.
    ensureOffscreenDocument().then((ready) => {
      if (!ready) {
        console.warn('Offscreen document unavailable; cannot start analyser.');
        return;
      }
      if (capturedStream) {
        try {
          chrome.runtime.sendMessage(
            { type: 'BEGIN_PROCESSING', stream: capturedStream },
            { transfer: [capturedStream] },
          );
        } catch (err) {
          console.error('Failed to transfer MediaStream to offscreen document:', err);
        }
      } else {
        console.warn('No captured stream available when visualizer requested data.');
      }
    });
    return true;
  }

  if (message?.type === 'AUDIO_DATA' && visualizerTabId) {
    chrome.tabs.sendMessage(visualizerTabId, message);
    return true;
  }

  if (message?.type === 'VISUALIZER_PORT' && sender?.tab?.id) {
    visualizerTabId = sender.tab.id;
    return true;
  }

  return false;
});

async function handleStartCapture() {
  try {
    if (!chrome.tabCapture || typeof chrome.tabCapture.capture !== 'function') {
      const reason = 'chrome.tabCapture.capture is unavailable; check permissions and browser support.';
      console.error(reason);
      return { ok: false, error: reason };
    }

    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.id) {
      console.warn('No active tab found for capture.');
      return { ok: false, error: 'No active tab found to capture.' };
    }

    const stream = await new Promise((resolve, reject) => {
      chrome.tabCapture.capture(
        {
          audio: true,
          video: false,
          consumerTabId: activeTab.id,
        },
        (captured) => {
          if (chrome.runtime.lastError || !captured) {
            reject(chrome.runtime.lastError || new Error('Failed to capture tab audio'));
          } else {
            resolve(captured);
          }
        },
      );
    });

    capturedStream = stream;

    const url = chrome.runtime.getURL('src/visualizer.html');
    const { id } = await chrome.tabs.create({ url });
    visualizerTabId = id;
    return { ok: true };
  } catch (error) {
    console.error('Error during tab capture:', error);
    return { ok: false, error: error?.message || 'Failed to capture tab audio.' };
  }
}

async function ensureOffscreenDocument() {
  if (!chrome.offscreen) {
    console.warn('chrome.offscreen API is unavailable in this context.');
    return false;
  }

  if (offscreenCreated) return true;

  const contexts = await chrome.offscreen.hasDocument?.();
  if (contexts) {
    offscreenCreated = true;
    return true;
  }

  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Process captured tab audio and stream analyser data to the visualizer.',
    });
    offscreenCreated = true;
    return true;
  } catch (err) {
    console.error('Failed to create offscreen document:', err);
    return false;
  }
}
