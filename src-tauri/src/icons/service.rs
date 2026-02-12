use base64::Engine;
use std::collections::HashSet;
use std::path::PathBuf;
use tauri::Manager;

use super::models::{
    DesktopIcon, IconBucket, IconSnapshot, IconSyncResult, ScannedDesktopItem, SnapshotIconItem,
    SnapshotIconPaths,
};
#[cfg(windows)]
use super::platform_windows::{
    create_recycle_bin_icon, extract_icon_for_item, get_desktop_dirs, get_dpi_scale,
    launch_app_windows, resolve_lnk, scan_desktop_items,
};
pub fn get_desktop_icons(app_handle: tauri::AppHandle, icon_size: i32) -> Vec<DesktopIcon> {
    #[cfg(windows)]
    {
        match load_or_init_icons_snapshot_windows(&app_handle, icon_size) {
            Ok(icons) => icons,
            Err(e) => {
                eprintln!("Failed to load icon snapshot: {}", e);
                Vec::new()
            }
        }
    }
    #[cfg(not(windows))]
    {
        let _ = app_handle;
        let _ = icon_size;
        Vec::new()
    }
}

pub fn sync_new_desktop_icons(app_handle: tauri::AppHandle) -> Result<IconSyncResult, String> {
    #[cfg(windows)]
    {
        sync_new_desktop_icons_windows(&app_handle)
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
        sync_full_desktop_icons_windows(&app_handle)
    }
    #[cfg(not(windows))]
    {
        let _ = app_handle;
        Err("Not supported on this platform".to_string())
    }
}

pub fn hide_desktop_icons(app_handle: tauri::AppHandle, ids: Vec<String>) -> Result<usize, String> {
    #[cfg(windows)]
    {
        hide_desktop_icons_windows(&app_handle, &ids)
    }
    #[cfg(not(windows))]
    {
        let _ = app_handle;
        let _ = ids;
        Err("Not supported on this platform".to_string())
    }
}

pub fn delete_desktop_icons(
    app_handle: tauri::AppHandle,
    ids: Vec<String>,
) -> Result<usize, String> {
    #[cfg(windows)]
    {
        delete_desktop_icons_windows(&app_handle, &ids)
    }
    #[cfg(not(windows))]
    {
        let _ = app_handle;
        let _ = ids;
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

// ===== Windows implementations =====

#[cfg(windows)]
fn snapshot_base_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    app_handle
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Failed to resolve app local data directory: {}", e))
}

#[cfg(windows)]
fn snapshot_file_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(snapshot_base_dir(app_handle)?.join("icons_snapshot.json"))
}

#[cfg(windows)]
fn read_icon_snapshot(app_handle: &tauri::AppHandle) -> Result<Option<IconSnapshot>, String> {
    let path = snapshot_file_path(app_handle)?;
    if !path.exists() {
        return Ok(None);
    }

    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read icon snapshot file: {}", e))?;
    let snapshot: IconSnapshot = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse icon snapshot JSON: {}", e))?;
    Ok(Some(snapshot))
}

