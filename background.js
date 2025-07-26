chrome.commands.onCommand.addListener((command) => {
  console.log('Command received:', command);
  if (command === 'toggle-fuzzy-finder') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleFuzzyFinder' });
      }
    });
  }
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.tabs.sendMessage(tab.id, { action: 'toggleFuzzyFinder' });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "activateTab") {
    chrome.tabs.update(message.tabId, { active: true });
  } else if (message.action === "getAllTabs") {
    Promise.all([
      new Promise(resolve => chrome.tabs.query({}, resolve)),
      new Promise(resolve => chrome.tabGroups.query({}, resolve))
    ]).then(([tabs, tabGroups]) => {
      sendResponse({ tabs, tabGroups });
    });
    return true; // Indicates that sendResponse will be called asynchronously
  }
});