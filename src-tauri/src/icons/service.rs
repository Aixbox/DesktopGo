use base64::Engine;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use tauri::Manager;

use super::models::{
    DesktopIcon, IconBucket, IconMutationTarget, IconSnapshot, IconSyncResult, ScannedDesktopItem,
    SnapshotIconItem, SnapshotIconPaths, ICON_SOURCE_CUSTOMAPP, ICON_SOURCE_DESKTOP,
};
#[cfg(windows)]
use super::platform_windows::{
    create_recycle_bin_icon, extract_icon_for_item, get_desktop_dirs, get_dpi_scale,
    launch_app_windows, resolve_lnk, scan_desktop_items,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum IconSource {
    Desktop,
    CustomApp,
}

impl IconSource {
    fn from_value(value: &str) -> Self {
        let normalized = value.trim().to_lowercase();
        if normalized == ICON_SOURCE_CUSTOMAPP
            || normalized == "custom_app"
            || normalized == "custom-app"
        {
            Self::CustomApp
        } else {
            Self::Desktop
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Desktop => ICON_SOURCE_DESKTOP,
            Self::CustomApp => ICON_SOURCE_CUSTOMAPP,
        }
    }

    fn snapshot_file_name(self) -> &'static str {
        match self {
            Self::Desktop => "icons_snapshot.json",
            Self::CustomApp => "customapp_icons_snapshot.json",
        }
    }

    fn cache_folder_name(self) -> &'static str {
        self.as_str()
    }
}

pub fn get_desktop_icons(
    app_handle: tauri::AppHandle,
    icon_size: i32,
    custom_app_dir: Option<String>,
) -> Vec<DesktopIcon> {
    #[cfg(windows)]
    {
        match get_all_icons_windows(&app_handle, icon_size, custom_app_dir) {
            Ok(icons) => icons,
            Err(e) => {
                eprintln!("Failed to load icon snapshots: {}", e);
                Vec::new()
            }
        }
    }
    #[cfg(not(windows))]
    {
        let _ = app_handle;
        let _ = icon_size;
        let _ = custom_app_dir;
        Vec::new()
    }
}

pub fn sync_new_desktop_icons(app_handle: tauri::AppHandle) -> Result<IconSyncResult, String> {
    #[cfg(windows)]
    {
        sync_new_icons_windows(&app_handle, IconSource::Desktop, || Ok(collect_desktop_items()))
    }
    #[cfg(not(windows))]
    {
        let _ = app_handle;
        Err("Not supported on this platform".to_string())
    }
}

pub fn sync_full_desktop_icons(app_handle: tauri::AppHandle) -> Result<IconSyncResult, String> {
    #[cfg(windows)]
    {
        sync_full_icons_windows(&app_handle, IconSource::Desktop, || Ok(collect_desktop_items()))
    }
    #[cfg(not(windows))]
    {
        let _ = app_handle;
        Err("Not supported on this platform".to_string())
    }
}

pub fn sync_new_customapp_icons(
    app_handle: tauri::AppHandle,
    custom_app_dir: Option<String>,
) -> Result<IconSyncResult, String> {
    #[cfg(windows)]
    {
        let custom_dir = resolve_customapp_dir_windows(&app_handle, custom_app_dir)?;
        sync_new_icons_windows(&app_handle, IconSource::CustomApp, || {
            collect_items_from_single_dir(&custom_dir)
        })
    }
    #[cfg(not(windows))]
    {
        let _ = app_handle;
        let _ = custom_app_dir;
        Err("Not supported on this platform".to_string())
    }
}

pub fn sync_full_customapp_icons(
    app_handle: tauri::AppHandle,
    custom_app_dir: Option<String>,
) -> Result<IconSyncResult, String> {
    #[cfg(windows)]
    {
        let custom_dir = resolve_customapp_dir_windows(&app_handle, custom_app_dir)?;
        sync_full_icons_windows(&app_handle, IconSource::CustomApp, || {
            collect_items_from_single_dir(&custom_dir)
        })
    }
    #[cfg(not(windows))]
    {
        let _ = app_handle;
        let _ = custom_app_dir;
        Err("Not supported on this platform".to_string())
    }
}

