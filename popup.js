let allTabs = [];
let allTabGroups = {};
let allBookmarks = [];
let expandedFolders = new Set();
let filteredTabs = [];
let selectedIndex = -1;
let previouslySelectedId = null;

// Get parameters from URL
const urlParams = new URLSearchParams(window.location.search);
let activeCommand = urlParams.get('command') || "toggle-fuzzy-finder";
let currentTabId = urlParams.get('currentTabId');

document.addEventListener('DOMContentLoaded', function() {
  const input = document.getElementById('fuzzy-finder-input');
  const resultsContainer = document.getElementById('fuzzy-finder-results');

  // Close any other popup windows when this popup opens
  chrome.windows.getAll({ windowTypes: ['popup'] }, (windows) => {
    windows.forEach((window) => {
      if (window.id !== chrome.windows.WINDOW_ID_CURRENT &&
          window.tabs && window.tabs[0] && window.tabs[0].url &&
          window.tabs[0].url.includes('popup.html')) {
        chrome.windows.remove(window.id);
      }
    });
  });

  // Set placeholder based on command
  input.placeholder =
    activeCommand === "toggle-group-finder" ? "search tab groups or create new..." :
    activeCommand === "toggle-bookmark-finder" ? "search bookmark folders..." :
    activeCommand === "toggle-bookmark-opener" ? "search bookmarks..." :
    "search tabs...";

  // Fetch data based on command
  if (activeCommand === "toggle-bookmark-finder" || activeCommand === "toggle-bookmark-opener") {
    chrome.runtime.sendMessage({ action: "getAllBookmarks" }, (response) => {
      allBookmarks = response.bookmarkTreeNodes;
      expandedFolders.clear();
      if (activeCommand === "toggle-bookmark-opener") {
        function expandAllFolders(nodes) {
          nodes.forEach(node => {
            if (node.children) {
              expandedFolders.add(node.id);
              expandAllFolders(node.children);
            }
          });
        }
        expandAllFolders(allBookmarks);
      }
      fuzzySearchAndDisplay("", activeCommand);
    });
  } else {
    chrome.runtime.sendMessage({ action: "getAllTabs" }, (response) => {
      allTabs = response.tabs;
      allTabGroups = response.tabGroups.reduce((acc, group) => {
        acc[group.id] = group;
        return acc;
      }, {});
      if (currentTabId) {
        fuzzySearchAndDisplay("", activeCommand, currentTabId);
      } else {
        // Fallback: get current tab if not provided via URL (for extension icon clicks)
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            const fallbackCurrentTabId = tabs[0].id;
            fuzzySearchAndDisplay("", activeCommand, fallbackCurrentTabId);
          }
        });
      }
    });
  }

  // Input event listener
  input.addEventListener('input', (event) => {
    if (activeCommand === "toggle-bookmark-finder" || activeCommand === "toggle-bookmark-opener") {
      fuzzySearchAndDisplay(event.target.value, activeCommand);
    } else {
      if (currentTabId) {
        fuzzySearchAndDisplay(event.target.value, activeCommand, currentTabId);
      } else {
        // Fallback: get current tab if not provided via URL (for extension icon clicks)
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            const fallbackCurrentTabId = tabs[0].id;
            fuzzySearchAndDisplay(event.target.value, activeCommand, fallbackCurrentTabId);
          }
        });
      }
    }
  });

  // Keyboard handling
  document.addEventListener('keydown', (event) => {
    if (!filteredTabs || filteredTabs.length === 0) return;

    const specialKeys = ['Escape', 'ArrowDown', 'ArrowUp', 'Enter', 'ArrowLeft', 'ArrowRight'];
    if (specialKeys.includes(event.key)) {
      event.preventDefault();
      if (event.key === 'Escape') {
        window.close();
      } else if (event.key === 'ArrowDown') {
        if (activeCommand === "toggle-bookmark-opener") {
          let nextIndex = selectedIndex + 1;
          while (nextIndex < filteredTabs.length && filteredTabs[nextIndex].isFolder) {
            nextIndex++;
          }
          if (nextIndex < filteredTabs.length) {
            selectedIndex = nextIndex;
            highlightSelection();
          }
        } else {
          selectedIndex = Math.min(selectedIndex + 1, filteredTabs.length - 1);
          highlightSelection();
        }
      } else if (event.key === 'ArrowUp') {
        if (activeCommand === "toggle-bookmark-opener") {
          let prevIndex = selectedIndex - 1;
          while (prevIndex >= 0 && filteredTabs[prevIndex].isFolder) {
            prevIndex--;
          }
          if (prevIndex >= 0) {
            selectedIndex = prevIndex;
            highlightSelection();
          }
        } else {
          selectedIndex = Math.max(selectedIndex - 1, 0);
          highlightSelection();
        }
      } else if (event.key === 'ArrowRight') {
        if (activeCommand === "toggle-bookmark-opener" && selectedIndex !== -1 && filteredTabs[selectedIndex] && filteredTabs[selectedIndex].isFolder) {
          const folderId = filteredTabs[selectedIndex].bookmark.id;
          expandedFolders.add(folderId);
          previouslySelectedId = filteredTabs[selectedIndex].bookmark.id;
          fuzzySearchAndDisplay(document.getElementById("fuzzy-finder-input").value, activeCommand);
        }
      } else if (event.key === 'ArrowLeft') {
        if (activeCommand === "toggle-bookmark-opener" && selectedIndex !== -1 && filteredTabs[selectedIndex] && filteredTabs[selectedIndex].isFolder) {
          const folderId = filteredTabs[selectedIndex].bookmark.id;
          expandedFolders.delete(folderId);
          previouslySelectedId = filteredTabs[selectedIndex].bookmark.id;
          fuzzySearchAndDisplay(document.getElementById("fuzzy-finder-input").value, activeCommand);
        }
      } else if (event.key === 'Enter') {
        if (selectedIndex !== -1 && filteredTabs[selectedIndex]) {
          const selected = filteredTabs[selectedIndex];
          if (selected.isFolder || selected.isBookmark) {
            previouslySelectedId = selected.bookmark.id;
          } else if (selected.tab) {
            previouslySelectedId = selected.tab.id;
          }
          if (activeCommand === "toggle-bookmark-finder") {
            if (selected.isRemoveBookmarkOption) {
              removeBookmark();
              window.close();
            } else {
              addBookmark(selected.bookmark.id);
              window.close();
            }
          } else if (activeCommand === "toggle-bookmark-opener") {
            openBookmark(selected.bookmark.url);
            window.close();
          } else if (selected.isGroup) {
            groupTab(selected.group.id);
            window.close();
          } else if (selected.isNewGroupOption) {
            groupTab(null, selected.query);
            window.close();
          } else if (selected.isRemoveFromGroupOption) {
            removeTabFromGroup();
            window.close();
          } else {
            if (activeCommand === "toggle-group-finder") {
              groupTab(null, selected.tab.title);
            } else {
              activateTab(selected.tab.id);
            }
            window.close();
          }
        } else if (activeCommand === "toggle-group-finder") {
          const newGroupName = document.getElementById("fuzzy-finder-input").value.trim();
          if (newGroupName) {
            groupTab(null, newGroupName);
            window.close();
          }
        }
      }
    }
  });

  input.focus();
});

