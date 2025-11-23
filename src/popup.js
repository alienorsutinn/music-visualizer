const openButton = document.getElementById('open-visualizer');
const statusEl = document.getElementById('status');

openButton.addEventListener('click', async () => {
  openButton.disabled = true;
  openButton.textContent = 'Opening…';
  statusEl.textContent = '';

  try {
    const response = await chrome.runtime.sendMessage({ type: 'OPEN_VISUALIZER' });
    if (response?.ok) {
      window.close();
      return;
    }

    const reason = response?.error || 'Unable to open the visualizer tab.';
    statusEl.textContent = reason;
  } catch (err) {
    statusEl.textContent = 'Extension could not open the visualizer. Please try again.';
  } finally {
    openButton.disabled = false;
    openButton.textContent = 'Open visualizer';
  }
});