pub fn hide_desktop_icons(
    app_handle: tauri::AppHandle,
    targets: Vec<IconMutationTarget>,
) -> Result<usize, String> {
    #[cfg(windows)]
    {
        hide_icons_windows(&app_handle, &targets)
    }
    #[cfg(not(windows))]
    {
        let _ = app_handle;
        let _ = targets;
        Err("Not supported on this platform".to_string())
    }
}

pub fn delete_desktop_icons(
    app_handle: tauri::AppHandle,
    targets: Vec<IconMutationTarget>,
) -> Result<usize, String> {
    #[cfg(windows)]
    {
        delete_icons_windows(&app_handle, &targets)
    }
    #[cfg(not(windows))]
    {
        let _ = app_handle;
        let _ = targets;
        Err("Not supported on this platform".to_string())
    }
}

pub fn launch_app(path: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        launch_app_windows(&path)
    }
    #[cfg(not(windows))]
    {
        Err("Not supported on this platform".to_string())
    }
}

pub fn get_default_customapp_dir(app_handle: tauri::AppHandle) -> Result<String, String> {
    #[cfg(windows)]
    {
        let path = default_customapp_dir_windows(&app_handle)?;
        Ok(path.to_string_lossy().to_string())
    }
    #[cfg(not(windows))]
    {
        let _ = app_handle;
        Err("Not supported on this platform".to_string())
    }
}

// ===== Windows implementations =====

#[cfg(windows)]
fn snapshot_base_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    app_handle
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Failed to resolve app local data directory: {}", e))
}

#[cfg(windows)]
fn snapshot_file_path(app_handle: &tauri::AppHandle, source: IconSource) -> Result<PathBuf, String> {
    Ok(snapshot_base_dir(app_handle)?.join(source.snapshot_file_name()))
}

#[cfg(windows)]
fn read_icon_snapshot(
    app_handle: &tauri::AppHandle,
    source: IconSource,
) -> Result<Option<IconSnapshot>, String> {
    let path = snapshot_file_path(app_handle, source)?;
    if !path.exists() {
        return Ok(None);
    }

    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read icon snapshot file: {}", e))?;
    let mut snapshot: IconSnapshot = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse icon snapshot JSON: {}", e))?;

    for item in &mut snapshot.icons {
        item.source = IconSource::from_value(&item.source).as_str().to_string();
    }

    Ok(Some(snapshot))
}

#[cfg(windows)]
fn write_icon_snapshot(
    app_handle: &tauri::AppHandle,
    source: IconSource,
    snapshot: &IconSnapshot,
) -> Result<(), String> {
    let path = snapshot_file_path(app_handle, source)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create snapshot directory: {}", e))?;
    }

    let json = serde_json::to_string_pretty(snapshot)
        .map_err(|e| format!("Failed to serialize icon snapshot: {}", e))?;
    std::fs::write(path, json).map_err(|e| format!("Failed to write icon snapshot: {}", e))?;
    Ok(())
}

#[cfg(windows)]
fn ensure_icon_cache_dirs(app_handle: &tauri::AppHandle, source: IconSource) -> Result<(), String> {
    let base_dir = snapshot_base_dir(app_handle)?;
    for bucket in [IconBucket::Small, IconBucket::Medium, IconBucket::Large] {
        let dir = base_dir
            .join("icons")
            .join(source.cache_folder_name())
            .join(bucket.folder_name());
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create icon cache directory {:?}: {}", dir, e))?;
    }
    Ok(())
}