#[cfg(windows)]
fn write_icon_snapshot(
    app_handle: &tauri::AppHandle,
    snapshot: &IconSnapshot,
) -> Result<(), String> {
    let path = snapshot_file_path(app_handle)?;
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
fn ensure_icon_cache_dirs(app_handle: &tauri::AppHandle) -> Result<(), String> {
    let base_dir = snapshot_base_dir(app_handle)?;
    for bucket in [IconBucket::Small, IconBucket::Medium, IconBucket::Large] {
        let dir = base_dir.join("icons").join(bucket.folder_name());
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create icon cache directory {:?}: {}", dir, e))?;
    }
    Ok(())
}

#[cfg(windows)]
fn clear_icon_cache_dirs(app_handle: &tauri::AppHandle) -> Result<(), String> {
    let icon_root = snapshot_base_dir(app_handle)?.join("icons");
    if icon_root.exists() {
        std::fs::remove_dir_all(&icon_root).map_err(|e| {
            format!(
                "Failed to clear icon cache directory {:?}: {}",
                icon_root, e
            )
        })?;
    }
    ensure_icon_cache_dirs(app_handle)?;
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
fn icon_file_rel_path(id: &str, bucket: IconBucket) -> String {
    format!("icons/{}/{}.png", bucket.folder_name(), id)
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
fn stable_desktop_item_key(item: &ScannedDesktopItem) -> String {
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

        let (target_path, item_type) =
            if item_path.extension().and_then(|e| e.to_str()) == Some("lnk") {
                (
                    resolve_lnk(&item_path).unwrap_or_default(),
                    "shortcut".to_string(),
                )
            } else if item_path.is_dir() {
                (
                    item_path.to_string_lossy().to_string(),
                    "folder".to_string(),
                )
            } else if item_path.extension().and_then(|e| e.to_str()) == Some("exe") {
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
) -> Result<String, String> {
    let icon_data_uri = extract_icon_for_scanned_item(item, bucket_actual_size(bucket));
    if icon_data_uri.is_empty() {
        return Ok(String::new());
    }

    let icon_data = match decode_data_uri_png(&icon_data_uri) {
        Ok(data) => data,
        Err(_) => return Ok(String::new()),
    };

    let rel_path = icon_file_rel_path(id, bucket);
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
) -> Result<SnapshotIconItem, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let key = stable_desktop_item_key(item);
    let icons = SnapshotIconPaths {
        small: save_scanned_icon_for_bucket(app_handle, item, &id, IconBucket::Small)?,
        medium: save_scanned_icon_for_bucket(app_handle, item, &id, IconBucket::Medium)?,
        large: save_scanned_icon_for_bucket(app_handle, item, &id, IconBucket::Large)?,
    };

    Ok(SnapshotIconItem {
        id,
        key,
        name: item.name.clone(),
        path: item.path.clone(),
        target_path: item.target_path.clone(),
        item_type: item.item_type.clone(),
        hidden: false,
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
            }
        })
        .collect()
}

#[cfg(windows)]
fn build_full_snapshot(
    app_handle: &tauri::AppHandle,
    scanned_items: &[ScannedDesktopItem],
) -> Result<IconSnapshot, String> {
    ensure_icon_cache_dirs(app_handle)?;
    let mut seen_keys = HashSet::new();
    let mut icons = Vec::new();

    for item in scanned_items {
        let key = stable_desktop_item_key(item);
        if !seen_keys.insert(key) {
            continue;
        }
        icons.push(build_snapshot_item(app_handle, item)?);
    }

    Ok(IconSnapshot { version: 1, icons })
}

#[cfg(windows)]
fn load_or_init_icons_snapshot_windows(
    app_handle: &tauri::AppHandle,
    icon_size: i32,
) -> Result<Vec<DesktopIcon>, String> {
    let snapshot = match read_icon_snapshot(app_handle)? {
        Some(snapshot) => snapshot,
        None => {
            let scanned_items = collect_desktop_items();
            let snapshot = build_full_snapshot(app_handle, &scanned_items)?;
            write_icon_snapshot(app_handle, &snapshot)?;
            snapshot
        }
    };

    Ok(snapshot_to_desktop_icons(app_handle, &snapshot, icon_size))
}

#[cfg(windows)]
fn sync_new_desktop_icons_windows(app_handle: &tauri::AppHandle) -> Result<IconSyncResult, String> {
    ensure_icon_cache_dirs(app_handle)?;
    let mut snapshot = read_icon_snapshot(app_handle)?.unwrap_or(IconSnapshot {
        version: 1,
        icons: Vec::new(),
    });

    let scanned_items = collect_desktop_items();
    let mut known_keys = snapshot
        .icons
        .iter()
        .map(|item| item.key.clone())
        .collect::<HashSet<_>>();

    let mut added_count = 0usize;
    for item in &scanned_items {
        let key = stable_desktop_item_key(item);
        if known_keys.contains(&key) {
            continue;
        }

        let snapshot_item = build_snapshot_item(app_handle, item)?;
        known_keys.insert(snapshot_item.key.clone());
        snapshot.icons.push(snapshot_item);
        added_count += 1;
    }

    write_icon_snapshot(app_handle, &snapshot)?;

    Ok(IconSyncResult {
        mode: "incremental".to_string(),
        scanned_count: scanned_items.len(),
        added_count,
        total_count: snapshot.icons.len(),
    })
}

#[cfg(windows)]
fn sync_full_desktop_icons_windows(
    app_handle: &tauri::AppHandle,
) -> Result<IconSyncResult, String> {
    clear_icon_cache_dirs(app_handle)?;
    let scanned_items = collect_desktop_items();
    let snapshot = build_full_snapshot(app_handle, &scanned_items)?;
    let total_count = snapshot.icons.len();
    write_icon_snapshot(app_handle, &snapshot)?;

    Ok(IconSyncResult {
        mode: "full".to_string(),
        scanned_count: scanned_items.len(),
        added_count: total_count,
        total_count,
    })
}

#[cfg(windows)]
fn hide_desktop_icons_windows(
    app_handle: &tauri::AppHandle,
    ids: &[String],
) -> Result<usize, String> {
    if ids.is_empty() {
        return Ok(0);
    }

    let id_set = ids.iter().cloned().collect::<HashSet<_>>();
    let mut snapshot = match read_icon_snapshot(app_handle)? {
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

    write_icon_snapshot(app_handle, &snapshot)?;
    Ok(hidden_count)
}

#[cfg(windows)]
fn delete_desktop_icons_windows(
    app_handle: &tauri::AppHandle,
    ids: &[String],
) -> Result<usize, String> {
    if ids.is_empty() {
        return Ok(0);
    }

    let id_set = ids.iter().cloned().collect::<HashSet<_>>();
    let mut snapshot = match read_icon_snapshot(app_handle)? {
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

    for item in &removed_items {
        remove_cached_icon_file(app_handle, &item.icons.small)?;
        remove_cached_icon_file(app_handle, &item.icons.medium)?;
        remove_cached_icon_file(app_handle, &item.icons.large)?;
    }

    write_icon_snapshot(app_handle, &snapshot)?;
    Ok(removed_items.len())
}
