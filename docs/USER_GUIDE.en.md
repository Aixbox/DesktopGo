# 🚀 DesktopGo User Guide

[简体中文](./USER_GUIDE.zh-CN.md) | [English](./USER_GUIDE.en.md)

Supported platforms: Windows 10 / Windows 11

DesktopGo is a Windows desktop launchpad that brings a personal icon library, quick app entry points, and Everything-powered file search into one focused entry point.

## 📦 1. Install and Launch

Download links:

- Latest release: <https://github.com/Aixbox/DesktopGo/releases/latest>
- All releases: <https://github.com/Aixbox/DesktopGo/releases>

Install steps:

1. Download and run the latest installer. A single installer ships both Simplified Chinese and English resources.
2. Every run of the installer starts with a language dialog. Pick "中文(简体)" or "English" and the rest of the wizard uses that language; cancelling the dialog exits without writing any files.
3. If Everything is not installed on your machine yet, keep the "Install Everything" option enabled.
4. After installation, press `Ctrl+Space` to open DesktopGo.

Default values on first launch:

- 🌐 Language: Follows the language picked in the installer
- 🎨 Theme mode: Follow system
- 🧱 Icon size: Medium
- 🪟 Window mode: Medium window
- 🏷️ Title lines: Two lines
- 📌 Dock: Enabled
- ⚡ Launch on startup: Enabled
- ⌨️ Launchpad shortcut: `Ctrl+Space`
- 🗂️ Icon library view: List

Notes:

- 💡 The main window hides automatically when it loses focus. This is expected behavior.

## 🧭 2. Quick Start

### ⌨️ Open and Close

- Press `Ctrl+Space` to open the launchpad.
- Press `Esc` to close the search panel, clear the current search, or close the launchpad when search is idle.
- The launchpad hides automatically when it loses focus.
- You can also reopen it from the system tray icon.

### 🖼️ Icon Library

- A new installation starts with an empty icon library and does not scan the entire desktop automatically.
- Click **Import Icons** to choose apps, shortcuts, or files; drag folders directly into the launchpad.
- You can also drag items directly into the launchpad to import them.
- Drag icons to reorder them, organize pages, and manage folders and the Dock.
- Right-click the empty launchpad background to adjust icon size, window size, title lines, or enter edit mode.

### 🔎 Search Files and Apps

- The top search box is the main search entry point.
- The default source is Everything, which can search files, folders, and apps.
- Typing opens the search panel automatically.
- You can switch between "Everything Search" and "Icon Library Search" at the top of the panel.

## 🧠 3. Search Panel

### 🎛️ Basic Controls

- Type a keyword to show results in the panel below.
- `ArrowDown` / `ArrowUp`: move the current selection
- `Enter`: open the selected result
- Double-click a result: open it directly
- `Esc`: close the search panel; if the panel is already closed, keep pressing to clear the keyword or close the launchpad

### ⚙️ Search Features

- Search history
- Filters such as all, files, folders, apps, pictures, videos, and more
- Sorting
- Path match, case-sensitive match, regex, and whole-word match
- Right-side preview pane
- Virtualized result list for large result sets

### 🧾 Current Default Search Settings

- Live search: Enabled
- Auto-select first result: Enabled
- Enter opens result: Enabled
- Double-click opens result: Enabled
- Debounce: `120ms`
- Default filter: All
- Default sort: Path ascending
- Max results per page: `50`
- Remember last filter: Enabled
- Match path: Disabled
- Match case: Disabled
- Regex: Disabled
- Whole word: Disabled
- Auto-connect Everything runtime: Enabled

Note:

- 💡 "Remember last filter" is enabled by default, so the first run uses "All", but later sessions will prefer the filter you used most recently.

## 🧩 4. Icon Organization and Edit Mode

DesktopGo uses one icon library for apps, files, and folders explicitly imported by the user.

Available capabilities:

- Drag-and-drop sorting
- Paged organization
- Folder management
- Dock shortcuts
- Multi-select
- Hide icons
- Remove items from the icon library without deleting the originals

How to enter edit mode:

- Right-click the empty launchpad background and click "Edit Icons"
- Or long-press on the empty background

## ⚙️ 5. Settings Overview

The settings window is mainly divided into the following areas:

### 🌐 General Settings

- Interface language
- Theme mode
- Title line count
- Dock visibility
- Launch on startup
- Launchpad shortcut

Shortcut notes:

- The default shortcut is `Ctrl+Space`
- Some IMEs or system shortcuts may intercept this combination
- If it does not work reliably on your machine, change it in settings

### 🔍 Search Settings

You can adjust:

- Live search
- Default filter
- Default sort
- Max results per page
- Path / case / regex / whole-word matching
- Auto-connect Everything

### 🗂️ Icon Library

The Icon Library page imports and manages launchpad items.

Available actions:

- Every **Add / Import Icons** entry point opens the same add-icon dialog
- Enter a display name and target path in the dialog; the display name never changes the underlying filename
- Choose a file or folder to fill the name and path and preview the icon
- Expand **Advanced launch options** to set launch arguments, a working directory, or a custom icon
- Arguments and working directory are written to DesktopGo's managed shortcut; custom icons are cached separately
- Browse and search icons
- Switch between list and grid views
- Filter by visibility
- Hide, show, or remove library items
- Run AI organization or reset the layout

The icon library only requires importing and managing items; there are no storage directories or sync tasks to maintain.

### 🔄 Updates

- The update page reads update information from GitHub Releases
- You can check for and install updates there

### ℹ️ About

- View the app version, identifier, and Tauri runtime version
- Open the GitHub repository, releases, and issues
- Copy diagnostic information for bug reports

## 💾 6. Data Storage

DesktopGo follows a local-first design.

Main persisted data:

- General settings: stored in `settings.json`
- Launchpad layout, search settings, and related state: stored in the local SQLite database `app_state.db`
- Icon library data and icon caches: stored in the local app data directory

Notes:

- DesktopGo does not depend on an account system.
- Most settings, layouts, and search configuration stay on the current machine only.

## 🛠️ 7. Common Issues

### ⌨️ 7.1 Shortcut Does Not Work

Check these first:

- Whether the shortcut is intercepted by your IME
- Whether it conflicts with a system shortcut
- Whether you already changed it in settings

Suggested fix:

- Go to `Settings -> Launchpad Shortcut` and change it to another combination, such as `Ctrl+Alt+Space`

### 🔎 7.2 Search Is Not Working

Check these first:

- Whether Everything is installed
- Whether Everything is running
- Whether DesktopGo and Everything are running at the same privilege level
- Whether the DesktopGo installer was allowed to install Everything

### 🪟 7.3 Defaults Did Not Change After an Upgrade

This is expected.

- Default values only affect first install or cases where no local setting exists yet
- If you already saved your own theme, window mode, or other preferences, upgrades will continue using your saved values

## 💬 8. Feedback and Support

- GitHub repository: <https://github.com/Aixbox/DesktopGo>
- Issue tracker: <https://github.com/Aixbox/DesktopGo/issues>
- Releases: <https://github.com/Aixbox/DesktopGo/releases>