#[cfg(windows)]
fn remove_cached_icon_file(app_handle: &tauri::AppHandle, rel_path: &str) -> Result<(), String> {
    if rel_path.is_empty() {
        return Ok(());
    }

    let abs_path = snapshot_base_dir(app_handle)?.join(rel_path);
    if !abs_path.exists() {
        return Ok(());
    }

    std::fs::remove_file(&abs_path)
        .map_err(|e| format!("Failed to remove icon cache file {:?}: {}", abs_path, e))?;
    Ok(())
}

#[cfg(windows)]
fn icon_file_rel_path(id: &str, bucket: IconBucket, source: IconSource) -> String {
    format!(
        "icons/{}/{}/{}.png",
        source.cache_folder_name(),
        bucket.folder_name(),
        id
    )
}

#[cfg(windows)]
fn decode_data_uri_png(data_uri: &str) -> Result<Vec<u8>, String> {
    if data_uri.is_empty() {
        return Ok(Vec::new());
    }

    let (_, raw) = data_uri
        .split_once(',')
        .ok_or_else(|| "Invalid data URI for icon data".to_string())?;
    base64::engine::general_purpose::STANDARD
        .decode(raw)
        .map_err(|e| format!("Failed to decode icon base64 data: {}", e))
}

#[cfg(windows)]
fn read_icon_file_as_data_uri(path: &PathBuf) -> String {
    match std::fs::read(path) {
        Ok(data) => format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(data)
        ),
        Err(_) => String::new(),
    }
}

#[cfg(windows)]
fn has_extension(path: &PathBuf, ext: &str) -> bool {
    path.extension()
        .and_then(|v| v.to_str())
        .map(|v| v.eq_ignore_ascii_case(ext))
        .unwrap_or(false)
}

#[cfg(windows)]
fn stable_item_key(item: &ScannedDesktopItem) -> String {
    format!(
        "{}|{}|{}",
        item.item_type.to_lowercase(),
        item.path.to_lowercase(),
        item.target_path.to_lowercase()
    )
}

#[cfg(windows)]
fn collect_desktop_items() -> Vec<ScannedDesktopItem> {
    let mut items = Vec::new();

    items.push(ScannedDesktopItem {
        name: "Recycle Bin".to_string(),
        path: "::{645FF040-5081-101B-9F08-00AA002F954E}".to_string(),
        target_path: "::{645FF040-5081-101B-9F08-00AA002F954E}".to_string(),
        item_type: "special".to_string(),
    });

    let dirs = get_desktop_dirs();
    for item_path in scan_desktop_items(&dirs) {
        let name = item_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Unknown")
            .to_string();

        let (target_path, item_type) = if has_extension(&item_path, "lnk") {
            (
                resolve_lnk(&item_path).unwrap_or_default(),
                "shortcut".to_string(),
            )
        } else if item_path.is_dir() {
            (item_path.to_string_lossy().to_string(), "folder".to_string())
        } else if has_extension(&item_path, "exe") {
            (
                item_path.to_string_lossy().to_string(),
                "executable".to_string(),
            )
        } else {
            (item_path.to_string_lossy().to_string(), "file".to_string())
        };

        items.push(ScannedDesktopItem {
            name,
            path: item_path.to_string_lossy().to_string(),
            target_path,
            item_type,
        });
    }

    items.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    items
}

#[cfg(windows)]
fn collect_items_from_single_dir(dir: &PathBuf) -> Result<Vec<ScannedDesktopItem>, String> {
    if !dir.exists() {
        std::fs::create_dir_all(dir)
            .map_err(|e| format!("Failed to create customapp directory {:?}: {}", dir, e))?;
    }

    let entries = std::fs::read_dir(dir)
        .map_err(|e| format!("Failed to read customapp directory {:?}: {}", dir, e))?;

    let mut items = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if name.starts_with('.') || name.eq_ignore_ascii_case("desktop.ini") {
                continue;
            }
        }

        let name = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Unknown")
            .to_string();

        let (target_path, item_type) = if has_extension(&path, "lnk") {
            (resolve_lnk(&path).unwrap_or_default(), "shortcut".to_string())
        } else if path.is_dir() {
            (path.to_string_lossy().to_string(), "folder".to_string())
        } else if has_extension(&path, "exe") {
            (path.to_string_lossy().to_string(), "executable".to_string())
        } else {
            (path.to_string_lossy().to_string(), "file".to_string())
        };

        items.push(ScannedDesktopItem {
            name,
            path: path.to_string_lossy().to_string(),
            target_path,
            item_type,
        });
    }

    items.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(items)
}

