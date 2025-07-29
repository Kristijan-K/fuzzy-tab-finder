let currentActiveTabId = null;
let previousActiveTabId = null;

// Initialize currentActiveTabId on startup
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs[0]) {
    currentActiveTabId = tabs[0].id;
  }
});

// Update tab IDs on activation
chrome.tabs.onActivated.addListener((activeInfo) => {
  previousActiveTabId = currentActiveTabId;
  currentActiveTabId = activeInfo.tabId;
});

chrome.commands.onCommand.addListener((command) => {
  if (
    command === "toggle-fuzzy-finder" ||
    command === "toggle-group-finder" ||
    command === "toggle-bookmark-finder" ||
    command === "toggle-bookmark-opener"
  ) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        // Send the actual previous tab ID
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "toggleFuzzyFinder",
          command,
        });
      }
    });
  }
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.tabs.sendMessage(tab.id, { action: "toggleFuzzyFinder" });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "activateTab") {
    chrome.tabs.update(message.tabId, { active: true });
  } else if (message.action === "getAllTabs") {
    Promise.all([
      new Promise((resolve) => chrome.tabs.query({}, resolve)),
      new Promise((resolve) => chrome.tabGroups.query({}, resolve)),
    ]).then(([tabs, tabGroups]) => {
      // Sort tabs by lastAccessed in descending order
      tabs.sort((a, b) => b.lastAccessed - a.lastAccessed);
      sendResponse({ tabs, tabGroups });
    });
    return true; // Indicates that sendResponse will be called asynchronously
  } else if (message.action === "getAllBookmarks") {
    chrome.bookmarks.getTree((bookmarkTreeNodes) => {
      sendResponse({ bookmarkTreeNodes });
    });
    return true; // Indicates that sendResponse will be called asynchronously
  } else if (message.action === "getCurrentTab") {
    sendResponse({ tabId: currentActiveTabId });
    return true;
  } else if (message.action === "addBookmark") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        const { title, url } = tabs[0];
        chrome.bookmarks.search({ url }, (results) => {
          if (results.length > 0) {
            // Bookmark already exists, remove it from other folders
            results.forEach((bookmark) => {
              if (bookmark.parentId !== message.parentId) {
                chrome.bookmarks.remove(bookmark.id);
              }
            });
          }
          // Add or move the bookmark to the target folder
          chrome.bookmarks.create({ parentId: message.parentId, title, url });
        });
      }
    });
  } else if (message.action === "removeBookmark") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        const { url } = tabs[0];
        chrome.bookmarks.search({ url }, (results) => {
          results.forEach((bookmark) => {
            chrome.bookmarks.remove(bookmark.id);
          });
        });
      }
    });
  } else if (message.action === "openBookmark") {
    chrome.tabs.create({ url: message.url });
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
