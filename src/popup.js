const startButton = document.getElementById('start-capture');
const statusEl = document.getElementById('status');

startButton.addEventListener('click', async () => {
  startButton.disabled = true;
  startButton.textContent = 'Starting…';
  statusEl.textContent = '';

  try {
    const response = await chrome.runtime.sendMessage({ type: 'START_TAB_CAPTURE' });
    if (response?.ok) {
      window.close();
      return;
    }

    const reason = response?.error || 'Unable to start tab audio capture.';
    statusEl.textContent = reason;
  } catch (err) {
    statusEl.textContent = 'Extension could not start capture. Check permissions and try again.';
  } finally {
    startButton.disabled = false;
    startButton.textContent = 'Capture this tab and open visualizer';
  }
});
