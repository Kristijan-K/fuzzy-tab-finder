# Tab Fuzzy Finder
Tab Fuzzy Finder is a powerful Chrome extension that allows you to quickly search and manage your open tabs and tab groups using a fuzzy search interface.

## Features

- **Fuzzy Search Tabs**: Quickly find and switch to any open tab by typing a few characters from its title or URL.
- **Tab Grouping**: Easily group your current active tab into an existing group or create a new group with a custom name.
- **Ungroup Tab**: Remove the current active tab from its group.

## Installation

1.  **Download the extension**: Clone this repository or download the source code as a ZIP file.
2.  **Unzip the file** (if downloaded as ZIP).
3.  **Open Chrome Extensions page**: Go to `chrome://extensions` in your Chrome browser.
4.  **Enable Developer mode**: Toggle on the "Developer mode" switch located in the top right corner.
5.  **Load unpacked**: Click on the "Load unpacked" button.
6.  **Select the extension directory**: Navigate to the directory where you cloned/unzipped the extension and select it.

The extension should now be installed and visible in your Chrome extensions list.

## Usage

### Toggle Fuzzy Finder (Tabs)

-   **Keyboard Shortcut**: Press `Alt+Q` (default) to open the fuzzy finder for tabs. Start typing to search, use `Arrow Up`/`Arrow Down` to navigate, and `Enter` to switch to the selected tab.
-   **Extension Icon**: Click on the extension icon in your Chrome toolbar to open the fuzzy finder for tabs.

### Grouping Tabs

1.  Open the Group Finder (`Alt+T`).
2.  Select an existing group from the list or type a new name in the input field.
3.  Press `Enter`. The current active tab will be added to the selected group or a new group will be created with the specified name.

### Removing Tab from Group

1.  Open the Group Finder (`Alt+T`).
2.  Select the "Remove from group" option.
3.  Press `Enter`. The current active tab will be removed from its group.

## Customizing Keyboard Shortcuts

You can change the default keyboard shortcuts for the extension:

1.  Go to `chrome://extensions/shortcuts` in your Chrome browser.
2.  Find "Tab Fuzzy Finder" in the list.
3.  Click on the edit icon next to the desired command (`Toggle the fuzzy finder UI` or `Toggle the group finder UI`) and enter your preferred shortcut.
