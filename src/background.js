// Background service worker that opens the visualizer tab on demand.
// Updated flow: the visualizer now handles its own audio sources (microphone or uploaded files),
// so the background simply opens the visualizer page when requested from the popup.

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'OPEN_VISUALIZER') {
    const url = chrome.runtime.getURL('src/visualizer.html');
    chrome.tabs.create({ url });
    sendResponse({ ok: true });
    return true;
  }

  return false;
});
