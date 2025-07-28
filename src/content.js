let overlay = null;
let allTabs = [];
let allTabGroups = {}; // New variable to store tab groups
let allBookmarks = []; // New variable to store bookmark folders
let expandedFolders = new Set(); // To keep track of expanded folders
let filteredTabs = [];
let selectedIndex = -1;
let previouslySelectedId = null; // To remember the last selected item
let activeCommand = null; // New global variable to store the active command

function createOverlay(command) {
  // Remove existing overlay if any
  if (overlay) {
    overlay.remove();
    overlay = null;
  }

  activeCommand = command; // Store the active command

  // Create overlay div
  overlay = document.createElement("div");
  overlay.id = "fuzzy-finder-overlay";
  overlay.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background-color: #282c34;
    color: white;
    padding: 10px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 2147483647;
    width: 900px; /* Increased width */
    height: 50vh; /* Fixed height */
    display: flex;
    flex-direction: column;
    font-family: monospace, monospace;
  `;

  const input = document.createElement("input");
  input.type = "text";
  input.id = "fuzzy-finder-input";
  input.placeholder =
    activeCommand === "toggle-group-finder"
      ? "search tab groups or create new..."
      : activeCommand === "toggle-bookmark-finder"
        ? "search bookmark folders..."
        : activeCommand === "toggle-bookmark-opener"
          ? "search bookmarks..."
          : "search tabs...";
  // Prevent browser autocompletion and suggestions
  input.autocomplete = "off";
  input.autocorrect = "off";
  input.autocapitalize = "off";
  input.spellcheck = false;
  input.style.cssText = `
    width: 100%;
    padding: 8px 12px;
    font-size: 16px;
    border: none;
    border-radius: 4px;
    outline: none;
    background-color: #3a3f4b;
    color: white;
    margin-bottom: 10px;
  `;

  // Create results container
  const resultsContainer = document.createElement("div");
  resultsContainer.id = "fuzzy-finder-results";
  resultsContainer.style.cssText = `
    flex-grow: 1;
    overflow-y: auto;
  `;

  overlay.appendChild(input);
  overlay.appendChild(resultsContainer);
  document.body.appendChild(overlay);

  // Focus input
  input.focus();

  // Fetch all tabs and tab groups
  if (
    activeCommand === "toggle-bookmark-finder" ||
    activeCommand === "toggle-bookmark-opener"
  ) {
    chrome.runtime.sendMessage({ action: "getAllBookmarks" }, (response) => {
      allBookmarks = response.bookmarkTreeNodes;
      expandedFolders.clear(); // Clear previous state
      if (activeCommand === "toggle-bookmark-opener") {
        // Only expand all for bookmark opener
        function expandAllFolders(nodes) {
          nodes.forEach((node) => {
            if (node.children) {
              expandedFolders.add(node.id);
              expandAllFolders(node.children);
            }
          });
        }
        expandAllFolders(allBookmarks);
      }
      fuzzySearchAndDisplay("", activeCommand); // Display all bookmarks initially
    });
  } else {
    chrome.runtime.sendMessage({ action: "getAllTabs" }, (response) => {
      allTabs = response.tabs;
      allTabGroups = response.tabGroups.reduce((acc, group) => {
        acc[group.id] = group;
        return acc;
      }, {});
      fuzzySearchAndDisplay("", activeCommand); // Display all tabs initially
    });
  }

  // Input event listener for fuzzy searching
  input.addEventListener("input", (event) => {
    fuzzySearchAndDisplay(event.target.value, activeCommand);
  });

  // Store removeOverlay on overlay for external access
  overlay.removeOverlay = removeOverlay;
}

function removeOverlay() {
  if (overlay) {
    overlay.remove();
    overlay = null;
    selectedIndex = -1; // Reset selection
    previouslySelectedId = null; // Reset previously selected ID
  }
}
// Keyboard handling (moved outside createOverlay)
function onKeyDown(event) {
  // If the overlay is not active, do nothing.
  if (!overlay) {
    return;
  }

  // Check if the key is one of the special keys that control the overlay.
  const specialKeys = [
    "Escape",
    "ArrowDown",
    "ArrowUp",
    "Enter",
    "ArrowLeft",
    "ArrowRight",
  ];
  if (specialKeys.includes(event.key)) {
    event.preventDefault(); // Prevent default browser actions (e.g., scrolling for arrow keys)
    event.stopPropagation(); // Stop event from propagating further to other listeners

    if (event.key === "Escape") {
      removeOverlay();
    } else if (event.key === "ArrowDown") {
      selectedIndex = Math.min(selectedIndex + 1, filteredTabs.length - 1);
      highlightSelection();
    } else if (event.key === "ArrowUp") {
      selectedIndex = Math.max(selectedIndex - 1, 0);
      highlightSelection();
    } else if (event.key === "ArrowRight") {
      if (
        activeCommand === "toggle-bookmark-opener" &&
        selectedIndex !== -1 &&
        filteredTabs[selectedIndex] &&
        filteredTabs[selectedIndex].isFolder
      ) {
        const folderId = filteredTabs[selectedIndex].bookmark.id;
        expandedFolders.add(folderId);
        previouslySelectedId = filteredTabs[selectedIndex].bookmark.id; // Store current selection
        fuzzySearchAndDisplay(
          document.getElementById("fuzzy-finder-input").value,
          activeCommand,
        );
      }
    } else if (event.key === "ArrowLeft") {
      if (
        activeCommand === "toggle-bookmark-opener" &&
        selectedIndex !== -1 &&
        filteredTabs[selectedIndex] &&
        filteredTabs[selectedIndex].isFolder
      ) {
        const folderId = filteredTabs[selectedIndex].bookmark.id;
        expandedFolders.delete(folderId);
        previouslySelectedId = filteredTabs[selectedIndex].bookmark.id; // Store current selection
        fuzzySearchAndDisplay(
          document.getElementById("fuzzy-finder-input").value,
          activeCommand,
        );
      }
    } else if (event.key === "Enter") {
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
          } else {
            addBookmark(selected.bookmark.id);
          }
          removeOverlay();
        } else if (activeCommand === "toggle-bookmark-opener") {
          openBookmark(selected.bookmark.url);
          removeOverlay();
        } else if (selected.isGroup) {
          groupTab(selected.group.id);
          removeOverlay();
        } else if (selected.isNewGroupOption) {
          groupTab(null, selected.query);
          removeOverlay();
        } else if (selected.isRemoveFromGroupOption) {
          removeTabFromGroup();
          removeOverlay();
        } else {
          if (activeCommand === "toggle-group-finder") {
            groupTab(null, selected.tab.title);
          } else {
            activateTab(selected.tab.id);
          }
          removeOverlay();
        }
      } else if (activeCommand === "toggle-group-finder") {
        const newGroupName = document
          .getElementById("fuzzy-finder-input")
          .value.trim();
        if (newGroupName) {
          groupTab(null, newGroupName);
          removeOverlay();
        }
      }
    }
  }
  // If it's not a special key, do nothing. Let the event propagate naturally
  // to the input field so typing works.
}

document.addEventListener("keydown", onKeyDown, true); // Registered once

function fuzzyMatch(pattern, text) {
  pattern = pattern.toLowerCase();
  text = text.toLowerCase();
  const matchedIndices = [];
  let patternIdx = 0;
  let textIdx = 0;
  while (patternIdx < pattern.length && textIdx < text.length) {
    if (pattern[patternIdx] === text[textIdx]) {
      matchedIndices.push(textIdx);
      patternIdx++;
    }
    textIdx++;
  }
  if (patternIdx === pattern.length) {
    return matchedIndices;
  } else {
    return null;
  }
}

function fuzzySearchAndDisplay(query, command) {
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
          // It's a folder
          if (String(node.title).trim() !== "") {
            // Only add to display list if it has a title
            bookmarkFolders.push({
              bookmark: { ...node, title: node.title || "" },
              isFolder: true,
              level: level,
              match: null,
              isExpanded: false, // Always false for alt+b as expand/collapse is disabled
            });
          }
          // Always traverse children for alt+b to find all titled folders
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
    // Always add the remove bookmark option, regardless of query
    currentFilteredItems.push({ isRemoveBookmarkOption: true });
  } else if (command === "toggle-bookmark-opener") {
    function buildDisplayList(nodes, query, level, parentPath) {
      let displayList = [];
      nodes.forEach((node) => {
        const currentPath = parentPath
          ? `${parentPath} > ${String(node.title) || ""}`
          : String(node.title) || "";
        if (node.url) {
          // It's a bookmark
          const matchedIndicesTitle = fuzzyMatch(query, node.title || "");
          const matchedIndicesUrl = fuzzyMatch(query, node.url);
          const matchedIndicesPath = fuzzyMatch(query, currentPath);

          if (
            !query ||
            matchedIndicesTitle ||
            matchedIndicesUrl ||
            matchedIndicesPath
          ) {
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
          // It's a folder
          const hasTitle = String(node.title).trim() !== "";
          const matchedIndicesTitle = fuzzyMatch(query, node.title || "");
          const matchedIndicesPath = fuzzyMatch(query, currentPath);

          // Recursively build list for children
          const childrenDisplayList = buildDisplayList(
            node.children,
            query,
            level + 1,
            currentPath,
          );

          // Determine if folder should be expanded
          let shouldExpand = false;
          if (query) {
            // If there's a query, expand if folder itself matches or any child matches
            shouldExpand =
              childrenDisplayList.some((item) => item.isBookmark) ||
              matchedIndicesTitle ||
              matchedIndicesPath;
          } else {
            // If no query, respect user's expandedFolders state
            shouldExpand = expandedFolders.has(node.id);
          }

          if (hasTitle) {
            // Always add the folder if it has a title
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
    if (!query) {
      currentFilteredItems = allTabs.map((tab) => ({
        tab,
        match: null,
        isGroup: false,
      }));
      // Prioritize the previously active tab if it exists and is not the current active tab
    } else {
      allTabs.forEach((tab) => {
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
    currentFilteredItems.sort((a, b) => a.tab.index - b.tab.index);
    if (command === "toggle-fuzzy-finder" && previousTabId) {
      const prevTab = currentFilteredItems.find(
        (item) => item.tab.id === previousTabId,
      );
      if (prevTab) {
        // Remove it from its current position
        currentFilteredItems = currentFilteredItems.filter(
          (item) => item.tab.id !== previousTabId,
        );
        // Add it to the beginning of the list
        currentFilteredItems.unshift(prevTab);
      }
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
  if (!indices || indices.length === 0) {
    return text;
  }
  let highlightedText = "";
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
  const resultsContainer = document.getElementById("fuzzy-finder-results");
  resultsContainer.innerHTML = ""; // Clear previous results

  if (
    filteredItems.length === 0 &&
    !filteredItems.some(
      (item) => item.isNewGroupOption || item.isRemoveBookmarkOption,
    )
  ) {
    let message = "No matching items found.";
    if (command === "toggle-bookmark-finder") {
      message = "No matching bookmark folders found.";
    } else if (command === "toggle-bookmark-opener") {
      message = "No matching bookmarks found.";
    } else if (command === "toggle-group-finder") {
      message = "No matching tabs or groups found.";
    } else {
      // toggle-fuzzy-finder
      message = "No matching tabs found.";
    }
    resultsContainer.innerHTML = `<div style="padding: 8px; color: #aaa;">${message}</div>`;
    return;
  }

  filteredItems.forEach((item, index) => {
    const itemElement = document.createElement("div");
    itemElement.classList.add("fuzzy-finder-item");
    itemElement.style.cssText = `
      padding: 8px 12px;
      cursor: pointer;
      border-bottom: 1px solid #3a3f4b;
      display: flex;
      align-items: center;
    `;

    if (item.isGroup) {
      itemElement.dataset.groupId = item.group.id;
      const groupTitle = document.createElement("div");
      groupTitle.innerHTML = `Group: ${item.match && item.match.field === "title" ? highlightText(item.group.title, item.match.indices) : item.group.title}`;
      groupTitle.style.cssText = `
        font-weight: bold;
        color: #8be9fd;
      `;
      itemElement.appendChild(groupTitle);
      itemElement.addEventListener("click", () => {
        groupTab(item.group.id);
        removeOverlay();
      });
    } else if (item.isNewGroupOption) {
      const newGroupText = document.createElement("div");
      newGroupText.textContent = `Create new group: "${item.query}"`;
      newGroupText.style.cssText = `
        font-weight: bold;
        color: #a6e22e;
      `;
      itemElement.appendChild(newGroupText);
      itemElement.addEventListener("click", () => {
        groupTab(null, item.query);
        removeOverlay();
      });
    } else if (item.isRemoveFromGroupOption) {
      const removeText = document.createElement("div");
      removeText.textContent = "Remove from group";
      removeText.style.cssText = `
        font-weight: bold;
        color: #f92672;
      `;
      itemElement.appendChild(removeText);
      itemElement.addEventListener("click", () => {
        removeTabFromGroup();
        removeOverlay();
      });
    } else if (item.isFolder) {
      const folderName = document.createElement("div");
      const indent = "&nbsp;&nbsp;".repeat(item.level);
      const titleHtml =
        item.match && item.match.field === "title"
          ? highlightText(item.bookmark.title || "", item.match.indices)
          : item.bookmark.title || "";
      const pathHtml =
        item.match && item.match.field === "path"
          ? highlightText(String(item.path) || "", item.match.indices)
          : String(item.path) || "";

      const expandCollapseIcon = item.isExpanded ? "▼" : "►";
      folderName.innerHTML = `${indent}<span style="color: #f1fa8c;">${expandCollapseIcon} ${titleHtml}</span>`;
      if (command === "toggle-bookmark-opener" && item.level > 0) {
        folderName.innerHTML += `<div style="font-size: 0.7em; color: #888;">${indent}${pathHtml}</div>`;
      }
      folderName.style.cssText = `
        font-weight: bold;
      `;
      itemElement.appendChild(folderName);
      itemElement.addEventListener("click", () => {
        if (command === "toggle-bookmark-opener" && item.isFolder) {
          const folderId = item.bookmark.id;
          if (expandedFolders.has(folderId)) {
            expandedFolders.delete(folderId);
          } else {
            expandedFolders.add(folderId);
          }
          fuzzySearchAndDisplay(
            document.getElementById("fuzzy-finder-input").value,
            activeCommand,
          );
        } else if (command === "toggle-bookmark-finder") {
          addBookmark(item.bookmark.id);
          removeOverlay();
        } else if (command === "toggle-bookmark-opener") {
        } else if (command === "toggle-bookmark-opener") {
          openBookmark(item.bookmark.url);
          removeOverlay();
        }
      });
    } else if (item.isRemoveBookmarkOption) {
      const removeText = document.createElement("div");
      removeText.textContent = "Remove from bookmarks";
      removeText.style.cssText = `
        font-weight: bold;
        color: #f92672;
      `;
      itemElement.appendChild(removeText);
      itemElement.addEventListener("click", () => {
        removeBookmark();
        removeOverlay();
      });
    } else if (item.isBookmark) {
      itemElement.dataset.bookmarkId = item.bookmark.id;
      const favicon = document.createElement("img");
      favicon.src =
        item.bookmark.favIconUrl ||
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="; // Default to a transparent pixel if no favicon
      favicon.style.cssText = `
        width: 16px;
        height: 16px;
        margin-right: 8px;
        flex-shrink: 0;
      `;
      itemElement.appendChild(favicon);

      const textContent = document.createElement("div");
      textContent.style.cssText = `
        flex-grow: 1;
        overflow: hidden;
        white-space: nowrap;
      `;

      const indent = "&nbsp;&nbsp;".repeat(item.level);

      const title = document.createElement("div");
      title.innerHTML =
        `${indent}` +
        (item.match && item.match.field === "title"
          ? highlightText(item.bookmark.title || "", item.match.indices)
          : item.bookmark.title || "");
      title.style.cssText = `
        font-weight: bold;
        overflow: hidden;
        text-overflow: ellipsis;
      `;
      textContent.appendChild(title);

      const url = document.createElement("div");
      url.innerHTML =
        `${indent}` +
        (item.match && item.match.field === "url"
          ? highlightText(item.bookmark.url, item.match.indices)
          : item.bookmark.url);
      url.style.cssText = `
        font-size: 0.8em;
        color: #aaa;
        overflow: hidden;
        text-overflow: ellipsis;
      `;
      textContent.appendChild(url);

      const path = document.createElement("div");
      path.innerHTML = `${indent}<span style="font-size: 0.7em; color: #888;">${item.match && item.match.field === "path" ? highlightText(String(item.path) || "", item.match.indices) : String(item.path) || ""}</span>`;
      path.style.cssText = `
        overflow: hidden;
        text-overflow: ellipsis;
      `;
      textContent.appendChild(path);

      itemElement.appendChild(textContent);

      itemElement.addEventListener("click", () => {
        openBookmark(item.bookmark.url);
        removeOverlay();
      });
    } else {
      itemElement.dataset.tabId = item.tab.id;
      const favicon = document.createElement("img");
      favicon.src =
        item.tab.favIconUrl ||
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="; // Default to a transparent pixel if no favicon
      favicon.style.cssText = `
        width: 16px;
        height: 16px;
        margin-right: 8px;
        flex-shrink: 0;
      `;
      itemElement.appendChild(favicon);

      const textContent = document.createElement("div");
      textContent.style.cssText = `
        flex-grow: 1;
        overflow: hidden;
        white-space: nowrap;
      `;

      const title = document.createElement("div");
      title.innerHTML =
        item.match && item.match.field === "title"
          ? highlightText(item.tab.title, item.match.indices)
          : item.tab.title;
      title.style.cssText = `
        font-weight: bold;
        overflow: hidden;
        text-overflow: ellipsis;
      `;
      textContent.appendChild(title);

      const url = document.createElement("div");
      url.innerHTML =
        item.match && item.match.field === "url"
          ? highlightText(item.tab.url, item.match.indices)
          : item.tab.url;
      url.style.cssText = `
        font-size: 0.8em;
        color: #aaa;
        overflow: hidden;
        text-overflow: ellipsis;
      `;
      textContent.appendChild(url);

      if (
        item.tab.groupId &&
        allTabGroups[item.tab.groupId] &&
        allTabGroups[item.tab.groupId].title
      ) {
        const groupName = document.createElement("div");
        const groupTitle = allTabGroups[item.tab.groupId].title;
        groupName.innerHTML =
          item.match && item.match.field === "group"
            ? `Group: ${highlightText(groupTitle, item.match.indices)}`
            : `Group: ${groupTitle}`;
        groupName.style.cssText = `
          font-size: 0.7em;
          color: #888;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-top: 2px;
        `;
        textContent.appendChild(groupName);
      }

      itemElement.appendChild(textContent);

      itemElement.addEventListener("click", () => {
        activateTab(item.tab.id);
        removeOverlay();
      });
    }
    resultsContainer.appendChild(itemElement);
  });
}

function highlightSelection() {
  const items = document.querySelectorAll(".fuzzy-finder-item");
  items.forEach((item, index) => {
    if (index === selectedIndex) {
      item.style.backgroundColor = "#4a4f5b"; // Highlight color
      item.scrollIntoView({ block: "nearest" }); // Scroll into view if off-screen
    } else {
      item.style.backgroundColor = "transparent";
    }
  });
}

function activateTab(tabId) {
  chrome.runtime.sendMessage({ action: "activateTab", tabId: tabId });
}

function groupTab(groupId, groupName) {
  chrome.runtime.sendMessage({ action: "groupTab", groupId, groupName });
}

function removeTabFromGroup() {
  chrome.runtime.sendMessage({ action: "removeTabFromGroup" });
}

function addBookmark(parentId) {
  chrome.runtime.sendMessage({ action: "addBookmark", parentId });
}

function removeBookmark() {
  chrome.runtime.sendMessage({ action: "removeBookmark" });
}

function openBookmark(url) {
  chrome.runtime.sendMessage({ action: "openBookmark", url });
}

let previousTabId = null;

function toggleOverlay(command, prevTabId) {
  if (overlay) {
    overlay.removeOverlay();
  } else {
    previousTabId = prevTabId; // Store the previous tab ID
    createOverlay(command);
  }
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "toggleFuzzyFinder") {
    toggleOverlay(message.command, message.previousTabId);
  }
});