#[cfg(windows)]
fn extract_icon_for_scanned_item(item: &ScannedDesktopItem, icon_size: i32) -> String {
    if item.item_type == "special" {
        return create_recycle_bin_icon(icon_size)
            .map(|icon| icon.icon_base64)
            .unwrap_or_default();
    }

    let item_path = PathBuf::from(&item.path);
    extract_icon_for_item(&item_path, &item.target_path, &item.item_type, icon_size)
}

#[cfg(windows)]
fn bucket_actual_size(bucket: IconBucket) -> i32 {
    let scaled = (bucket.logical_size() as f64 * get_dpi_scale()).round() as i32;
    scaled.max(bucket.logical_size())
}

#[cfg(windows)]
fn save_scanned_icon_for_bucket(
    app_handle: &tauri::AppHandle,
    item: &ScannedDesktopItem,
    id: &str,
    bucket: IconBucket,
    source: IconSource,
) -> Result<String, String> {
    let icon_data_uri = extract_icon_for_scanned_item(item, bucket_actual_size(bucket));
    if icon_data_uri.is_empty() {
        return Ok(String::new());
    }

    let icon_data = match decode_data_uri_png(&icon_data_uri) {
        Ok(data) => data,
        Err(_) => return Ok(String::new()),
    };

    let rel_path = icon_file_rel_path(id, bucket, source);
    let abs_path = snapshot_base_dir(app_handle)?.join(&rel_path);
    if let Some(parent) = abs_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create icon cache directory {:?}: {}", parent, e))?;
    }
    std::fs::write(&abs_path, icon_data)
        .map_err(|e| format!("Failed to write icon file {:?}: {}", abs_path, e))?;
    Ok(rel_path)
}

#[cfg(windows)]
fn build_snapshot_item(
    app_handle: &tauri::AppHandle,
    item: &ScannedDesktopItem,
    source: IconSource,
) -> Result<SnapshotIconItem, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let key = stable_item_key(item);
    let icons = SnapshotIconPaths {
        small: save_scanned_icon_for_bucket(app_handle, item, &id, IconBucket::Small, source)?,
        medium: save_scanned_icon_for_bucket(app_handle, item, &id, IconBucket::Medium, source)?,
        large: save_scanned_icon_for_bucket(app_handle, item, &id, IconBucket::Large, source)?,
    };

    Ok(SnapshotIconItem {
        id,
        key,
        name: item.name.clone(),
        path: item.path.clone(),
        target_path: item.target_path.clone(),
        item_type: item.item_type.clone(),
        hidden: false,
        source: source.as_str().to_string(),
        icons,
    })
}

#[cfg(windows)]
fn snapshot_to_desktop_icons(
    app_handle: &tauri::AppHandle,
    snapshot: &IconSnapshot,
    icon_size: i32,
) -> Vec<DesktopIcon> {
    let bucket = IconBucket::from_logical_size(icon_size);
    let base_dir = match snapshot_base_dir(app_handle) {
        Ok(dir) => dir,
        Err(e) => {
            eprintln!("Failed to resolve icon snapshot directory: {}", e);
            return Vec::new();
        }
    };

    snapshot
        .icons
        .iter()
        .filter(|item| !item.hidden)
        .map(|item| {
            let rel_path = match bucket {
                IconBucket::Small => &item.icons.small,
                IconBucket::Medium => &item.icons.medium,
                IconBucket::Large => &item.icons.large,
            };
            let icon_base64 = if rel_path.is_empty() {
                String::new()
            } else {
                read_icon_file_as_data_uri(&base_dir.join(rel_path))
            };

            DesktopIcon {
                id: item.id.clone(),
                name: item.name.clone(),
                path: item.path.clone(),
                target_path: item.target_path.clone(),
                icon_base64,
                item_type: item.item_type.clone(),
                source: IconSource::from_value(&item.source).as_str().to_string(),
            }
        })
        .collect()
}

