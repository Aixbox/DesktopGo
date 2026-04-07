# 🚀 DesktopGo User Guide

[简体中文](./USER_GUIDE.zh-CN.md) | [English](./USER_GUIDE.en.md)

Supported platforms: Windows 10 / Windows 11

DesktopGo is a Windows desktop launchpad that brings desktop icon organization, custom app entry points, and Everything-powered file search into one focused entry point.

## 📦 1. Install and Launch

Download links:

- Latest release: <https://github.com/Aixbox/DesktopGo/releases/latest>
- All releases: <https://github.com/Aixbox/DesktopGo/releases>

Install steps:

1. Download and run the latest installer.
2. If Everything is not installed on your machine yet, keep the "Install Everything" option enabled.
3. After installation, press `Ctrl+Space` to open DesktopGo.

Default values on first launch:

- 🌐 Language: Simplified Chinese
- 🎨 Theme mode: Follow system
- 🧱 Icon size: Medium
- 🪟 Window mode: Medium window
- 🏷️ Title lines: Two lines
- 📌 Dock: Enabled
- ⚡ Launch on startup: Enabled
- ⌨️ Launchpad shortcut: `Ctrl+Space`
- 🗂️ Icon manager view: List

Notes:

- 💡 The main window hides automatically when it loses focus. This is expected behavior.
- 💾 If you already have local settings saved, future upgrades will keep your existing preferences instead of overwriting them with new defaults.

## 🧭 2. Quick Start

### ⌨️ Open and Close

- Press `Ctrl+Space` to open the launchpad.
- Press `Esc` to close the search panel, clear the current search, or close the launchpad when search is idle.
- The launchpad hides automatically when it loses focus.
- You can also reopen it from the system tray icon.

### 🖼️ Browse Desktop Icons

- Desktop icons are loaded and shown in a grid by default.
- You can drag icons to reorder them, organize them across pages, and manage folders and the Dock.
- Right-click the empty background of the launchpad for quick actions:
- 🔹 Icon size
- 🔹 Window size
- 🔹 Title lines
- 🔹 Enter icon edit mode
- 🔹 Open settings

### 🔎 Search Files and Apps

- The top search box is the main search entry point.
- The default source is Everything, which can search files, folders, and apps.
- Typing opens the search panel automatically.
- You can switch between "Everything Search" and "Desktop Icon Search" at the top of the panel.

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

Besides showing desktop icons, DesktopGo also supports local icon organization.

Available capabilities:

- Drag-and-drop sorting
- Paged organization
- Folder management
- Dock shortcuts
- Multi-select
- Hide icons
- Delete icon records

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

### 🗂️ Icon Manager

The icon manager is mainly used to maintain snapshots for both desktop entries and custom app entries.

Supported actions:

- View the icon list
- Switch between list and grid view
- Configure the custom app directory
- Run incremental sync
- Run full sync

Sync notes:

- Incremental sync only adds new entries and leaves existing records untouched. It is the best choice for daily use.
- Full sync re-checks the current desktop or directory state, fills missing entries, and cleans invalid records. It is safer after major cleanup.

### 🔄 Updates

- The update page reads update information from GitHub Releases
- You can check for and install updates there

### ℹ️ About

- View the app version, identifier, and Tauri runtime version
- Open the GitHub repository, releases, and issues
- Copy diagnostic information for bug reports

## 📁 6. `customapp` Directory

DesktopGo supports custom app entries beyond the desktop.

Default behavior:

- If `customAppDir` is not configured manually, the default directory is `customapp/` next to the executable
- The directory is created automatically if it does not exist
- Only the first directory level is scanned right now

Recommended workflow:

1. Put commonly used shortcuts, executables, or folders into the `customapp` directory.
2. Open `Settings -> Icon Manager`.
3. Confirm that the active directory is correct.
4. Run an incremental sync.

If you change the directory:

1. Enter a new path or choose a folder in the icon manager page.
2. Save the path.
3. Run sync again so the new directory contents appear in the launchpad.

## 💾 7. Data Storage

DesktopGo follows a local-first design.

Main persisted data:

- General settings: stored in `settings.json`
- Launchpad layout, search settings, and related state: stored in the local SQLite database `app_state.db`
- Icon snapshots and caches: stored in the local app data directory

Notes:

- DesktopGo does not depend on an account system.
- Most settings, layouts, and search configuration stay on the current machine only.

## 🛠️ 8. Common Issues

### ⌨️ 8.1 Shortcut Does Not Work

Check these first:

- Whether the shortcut is intercepted by your IME
- Whether it conflicts with a system shortcut
- Whether you already changed it in settings

Suggested fix:

- Go to `Settings -> Launchpad Shortcut` and change it to another combination, such as `Ctrl+Alt+Space`

### 🔎 8.2 Search Is Not Working

Check these first:

- Whether Everything is installed
- Whether Everything is running
- Whether DesktopGo and Everything are running at the same privilege level
- Whether the DesktopGo installer was allowed to install Everything

### 📂 8.3 `customapp` Entries Are Missing

Check these first:

- Whether the active directory is correct
- Whether the new files are placed in the scanned top-level directory
- Whether you already ran sync

Suggested fix:

- Run incremental sync after adding a small number of files
- Run full sync after major reorganization

### 🪟 8.4 Defaults Did Not Change After an Upgrade

This is expected.

- Default values only affect first install or cases where no local setting exists yet
- If you already saved your own theme, window mode, or other preferences, upgrades will continue using your saved values

## 💬 9. Feedback and Support

- GitHub repository: <https://github.com/Aixbox/DesktopGo>
- Issue tracker: <https://github.com/Aixbox/DesktopGo/issues>
- Releases: <https://github.com/Aixbox/DesktopGo/releases>

When reporting a problem, it helps to include:

- DesktopGo version
- Windows version
- Whether Everything is installed and running
- Whether the issue is reproducible
- Diagnostic information copied from the About page
