console.log("Content script loaded");

let overlay = null;
let allTabs = [];
let allTabGroups = {}; // New variable to store tab groups
let filteredTabs = [];
let selectedIndex = -1;

function createOverlay() {
  // Remove existing overlay if any
  if (overlay) {
    overlay.remove();
    overlay = null;
  }

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
  input.placeholder = "search tabs...";
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
    fuzzySearchAndDisplay(""); // Display all tabs initially
  });

  // Input event listener for fuzzy searching
  input.addEventListener("input", (event) => {
    fuzzySearchAndDisplay(event.target.value);
  });

  // Keyboard handling
  function onKeyDown(event) {
    if (event.key === "Escape") {
      removeOverlay();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, filteredTabs.length - 1);
      highlightSelection();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      highlightSelection();
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (selectedIndex !== -1 && filteredTabs[selectedIndex]) {
        console.log("Enter pressed. Selected index:", selectedIndex);
        console.log("Selected tab object:", filteredTabs[selectedIndex]);
        console.log(
          "Activating tab with ID:",
          filteredTabs[selectedIndex].tab.id,
        );
        activateTab(filteredTabs[selectedIndex].tab.id);
        removeOverlay();
      } else {
        console.log(
          "Enter pressed, but no tab selected or filteredTabs is empty.",
        );
      }
    }
  }

  document.addEventListener("keydown", onKeyDown);

  // Remove overlay function
  function removeOverlay() {
    if (overlay) {
      overlay.remove();
      overlay = null;
      document.removeEventListener("keydown", onKeyDown);
      selectedIndex = -1; // Reset selection
    }
  }

  // Store removeOverlay on overlay for external access
  overlay.removeOverlay = removeOverlay;
}

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

function fuzzySearchAndDisplay(query) {
  if (!query) {
    filteredTabs = allTabs.map((tab) => ({ tab, match: null }));
  } else {
    filteredTabs = [];
    allTabs.forEach((tab) => {
      const tabGroup = tab.groupId && allTabGroups[tab.groupId];
      const groupTitle = tabGroup ? tabGroup.title : "";

      let match = null;
      let matchedIndices = fuzzyMatch(query, tab.title);
      if (matchedIndices) {
        match = { field: "title", indices: matchedIndices };
      } else {
        matchedIndices = fuzzyMatch(query, tab.url);
        if (matchedIndices) {
          match = { field: "url", indices: matchedIndices };
        } else {
          matchedIndices = fuzzyMatch(query, groupTitle);
          if (matchedIndices) {
            match = { field: "group", indices: matchedIndices };
          }
        }
      }

      if (match) {
        filteredTabs.push({ tab, match });
      }
    });
  }
  console.log("Filtered tabs after search:", filteredTabs);
  displayResults(filteredTabs);
  selectedIndex = filteredTabs.length > 0 ? 0 : -1; // Select first item by default
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

function displayResults(filteredTabs) {
  const resultsContainer = document.getElementById("fuzzy-finder-results");
  resultsContainer.innerHTML = ""; // Clear previous results

  if (filteredTabs.length === 0) {
    resultsContainer.innerHTML =
      '<div style="padding: 8px; color: #aaa;">No matching tabs found.</div>';
    return;
  }

  filteredTabs.forEach(({ tab, match }, index) => {
    const tabItem = document.createElement("div");
    tabItem.classList.add("fuzzy-finder-item");
    tabItem.dataset.tabId = tab.id;
    tabItem.style.cssText = `
      padding: 8px 12px;
      cursor: pointer;
      border-bottom: 1px solid #3a3f4b;
      display: flex;
      align-items: center;
    `;

    const favicon = document.createElement("img");
    favicon.src =
      tab.favIconUrl ||
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="; // Default to a transparent pixel if no favicon
    favicon.style.cssText = `
      width: 16px;
      height: 16px;
      margin-right: 8px;
      flex-shrink: 0;
    `;
    tabItem.appendChild(favicon);

    const textContent = document.createElement("div");
    textContent.style.cssText = `
      flex-grow: 1;
      overflow: hidden;
      white-space: nowrap;
    `;

    const title = document.createElement("div");
    title.innerHTML =
      match && match.field === "title"
        ? highlightText(tab.title, match.indices)
        : tab.title;
    title.style.cssText = `
      font-weight: bold;
      overflow: hidden;
      text-overflow: ellipsis;
    `;
    textContent.appendChild(title);

    const url = document.createElement("div");
    url.innerHTML =
      match && match.field === "url"
        ? highlightText(tab.url, match.indices)
        : tab.url;
    url.style.cssText = `
      font-size: 0.8em;
      color: #aaa;
      overflow: hidden;
      text-overflow: ellipsis;
    `;
    textContent.appendChild(url);

    if (
      tab.groupId &&
      allTabGroups[tab.groupId] &&
      allTabGroups[tab.groupId].title
    ) {
      const groupName = document.createElement("div");
      const groupTitle = allTabGroups[tab.groupId].title;
      groupName.innerHTML =
        match && match.field === "group"
          ? `Group: ${highlightText(groupTitle, match.indices)}`
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

    tabItem.appendChild(textContent);

    tabItem.addEventListener("click", () => {
      activateTab(tab.id);
      removeOverlay();
    });
    resultsContainer.appendChild(tabItem);
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

function toggleOverlay() {
  if (overlay) {
    overlay.removeOverlay();
  } else {
    createOverlay();
  }
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Content script received message:", message);
  if (message.action === "toggleFuzzyFinder") {
    toggleOverlay();
  }
});
