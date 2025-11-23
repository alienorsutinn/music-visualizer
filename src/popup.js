const openButton = document.getElementById('open-visualizer');

openButton.addEventListener('click', () => {
  const url = chrome.runtime.getURL('src/visualizer.html');
  chrome.tabs.create({ url });
});