function fuzzyMatch(pattern, text) {
  pattern = pattern.toLowerCase().replace(/ /g, '');
  text = text.toLowerCase().replace(/[.\-_]/g, ' ');
  const matchedIndices = [];
  let patternIdx = 0;
  let textIdx = 0;
  let consecutiveMatches = 0;
  let lastIndex = 0;
  while (patternIdx < pattern.length && textIdx < text.length) {
    if (pattern[patternIdx] === text[textIdx]) {
      matchedIndices.push(textIdx);
      patternIdx++;
      if (textIdx - lastIndex === 1) {
        consecutiveMatches++;
      }
      lastIndex = textIdx;
    }
    textIdx++;
  }
  if (patternIdx === pattern.length && (pattern.length < 3 || consecutiveMatches > pattern.length / 4 || consecutiveMatches > 2)) {
    return matchedIndices;
  } else {
    return null;
  }
}

function fuzzySearchAndDisplay(query, command, currentTabId) {
  const groups = Object.values(allTabGroups);
  let currentFilteredItems = [];

  if (command === "toggle-group-finder") {
    let matchedGroups = [];
    if (!query) {
      matchedGroups = groups.map((g) => ({
        group: g,
        isGroup: true,
        match: null,
      }));
    } else {
      matchedGroups = groups
        .filter((g) => {
          const matchedIndices = fuzzyMatch(query, g.title);
          return matchedIndices;
        })
        .map((g) => ({
          group: g,
          isGroup: true,
          match: { field: "title", indices: fuzzyMatch(query, g.title) },
        }));
    }

    matchedGroups.sort((a, b) => a.group.title.localeCompare(b.group.title));
    currentFilteredItems = matchedGroups;

    currentFilteredItems.push({ isNewGroupOption: true, query: query });
    currentFilteredItems.push({ isRemoveFromGroupOption: true });
  } else if (command === "toggle-bookmark-finder") {
    const bookmarkFolders = [];
    function traverseBookmarks(nodes, level) {
      nodes.forEach((node) => {
        if (node.children) {
          if (String(node.title).trim() !== "") {
            bookmarkFolders.push({
              bookmark: { ...node, title: node.title || "" },
              isFolder: true,
              level: level,
              match: null,
              isExpanded: false,
            });
          }
          traverseBookmarks(node.children, level + 1);
        }
      });
    }
    traverseBookmarks(allBookmarks, 0);

    if (!query) {
      currentFilteredItems = bookmarkFolders;
    } else {
      currentFilteredItems = bookmarkFolders.filter((item) => {
        const matchedIndices = fuzzyMatch(query, item.bookmark.title);
        if (matchedIndices) {
          item.match = { field: "title", indices: matchedIndices };
          return true;
        }
        return false;
      });
    }
    currentFilteredItems.push({ isRemoveBookmarkOption: true });
  } else if (command === "toggle-bookmark-opener") {
    function buildDisplayList(nodes, query, level, parentPath) {
      let displayList = [];
      nodes.forEach((node) => {
        const currentPath = parentPath
          ? `${parentPath} > ${String(node.title) || ""}`
          : String(node.title) || "";
        if (node.url) {
          const matchedIndicesTitle = fuzzyMatch(query, node.title || "");
          const matchedIndicesUrl = fuzzyMatch(query, node.url);
          const matchedIndicesPath = fuzzyMatch(query, currentPath);

          if (!query || matchedIndicesTitle || matchedIndicesUrl || matchedIndicesPath) {
            let match = null;
            if (matchedIndicesTitle) {
              match = { field: "title", indices: matchedIndicesTitle };
            } else if (matchedIndicesUrl) {
              match = { field: "url", indices: matchedIndicesUrl };
            } else if (matchedIndicesPath) {
              match = { field: "path", indices: matchedIndicesPath };
            }
            displayList.push({
              bookmark: { ...node, title: node.title || "" },
              isBookmark: true,
              level: level,
              path: currentPath,
              match: match,
            });
          }
        } else if (node.children) {
          const hasTitle = String(node.title).trim() !== "";
          const matchedIndicesTitle = fuzzyMatch(query, node.title || "");
          const matchedIndicesPath = fuzzyMatch(query, currentPath);

          const childrenDisplayList = buildDisplayList(
            node.children,
            query,
            level + 1,
            currentPath,
          );

          let shouldExpand = false;
          if (query) {
            shouldExpand =
              childrenDisplayList.some((item) => item.isBookmark) ||
              matchedIndicesTitle ||
              matchedIndicesPath;
          } else {
            shouldExpand = expandedFolders.has(node.id);
          }

          if (hasTitle) {
            displayList.push({
              bookmark: { ...node, title: node.title || "" },
              isFolder: true,
              level: level,
              path: currentPath,
              match:
                matchedIndicesTitle || matchedIndicesPath
                  ? {
                      field: matchedIndicesTitle ? "title" : "path",
                      indices: matchedIndicesTitle || matchedIndicesPath,
                    }
                  : null,
              isExpanded: shouldExpand,
            });
          }

          if (shouldExpand) {
            displayList = displayList.concat(childrenDisplayList);
          }
        }
      });
      return displayList;
    }

    currentFilteredItems = buildDisplayList(allBookmarks, query, 0, "");
  } else {
    // toggle-fuzzy-finder
    const tabsToFilter = allTabs.filter((tab) => tab.id !== currentTabId);
    if (!query) {
      currentFilteredItems = tabsToFilter.map((tab) => ({
        tab,
        match: null,
        isGroup: false,
      }));
    } else {
      tabsToFilter.forEach((tab) => {
        let match = null;
        let matchedIndices = fuzzyMatch(query, tab.title);
        if (matchedIndices) {
          match = { field: "title", indices: matchedIndices };
        } else {
          matchedIndices = fuzzyMatch(query, tab.url);
          if (matchedIndices) {
            match = { field: "url", indices: matchedIndices };
          }
        }

        if (match) {
          currentFilteredItems.push({ tab, match, isGroup: false });
        } else {
          const tabGroup = tab.groupId && allTabGroups[tab.groupId];
          const groupTitle = tabGroup ? tabGroup.title : "";
          matchedIndices = fuzzyMatch(query, groupTitle);
          if (matchedIndices) {
            match = { field: "group", indices: matchedIndices };
            currentFilteredItems.push({ tab, match, isGroup: false });
          }
        }
      });
    }
  }

  filteredTabs = currentFilteredItems;
  displayResults(filteredTabs, command);

  if (previouslySelectedId !== null) {
    const newIndex = filteredTabs.findIndex((item) => {
      if (item.isFolder || item.isBookmark) {
        return item.bookmark.id === previouslySelectedId;
      } else if (item.tab) {
        return item.tab.id === previouslySelectedId;
      }
      return false;
    });
    if (newIndex !== -1) {
      selectedIndex = newIndex;
    } else {
      selectedIndex = filteredTabs.length > 0 ? 0 : -1;
    }
  } else {
    selectedIndex = filteredTabs.length > 0 ? 0 : -1;
  }
  highlightSelection();
}

