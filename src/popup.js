const openButton = document.getElementById('open-visualizer');

async function handleOpenClick() {
  openButton.disabled = true;
  openButton.textContent = 'Preparing capture...';

  try {
    const response = await chrome.runtime.sendMessage({ type: 'START_TAB_CAPTURE' });

    if (!response?.ok) {
      throw new Error(response?.error || 'Unable to start tab capture');
    }

    const url = chrome.runtime.getURL('src/visualizer.html');
    await chrome.tabs.create({ url });
  } catch (error) {
    console.error(error);
    openButton.textContent = 'Capture failed. Try again?';
  } finally {
    openButton.disabled = false;
    openButton.textContent = 'Capture this tab and open visualizer';
  }
}

openButton.addEventListener('click', handleOpenClick);