#[cfg(windows)]
fn build_full_snapshot(
    app_handle: &tauri::AppHandle,
    source: IconSource,
    scanned_items: &[ScannedDesktopItem],
) -> Result<IconSnapshot, String> {
    ensure_icon_cache_dirs(app_handle, source)?;
    let mut seen_keys = HashSet::new();
    let mut icons = Vec::new();

    for item in scanned_items {
        let key = stable_item_key(item);
        if !seen_keys.insert(key) {
            continue;
        }
        icons.push(build_snapshot_item(app_handle, item, source)?);
    }

    Ok(IconSnapshot { version: 1, icons })
}

#[cfg(windows)]
fn load_or_init_icons_snapshot_windows<F>(
    app_handle: &tauri::AppHandle,
    icon_size: i32,
    source: IconSource,
    collect_items: F,
) -> Result<Vec<DesktopIcon>, String>
where
    F: FnOnce() -> Result<Vec<ScannedDesktopItem>, String>,
{
    let snapshot = match read_icon_snapshot(app_handle, source)? {
        Some(snapshot) => snapshot,
        None => {
            let scanned_items = collect_items()?;
            let snapshot = build_full_snapshot(app_handle, source, &scanned_items)?;
            write_icon_snapshot(app_handle, source, &snapshot)?;
            snapshot
        }
    };

    Ok(snapshot_to_desktop_icons(app_handle, &snapshot, icon_size))
}

#[cfg(windows)]
fn sync_new_icons_windows<F>(
    app_handle: &tauri::AppHandle,
    source: IconSource,
    collect_items: F,
) -> Result<IconSyncResult, String>
where
    F: FnOnce() -> Result<Vec<ScannedDesktopItem>, String>,
{
    ensure_icon_cache_dirs(app_handle, source)?;
    let mut snapshot = read_icon_snapshot(app_handle, source)?.unwrap_or(IconSnapshot {
        version: 1,
        icons: Vec::new(),
    });

    let scanned_items = collect_items()?;
    let mut known_keys = snapshot
        .icons
        .iter()
        .map(|item| item.key.clone())
        .collect::<HashSet<_>>();

    let mut added_count = 0usize;
    for item in &scanned_items {
        let key = stable_item_key(item);
        if known_keys.contains(&key) {
            continue;
        }

        let snapshot_item = build_snapshot_item(app_handle, item, source)?;
        known_keys.insert(snapshot_item.key.clone());
        snapshot.icons.push(snapshot_item);
        added_count += 1;
    }

    write_icon_snapshot(app_handle, source, &snapshot)?;

    Ok(IconSyncResult {
        mode: "incremental".to_string(),
        scanned_count: scanned_items.len(),
        added_count,
        total_count: snapshot.icons.len(),
    })
}

