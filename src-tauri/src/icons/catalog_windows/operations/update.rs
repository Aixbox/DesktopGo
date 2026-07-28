use std::path::PathBuf;

use crate::icons::models::{
    IconSnapshot, ScannedDesktopItem, SnapshotIconItem, UpdateIconEntryInput,
};

use super::super::image::{
    build_custom_icon_path, build_data_icon_path, build_scanned_icon_path, icon_file_rel_path,
};
use super::super::item::{build_scanned_item_from_path, stable_item_key};
use super::super::source::IconSource;
use super::super::storage::{
    load_icon_library_snapshot, remove_cached_icon_file, write_icon_snapshot,
};
use super::entry::{create_managed_shortcut, has_duplicate_entry, NormalizedIconEntry};
use super::import::icon_entry_dir_windows;

struct UpdateWriteContext<'a> {
    item_index: usize,
    entry: &'a NormalizedIconEntry,
    destination_path: Option<&'a std::path::Path>,
    replacement_cache_id: &'a str,
}

pub(in crate::icons) fn update_icon_entry_windows(
    app_handle: &tauri::AppHandle,
    input: UpdateIconEntryInput,
) -> Result<(), String> {
    let entry = NormalizedIconEntry::from_update(&input)?;
    let mut snapshot = load_icon_library_snapshot(app_handle)?;
    let item_index = snapshot
        .icons
        .iter()
        .position(|item| item.id == input.id)
        .ok_or_else(|| "Icon entry no longer exists".to_string())?;
    let original_item = snapshot.icons[item_index].clone();
    if has_duplicate_entry(&snapshot, Some(&input.id), &entry) {
        return Err("An icon with the same target and launch options already exists".to_string());
    }

    let managed_entry_dir = icon_entry_dir_windows(app_handle)?;
    let destination_path = if entry.is_web {
        None
    } else {
        Some(create_managed_shortcut(&managed_entry_dir, &entry)?)
    };
    let replacement_cache_id = uuid::Uuid::new_v4().to_string();
    let write_context = UpdateWriteContext {
        item_index,
        entry: &entry,
        destination_path: destination_path.as_deref(),
        replacement_cache_id: &replacement_cache_id,
    };
    if let Err(error) = write_updated_entry(app_handle, &mut snapshot, write_context) {
        remove_file(destination_path.as_deref());
        let _ = remove_cached_icon_file(
            app_handle,
            &icon_file_rel_path(&replacement_cache_id, IconSource::Library),
        );
        return Err(error);
    }

    let _ = remove_cached_icon_file(app_handle, &original_item.icon);
    remove_replaced_entry(
        &original_item.path,
        &managed_entry_dir,
        destination_path.as_deref(),
    );
    Ok(())
}

fn write_updated_entry(
    app_handle: &tauri::AppHandle,
    snapshot: &mut IconSnapshot,
    context: UpdateWriteContext<'_>,
) -> Result<(), String> {
    let UpdateWriteContext {
        item_index,
        entry,
        destination_path,
        replacement_cache_id,
    } = context;
    let updated_scan = match destination_path {
        Some(path) => build_scanned_item_from_path(path)
            .ok_or_else(|| "Updated icon entry could not be read".to_string())?,
        None => entry.scanned_item.clone(),
    };
    let next_icon = build_next_icon(app_handle, entry, &updated_scan, replacement_cache_id)?;
    let updated_item = &mut snapshot.icons[item_index];
    apply_updated_item(updated_item, entry, updated_scan, next_icon);
    write_icon_snapshot(app_handle, IconSource::Library, snapshot)
}

fn build_next_icon(
    app_handle: &tauri::AppHandle,
    entry: &NormalizedIconEntry,
    updated_scan: &ScannedDesktopItem,
    cache_id: &str,
) -> Result<String, String> {
    if entry.icon_source == "text" && entry.generated_icon_base64.is_empty() {
        return Err("Generated text icon is required".to_string());
    }
    if entry.icon_source == "custom" && entry.generated_icon_base64.is_empty() {
        return build_custom_icon_path(
            app_handle,
            &entry.custom_icon_path,
            cache_id,
            IconSource::Library,
        );
    }
    let data = if !entry.generated_icon_base64.is_empty() {
        Some(entry.generated_icon_base64.as_str())
    } else if entry.is_web && !entry.website_icon_base64.is_empty() {
        Some(entry.website_icon_base64.as_str())
    } else {
        None
    };
    match data {
        Some(data) => build_data_icon_path(app_handle, data, cache_id, IconSource::Library),
        None => build_scanned_icon_path(app_handle, updated_scan, cache_id, IconSource::Library),
    }
}

fn apply_updated_item(
    item: &mut SnapshotIconItem,
    entry: &NormalizedIconEntry,
    updated_scan: ScannedDesktopItem,
    next_icon: String,
) {
    item.key = stable_item_key(&updated_scan);
    item.path = updated_scan.path;
    item.target_path = updated_scan.target_path;
    item.item_type = updated_scan.item_type;
    item.icon = next_icon;
    item.legacy_icons = None;
    entry.apply_metadata(item);
}

fn remove_file(path: Option<&std::path::Path>) {
    if let Some(path) = path {
        let _ = std::fs::remove_file(path);
    }
}

fn remove_replaced_entry(
    original_path: &str,
    managed_entry_dir: &std::path::Path,
    destination_path: Option<&std::path::Path>,
) {
    let original_entry_path = PathBuf::from(original_path);
    if original_entry_path.parent() == Some(managed_entry_dir)
        && original_entry_path.is_file()
        && destination_path != Some(original_entry_path.as_path())
    {
        let _ = std::fs::remove_file(original_entry_path);
    }
}
