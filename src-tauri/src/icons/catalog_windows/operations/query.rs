use std::path::PathBuf;

use super::super::image::{
    build_scanned_icon_path, get_path_icon_base64_windows, icon_file_rel_path,
    image_file_to_original_data_uri, read_icon_file_as_data_uri, NATIVE_ICON_EDIT_EXTRACT_SIZE,
};
use super::super::item::{is_automatic_target_icon, set_automatic_target_icon_cache};
use super::super::source::{IconSource, AUTOMATIC_TARGET_ICON_CACHE_VERSION};
use super::super::storage::{
    is_legacy_bucket_icon_path, load_icon_library_snapshot, remove_cached_icon_file,
    snapshot_base_dir, write_icon_snapshot,
};
use super::super::view::{
    snapshot_to_ordered_desktop_icons, snapshot_to_ordered_icon_manager_items,
};
use crate::icons::models::{
    DesktopIcon, IconManagerItem, IconSnapshot, ScannedDesktopItem, SnapshotIconItem,
};

fn requires_target_icon_cache_refresh(item: &SnapshotIconItem) -> bool {
    item.automatic_target_icon_cache
        && !item.icon.is_empty()
        && item.automatic_target_icon_cache_version < AUTOMATIC_TARGET_ICON_CACHE_VERSION
        && is_automatic_target_icon(item)
}

struct RefreshedTargetIconCache {
    old_rel_path: String,
    new_rel_path: String,
}

fn scanned_item_from_snapshot(item: &SnapshotIconItem) -> ScannedDesktopItem {
    ScannedDesktopItem {
        name: item.name.clone(),
        path: item.path.clone(),
        target_path: item.target_path.clone(),
        item_type: item.item_type.clone(),
    }
}

fn remove_uncommitted_target_icon_cache(app_handle: &tauri::AppHandle, rel_path: &str) {
    if let Err(error) = remove_cached_icon_file(app_handle, rel_path) {
        eprintln!("Failed to remove uncommitted icon cache {rel_path}: {error}");
    }
}

fn refresh_outdated_target_icon_cache(
    app_handle: &tauri::AppHandle,
    snapshot: &mut IconSnapshot,
) -> Vec<RefreshedTargetIconCache> {
    let mut refreshed_caches = Vec::new();
    for item in &mut snapshot.icons {
        if !requires_target_icon_cache_refresh(item) {
            continue;
        }

        let cache_id = uuid::Uuid::new_v4().to_string();
        let new_rel_path = icon_file_rel_path(&cache_id, IconSource::Library);
        match build_scanned_icon_path(
            app_handle,
            &scanned_item_from_snapshot(item),
            &cache_id,
            IconSource::Library,
        ) {
            Ok(icon) if !icon.is_empty() => {
                let old_rel_path = std::mem::replace(&mut item.icon, icon.clone());
                set_automatic_target_icon_cache(item, true);
                refreshed_caches.push(RefreshedTargetIconCache {
                    old_rel_path,
                    new_rel_path: icon,
                });
            }
            Ok(_) => {}
            Err(error) => {
                eprintln!("Failed to refresh icon cache for {}: {error}", item.id);
                remove_uncommitted_target_icon_cache(app_handle, &new_rel_path);
            }
        }
    }
    refreshed_caches
}

fn load_icon_library_query_snapshot(app_handle: &tauri::AppHandle) -> Result<IconSnapshot, String> {
    let mut snapshot = load_icon_library_snapshot(app_handle)?;
    let refreshed_caches = refresh_outdated_target_icon_cache(app_handle, &mut snapshot);
    if refreshed_caches.is_empty() {
        return Ok(snapshot);
    }

    if let Err(error) = write_icon_snapshot(app_handle, IconSource::Library, &snapshot) {
        for cache in &refreshed_caches {
            remove_uncommitted_target_icon_cache(app_handle, &cache.new_rel_path);
        }
        return Err(error);
    }

    for cache in refreshed_caches {
        if let Err(error) = remove_cached_icon_file(app_handle, &cache.old_rel_path) {
            eprintln!(
                "Failed to remove replaced icon cache {}: {error}",
                cache.old_rel_path
            );
        }
    }
    Ok(snapshot)
}

pub(in crate::icons) fn get_all_icons_windows(
    app_handle: &tauri::AppHandle,
    icon_size: i32,
) -> Result<Vec<DesktopIcon>, String> {
    Ok(snapshot_to_ordered_desktop_icons(
        app_handle,
        &load_icon_library_query_snapshot(app_handle)?,
        icon_size,
    )
    .into_iter()
    .map(|(_, icon)| icon)
    .collect())
}

