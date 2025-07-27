console.log("Content script loaded");

let overlay = null;
let allTabs = [];
let allTabGroups = {}; // New variable to store tab groups
let filteredTabs = [];
let selectedIndex = -1;
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
  chrome.runtime.sendMessage({ action: "getAllTabs" }, (response) => {
    allTabs = response.tabs;
    allTabGroups = response.tabGroups.reduce((acc, group) => {
      acc[group.id] = group;
      return acc;
    }, {});
    fuzzySearchAndDisplay("", activeCommand); // Display all tabs initially
  });

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
  }
}
// Keyboard handling (moved outside createOverlay)
function onKeyDown(event) {
  // If the overlay is not active, do nothing.
  if (!overlay) {
    return;
  }

  // Check if the key is one of the special keys that control the overlay.
  const specialKeys = ["Escape", "ArrowDown", "ArrowUp", "Enter"];
  if (specialKeys.includes(event.key)) {
    event.preventDefault(); // Prevent default browser actions (e.g., scrolling for arrow keys)
    event.stopPropagation(); // Stop event from propagating further to other listeners

    if (event.key === "Escape") {
      removeOverlay();
    } else if (event.key === "ArrowDown") {
      console.log(
        "ArrowDown pressed. Current selectedIndex:",
        selectedIndex,
        "filteredTabs.length:",
        filteredTabs.length,
      );
      selectedIndex = Math.min(selectedIndex + 1, filteredTabs.length - 1);
      highlightSelection();
    } else if (event.key === "ArrowUp") {
      console.log(
        "ArrowUp pressed. Current selectedIndex:",
        selectedIndex,
        "filteredTabs.length:",
        filteredTabs.length,
      );
      selectedIndex = Math.max(selectedIndex - 1, 0);
      highlightSelection();
    } else if (event.key === "Enter") {
      if (selectedIndex !== -1 && filteredTabs[selectedIndex]) {
        const selected = filteredTabs[selectedIndex];
        if (selected.isGroup) {
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
      } else {
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
  } else {
    // toggle-fuzzy-finder
    if (!query) {
      currentFilteredItems = allTabs.map((tab) => ({
        tab,
        match: null,
        isGroup: false,
      }));
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
  }

  filteredTabs = currentFilteredItems;
  console.log(
    "Filtered tabs before display:",
    filteredTabs,
    "Command:",
    command,
  );
  displayResults(filteredTabs, command);
  selectedIndex = filteredTabs.length > 0 ? 0 : -1;
  highlightSelection();
}

function removeOverlay() {
  if (overlay) {
    overlay.remove();
    overlay = null;
    selectedIndex = -1; // Reset selection
  }
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
    !filteredItems.some((item) => item.isNewGroupOption)
  ) {
    resultsContainer.innerHTML =
      '<div style="padding: 8px; color: #aaa;">No matching tabs or groups found.</div>';
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

function toggleOverlay(command) {
  if (overlay) {
    overlay.removeOverlay();
  } else {
    createOverlay(command);
  }
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Content script received message:", message);
  if (message.action === "toggleFuzzyFinder") {
    toggleOverlay(message.command);
  }
});
