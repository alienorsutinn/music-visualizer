const OFFSCREEN_DOCUMENT_PATH = 'src/offscreen.html';
let lastCapturedTabId = null;

async function ensureOffscreenDocument() {
  if (!chrome.offscreen) {
    console.warn('Offscreen API is unavailable; audio forwarding will not start.');
    return;
  }

  if (await chrome.offscreen.hasDocument?.()) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Process captured tab audio and forward analyser data to the visualizer.',
  });
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('Aurora Pulse installed');
});

// Message handler coordinates capture requests and relays commands to the offscreen page.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message?.type) return;

  if (message.type === 'START_TAB_CAPTURE') {
    (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab?.id) {
        sendResponse({ ok: false, error: 'No active tab found.' });
        return;
      }

      lastCapturedTabId = tab.id;
      await ensureOffscreenDocument();

      // Tell the offscreen document to start capturing this tab.
      await chrome.runtime.sendMessage({ type: 'OFFSCREEN_BEGIN_CAPTURE', tabId: lastCapturedTabId });

      sendResponse({ ok: true, tabId: lastCapturedTabId });
    })();

    return true; // Keep the message channel open for async sendResponse.
  }

  if (message.type === 'VISUALIZER_READY') {
    chrome.runtime.sendMessage({ type: 'OFFSCREEN_VISUALIZER_READY' });
    sendResponse?.({ acknowledged: true });
    return;
  }

  if (message.type === 'STOP_CAPTURE') {
    chrome.runtime.sendMessage({ type: 'OFFSCREEN_STOP_CAPTURE' });
    sendResponse?.({ stopped: true });
    return;
  }

  if (message.type === 'RESTART_CAPTURE') {
    (async () => {
      if (!lastCapturedTabId) {
        sendResponse({ ok: false, error: 'No tab capture session recorded yet.' });
        return;
      }

      await ensureOffscreenDocument();
      await chrome.runtime.sendMessage({ type: 'OFFSCREEN_BEGIN_CAPTURE', tabId: lastCapturedTabId });
      sendResponse({ ok: true, tabId: lastCapturedTabId });
    })();

    return true;
  }
});