pub(in crate::icons) fn get_all_icon_manager_items_windows(
    app_handle: &tauri::AppHandle,
    icon_size: i32,
) -> Result<Vec<IconManagerItem>, String> {
    Ok(snapshot_to_ordered_icon_manager_items(
        app_handle,
        &load_icon_library_query_snapshot(app_handle)?,
        icon_size,
    )
    .into_iter()
    .map(|(_, icon)| icon)
    .collect())
}

pub(in crate::icons) fn get_icon_edit_source(
    app_handle: &tauri::AppHandle,
    id: &str,
) -> Result<String, String> {
    let snapshot = load_icon_library_query_snapshot(app_handle)?;
    let item = snapshot
        .icons
        .iter()
        .find(|item| item.id == id)
        .ok_or_else(|| "Icon entry was not found".to_string())?;
    let rel_path = item.icon.as_str();
    if rel_path.is_empty() {
        return Ok(String::new());
    }

    if is_legacy_bucket_icon_path(rel_path) && !item.custom_icon_path.is_empty() {
        let original_path = PathBuf::from(&item.custom_icon_path);
        if let Some(source) = image_file_to_original_data_uri(&original_path) {
            return Ok(source);
        }
    }

    let source = read_icon_file_as_data_uri(&snapshot_base_dir(app_handle)?.join(rel_path));
    if source.is_empty() {
        return Err("Icon edit source could not be read".to_string());
    }
    Ok(source)
}

pub(in crate::icons) fn get_custom_icon_source(path: &str) -> Result<String, String> {
    let item_path = PathBuf::from(path);
    if !item_path.is_file() {
        return Err("Custom icon path does not point to a file".to_string());
    }
    if let Some(source) = image_file_to_original_data_uri(&item_path) {
        return Ok(source);
    }

    let source = get_path_icon_base64_windows(path, NATIVE_ICON_EDIT_EXTRACT_SIZE);
    if source.is_empty() {
        return Err("Custom icon could not be extracted".to_string());
    }
    Ok(source)
}

#[cfg(test)]
mod tests {
    use crate::icons::models::SnapshotIconItem;

    use super::{
        icon_file_rel_path, requires_target_icon_cache_refresh, IconSource,
        AUTOMATIC_TARGET_ICON_CACHE_VERSION,
    };

    fn target_item() -> SnapshotIconItem {
        SnapshotIconItem {
            id: "item-id".to_string(),
            key: "item-key".to_string(),
            display_order: 1,
            name: "Example".to_string(),
            path: "C:\\Icons\\example.lnk".to_string(),
            target_path: "C:\\Apps\\example.exe".to_string(),
            launch_arguments: String::new(),
            working_directory: String::new(),
            custom_icon_path: String::new(),
            icon_source: "target".to_string(),
            icon_color: "none".to_string(),
            icon_text: String::new(),
            item_type: "shortcut".to_string(),
            hidden: false,
            icon: "icons/library/item-id.img".to_string(),
            automatic_target_icon_cache: false,
            automatic_target_icon_cache_version: 0,
            legacy_icons: None,
        }
    }

    #[test]
    fn refreshes_only_outdated_automatic_target_icons() {
        let target = target_item();
        assert!(!requires_target_icon_cache_refresh(&target));

        let mut automatic_target = target.clone();
        automatic_target.automatic_target_icon_cache = true;
        assert!(requires_target_icon_cache_refresh(&automatic_target));

        let mut current = automatic_target.clone();
        current.automatic_target_icon_cache_version = AUTOMATIC_TARGET_ICON_CACHE_VERSION;
        assert!(!requires_target_icon_cache_refresh(&current));

        let mut generated_target = automatic_target.clone();
        generated_target.automatic_target_icon_cache = false;
        assert!(!requires_target_icon_cache_refresh(&generated_target));

        let mut shell_target = automatic_target.clone();
        shell_target.target_path = "::{20D04FE0-3AEA-1069-A2D8-08002B30309D}".to_string();
        assert!(!requires_target_icon_cache_refresh(&shell_target));

        let mut empty = automatic_target.clone();
        empty.icon.clear();
        assert!(!requires_target_icon_cache_refresh(&empty));

        for source in ["custom", "text"] {
            let mut item = automatic_target.clone();
            item.icon_source = source.to_string();
            assert!(!requires_target_icon_cache_refresh(&item));
        }

        for item_type in ["special", "website"] {
            let mut item = automatic_target.clone();
            item.item_type = item_type.to_string();
            assert!(!requires_target_icon_cache_refresh(&item));
        }
    }

    #[test]
    fn target_icon_refresh_uses_the_generated_library_cache_path() {
        assert_eq!(
            icon_file_rel_path("new-cache-id", IconSource::Library),
            "icons/library/new-cache-id.img"
        );
    }
}
