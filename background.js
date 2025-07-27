chrome.commands.onCommand.addListener((command) => {
  console.log('Command received:', command);
  if (command === 'toggle-fuzzy-finder' || command === 'toggle-group-finder') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleFuzzyFinder', command });
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
  } else if (message.action === "groupTab") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        if (message.groupId) {
          chrome.tabs.group({ tabIds: [tabs[0].id], groupId: message.groupId });
        } else {
          chrome.tabs.group({ tabIds: [tabs[0].id] }, (groupId) => {
            chrome.tabGroups.update(groupId, { title: message.groupName });
          });
        }
      }
    });
  } else if (message.action === "removeTabFromGroup") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].groupId !== -1) {
        chrome.tabs.ungroup(tabs[0].id);
      }
    });
  }
});