#[cfg(windows)]
fn sync_full_icons_windows<F>(
    app_handle: &tauri::AppHandle,
    source: IconSource,
    collect_items: F,
) -> Result<IconSyncResult, String>
where
    F: FnOnce() -> Result<Vec<ScannedDesktopItem>, String>,
{
    ensure_icon_cache_dirs(app_handle, source)?;
    let existing_snapshot = read_icon_snapshot(app_handle, source)?.unwrap_or(IconSnapshot {
        version: 1,
        icons: Vec::new(),
    });
    let scanned_items = collect_items()?;
    let mut scanned_keys = HashSet::new();
    let mut unique_scanned_items = Vec::new();
    for item in &scanned_items {
        let key = stable_item_key(item);
        if scanned_keys.insert(key) {
            unique_scanned_items.push(item.clone());
        }
    }

    let mut existing_by_key: HashMap<String, Vec<SnapshotIconItem>> = HashMap::new();
    for snapshot_item in existing_snapshot.icons {
        existing_by_key
            .entry(snapshot_item.key.clone())
            .or_default()
            .push(snapshot_item);
    }

    let mut next_icons = Vec::with_capacity(unique_scanned_items.len());
    let mut added_count = 0usize;
    for item in &unique_scanned_items {
        let key = stable_item_key(item);
        if let Some(existing_items) = existing_by_key.get_mut(&key) {
            if !existing_items.is_empty() {
                let mut reused = existing_items.remove(0);
                reused.source = source.as_str().to_string();
                next_icons.push(reused);
                continue;
            }
        }

        next_icons.push(build_snapshot_item(app_handle, item, source)?);
        added_count += 1;
    }

    let mut removed_items = Vec::new();
    for mut leftovers in existing_by_key.into_values() {
        removed_items.append(&mut leftovers);
    }

    for item in &removed_items {
        remove_cached_icon_file(app_handle, &item.icons.small)?;
        remove_cached_icon_file(app_handle, &item.icons.medium)?;
        remove_cached_icon_file(app_handle, &item.icons.large)?;
    }

    let snapshot = IconSnapshot {
        version: 1,
        icons: next_icons,
    };
    let total_count = snapshot.icons.len();
    write_icon_snapshot(app_handle, source, &snapshot)?;

    Ok(IconSyncResult {
        mode: "full".to_string(),
        scanned_count: scanned_items.len(),
        added_count,
        total_count,
    })
}

#[cfg(windows)]
fn split_targets_by_source(targets: &[IconMutationTarget]) -> (HashSet<String>, HashSet<String>) {
    let mut desktop_ids = HashSet::new();
    let mut customapp_ids = HashSet::new();

    for target in targets {
        if target.id.trim().is_empty() {
            continue;
        }
        if IconSource::from_value(&target.source) == IconSource::CustomApp {
            customapp_ids.insert(target.id.clone());
        } else {
            desktop_ids.insert(target.id.clone());
        }
    }

    (desktop_ids, customapp_ids)
}

#[cfg(windows)]
fn hide_icons_in_snapshot_windows(
    app_handle: &tauri::AppHandle,
    source: IconSource,
    id_set: &HashSet<String>,
) -> Result<usize, String> {
    if id_set.is_empty() {
        return Ok(0);
    }

    let mut snapshot = match read_icon_snapshot(app_handle, source)? {
        Some(snapshot) => snapshot,
        None => return Ok(0),
    };

    let mut hidden_count = 0usize;
    for item in &mut snapshot.icons {
        if id_set.contains(&item.id) && !item.hidden {
            item.hidden = true;
            hidden_count += 1;
        }
    }

    if hidden_count > 0 {
        write_icon_snapshot(app_handle, source, &snapshot)?;
    }

    Ok(hidden_count)
}

#[cfg(windows)]
fn delete_icons_in_snapshot_windows(
    app_handle: &tauri::AppHandle,
    source: IconSource,
    id_set: &HashSet<String>,
) -> Result<usize, String> {
    if id_set.is_empty() {
        return Ok(0);
    }

    let mut snapshot = match read_icon_snapshot(app_handle, source)? {
        Some(snapshot) => snapshot,
        None => return Ok(0),
    };

    let mut removed_items = Vec::new();
    snapshot.icons.retain(|item| {
        if id_set.contains(&item.id) {
            removed_items.push(item.clone());
            false
        } else {
            true
        }
    });

    if removed_items.is_empty() {
        return Ok(0);
    }

    for item in &removed_items {
        remove_cached_icon_file(app_handle, &item.icons.small)?;
        remove_cached_icon_file(app_handle, &item.icons.medium)?;
        remove_cached_icon_file(app_handle, &item.icons.large)?;
    }

    write_icon_snapshot(app_handle, source, &snapshot)?;
    Ok(removed_items.len())
}

