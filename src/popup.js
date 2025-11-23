const startButton = document.getElementById('start-capture');

startButton.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'START_TAB_CAPTURE' });
  window.close();
});