function highlightText(text, indices) {
  if (!indices || indices.length === 0) return text;
  let highlightedText = '';
  let lastIndex = 0;
  for (let i = 0; i < text.length; i++) {
    if (indices.includes(i)) {
      if (i > lastIndex) {
        highlightedText += text.substring(lastIndex, i);
      }
      highlightedText += `<span style="background-color: #61afef; color: black;">${text[i]}</span>`;
      lastIndex = i + 1;
    }
  }
  highlightedText += text.substring(lastIndex);
  return highlightedText;
}

function displayResults(filteredItems, command) {
  const resultsContainer = document.getElementById('fuzzy-finder-results');
  resultsContainer.innerHTML = '';

  if (filteredItems.length === 0 || (filteredItems.length === 1 && (filteredItems[0].isNewGroupOption || (filteredItems[0].isRemoveBookmarkOption && command !== "toggle-bookmark-finder")))) {
    let message = "No matching items found.";
    if (command === "toggle-bookmark-finder") {
      message = "No matching bookmark folders found.";
    } else if (command === "toggle-bookmark-opener") {
      message = "No matching bookmarks found.";
    } else if (command === "toggle-group-finder") {
      message = "No matching tabs or groups found.";
    } else {
      message = "No matching tabs found.";
    }
    resultsContainer.innerHTML = `<div style="padding: 8px; color: #aaa;">${message}</div>`;
    return;
  }

  filteredItems.forEach((item, index) => {
    const itemElement = document.createElement('div');
    itemElement.classList.add('fuzzy-finder-item');
    itemElement.style.cssText = `
      padding: 8px 12px;
      cursor: pointer;
      border-bottom: 1px solid #3a3f4b;
      display: flex;
      align-items: center;
    `;

    if (item.isGroup) {
      const groupTitle = document.createElement('div');
      groupTitle.innerHTML = `Group: ${item.match && item.match.field === "title" ? highlightText(item.group.title, item.match.indices) : item.group.title}`;
      groupTitle.style.cssText = 'font-weight: bold; color: #8be9fd;';
      itemElement.appendChild(groupTitle);
      itemElement.addEventListener('click', () => {
        groupTab(item.group.id);
        window.close();
      });
    } else if (item.isNewGroupOption) {
      const newGroupText = document.createElement('div');
      newGroupText.textContent = `Create new group: "${item.query}"`;
      newGroupText.style.cssText = 'font-weight: bold; color: #a6e22e;';
      itemElement.appendChild(newGroupText);
      itemElement.addEventListener('click', () => {
        groupTab(null, item.query);
        window.close();
      });
    } else if (item.isRemoveFromGroupOption) {
      const removeText = document.createElement('div');
      removeText.textContent = "Remove from group";
      removeText.style.cssText = 'font-weight: bold; color: #f92672;';
      itemElement.appendChild(removeText);
      itemElement.addEventListener('click', () => {
        removeTabFromGroup();
        window.close();
      });
    } else if (item.isFolder) {
      const folderName = document.createElement('div');
      const indent = '&nbsp;&nbsp;'.repeat(item.level);
      const titleHtml = item.match && item.match.field === "title" ? highlightText(item.bookmark.title || "", item.match.indices) : item.bookmark.title || "";
      const pathHtml = item.match && item.match.field === "path" ? highlightText(String(item.path) || "", item.match.indices) : String(item.path) || "";

      const expandCollapseIcon = item.isExpanded ? "▼" : "►";
      folderName.innerHTML = `${indent}<span style="color: #f1fa8c;">${expandCollapseIcon} ${titleHtml}</span>`;
      if (command === "toggle-bookmark-opener" && item.level > 0) {
        folderName.innerHTML += `<div style="font-size: 0.7em; color: #888;">${indent}${pathHtml}</div>`;
      }
      folderName.style.cssText = 'font-weight: bold;';
      itemElement.appendChild(folderName);
      itemElement.addEventListener('click', () => {
        if (command === "toggle-bookmark-opener" && item.isFolder) {
          const folderId = item.bookmark.id;
          if (expandedFolders.has(folderId)) {
            expandedFolders.delete(folderId);
          } else {
            expandedFolders.add(folderId);
          }
          fuzzySearchAndDisplay(document.getElementById("fuzzy-finder-input").value, activeCommand);
        } else if (command === "toggle-bookmark-finder") {
          addBookmark(item.bookmark.id);
          window.close();
        }
      });
    } else if (item.isRemoveBookmarkOption) {
      const removeText = document.createElement('div');
      removeText.textContent = "Remove from bookmarks";
      removeText.style.cssText = 'font-weight: bold; color: #f92672;';
      itemElement.appendChild(removeText);
      itemElement.addEventListener('click', () => {
        removeBookmark();
        window.close();
      });
    } else if (item.isBookmark) {
      const favicon = document.createElement('img');
      favicon.src = item.bookmark.favIconUrl || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
      favicon.style.cssText = 'width: 16px; height: 16px; margin-right: 8px; flex-shrink: 0;';
      itemElement.appendChild(favicon);

      const textContent = document.createElement('div');
      textContent.style.cssText = 'flex-grow: 1; overflow: hidden; white-space: nowrap;';

      const indent = '&nbsp;&nbsp;'.repeat(item.level);

      const title = document.createElement('div');
      title.innerHTML = `${indent}` + (item.match && item.match.field === "title" ? highlightText(item.bookmark.title || "", item.match.indices) : item.bookmark.title || "");
      title.style.cssText = 'font-weight: bold; overflow: hidden; text-overflow: ellipsis;';
      textContent.appendChild(title);

      const url = document.createElement('div');
      url.innerHTML = `${indent}` + (item.match && item.match.field === "url" ? highlightText(item.bookmark.url, item.match.indices) : item.bookmark.url);
      url.style.cssText = 'font-size: 0.8em; color: #aaa; overflow: hidden; text-overflow: ellipsis;';
      textContent.appendChild(url);

      const path = document.createElement('div');
      path.innerHTML = `${indent}<span style="font-size: 0.7em; color: #888;">${item.match && item.match.field === "path" ? highlightText(String(item.path) || "", item.match.indices) : String(item.path) || ""}</span>`;
      path.style.cssText = 'overflow: hidden; text-overflow: ellipsis;';
      textContent.appendChild(path);

      itemElement.appendChild(textContent);
      itemElement.addEventListener('click', () => {
        openBookmark(item.bookmark.url);
        window.close();
      });
    } else {
      // Tab item
      const favicon = document.createElement('img');
      favicon.src = item.tab.favIconUrl || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
      favicon.style.cssText = 'width: 16px; height: 16px; margin-right: 8px; flex-shrink: 0;';
      itemElement.appendChild(favicon);

      const textContent = document.createElement('div');
      textContent.style.cssText = 'flex-grow: 1; overflow: hidden; white-space: nowrap;';

      const title = document.createElement('div');
      title.innerHTML = item.match && item.match.field === "title" ? highlightText(item.tab.title, item.match.indices) : item.tab.title;
      title.style.cssText = 'font-weight: bold; overflow: hidden; text-overflow: ellipsis;';
      textContent.appendChild(title);

      const url = document.createElement('div');
      url.innerHTML = item.match && item.match.field === "url" ? highlightText(item.tab.url, item.match.indices) : item.tab.url;
      url.style.cssText = 'font-size: 0.8em; color: #aaa; overflow: hidden; text-overflow: ellipsis;';
      textContent.appendChild(url);

      if (item.tab.groupId && allTabGroups[item.tab.groupId] && allTabGroups[item.tab.groupId].title) {
        const groupName = document.createElement('div');
        const groupTitle = allTabGroups[item.tab.groupId].title;
        groupName.innerHTML = item.match && item.match.field === "group" ? `Group: ${highlightText(groupTitle, item.match.indices)}` : `Group: ${groupTitle}`;
        groupName.style.cssText = 'font-size: 0.7em; color: #888; overflow: hidden; text-overflow: ellipsis; margin-top: 2px;';
        textContent.appendChild(groupName);
      }

      itemElement.appendChild(textContent);
      itemElement.addEventListener('click', () => {
        activateTab(item.tab.id);
        window.close();
      });
    }
    resultsContainer.appendChild(itemElement);
  });
}

function highlightSelection() {
  const items = document.querySelectorAll('.fuzzy-finder-item');
  items.forEach((item, index) => {
    if (index === selectedIndex) {
      item.style.backgroundColor = '#4a4f5b';
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.style.backgroundColor = 'transparent';
    }
  });
}

function activateTab(tabId) {
  chrome.runtime.sendMessage({ action: 'activateTab', tabId: tabId });
}

function groupTab(groupId, groupName) {
  chrome.runtime.sendMessage({ action: 'groupTab', groupId, groupName });
}

function removeTabFromGroup() {
  chrome.runtime.sendMessage({ action: 'removeTabFromGroup' });
}

function addBookmark(parentId) {
  chrome.runtime.sendMessage({ action: 'addBookmark', parentId });
}

function removeBookmark() {
  chrome.runtime.sendMessage({ action: 'removeBookmark' });
}

function openBookmark(url) {
  chrome.runtime.sendMessage({ action: 'openBookmark', url: url });
}