#[cfg(windows)]
fn hide_icons_windows(
    app_handle: &tauri::AppHandle,
    targets: &[IconMutationTarget],
) -> Result<usize, String> {
    if targets.is_empty() {
        return Ok(0);
    }

    let (desktop_ids, customapp_ids) = split_targets_by_source(targets);
    let desktop_hidden =
        hide_icons_in_snapshot_windows(app_handle, IconSource::Desktop, &desktop_ids)?;
    let customapp_hidden =
        hide_icons_in_snapshot_windows(app_handle, IconSource::CustomApp, &customapp_ids)?;

    Ok(desktop_hidden + customapp_hidden)
}

#[cfg(windows)]
fn delete_icons_windows(
    app_handle: &tauri::AppHandle,
    targets: &[IconMutationTarget],
) -> Result<usize, String> {
    if targets.is_empty() {
        return Ok(0);
    }

    let (desktop_ids, customapp_ids) = split_targets_by_source(targets);
    let desktop_removed =
        delete_icons_in_snapshot_windows(app_handle, IconSource::Desktop, &desktop_ids)?;
    let customapp_removed =
        delete_icons_in_snapshot_windows(app_handle, IconSource::CustomApp, &customapp_ids)?;

    Ok(desktop_removed + customapp_removed)
}

#[cfg(windows)]
fn default_customapp_dir_windows(_app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let exe_path =
        std::env::current_exe().map_err(|e| format!("Failed to resolve executable path: {}", e))?;
    let exe_dir = exe_path
        .parent()
        .ok_or_else(|| format!("Failed to resolve executable parent directory: {:?}", exe_path))?;
    let custom_dir = exe_dir.join("customapp");
    if !custom_dir.exists() {
        std::fs::create_dir_all(&custom_dir).map_err(|e| {
            format!(
                "Failed to create default customapp directory {:?}: {}",
                custom_dir, e
            )
        })?;
    }
    Ok(custom_dir)
}

#[cfg(windows)]
fn resolve_customapp_dir_windows(
    app_handle: &tauri::AppHandle,
    custom_app_dir: Option<String>,
) -> Result<PathBuf, String> {
    let trimmed = custom_app_dir.unwrap_or_default().trim().to_string();
    let dir = if trimmed.is_empty() {
        default_customapp_dir_windows(app_handle)?
    } else {
        PathBuf::from(trimmed)
    };

    if !dir.exists() {
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create customapp directory {:?}: {}", dir, e))?;
    }
    Ok(dir)
}

#[cfg(windows)]
fn get_all_icons_windows(
    app_handle: &tauri::AppHandle,
    icon_size: i32,
    custom_app_dir: Option<String>,
) -> Result<Vec<DesktopIcon>, String> {
    let desktop_icons = load_or_init_icons_snapshot_windows(
        app_handle,
        icon_size,
        IconSource::Desktop,
        || Ok(collect_desktop_items()),
    )?;

    let custom_dir = resolve_customapp_dir_windows(app_handle, custom_app_dir)?;
    let custom_icons = load_or_init_icons_snapshot_windows(
        app_handle,
        icon_size,
        IconSource::CustomApp,
        || collect_items_from_single_dir(&custom_dir),
    )?;

    let mut all_icons = Vec::with_capacity(desktop_icons.len() + custom_icons.len());
    all_icons.extend(desktop_icons);
    all_icons.extend(custom_icons);
    all_icons.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(all_icons)
}
