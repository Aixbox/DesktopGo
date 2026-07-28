use std::path::{Path, PathBuf};

use crate::icons::models::{CreateIconEntryInput, ImportDroppedPathsResult, SnapshotIconItem};

use super::super::image::{build_custom_icon_path, build_data_icon_path};
use super::super::item::{build_scanned_item_from_path, build_snapshot_item};
use super::super::source::IconSource;
use super::super::storage::{
    load_icon_library_snapshot, max_snapshot_display_order, write_icon_snapshot,
};
use super::entry::{create_managed_shortcut, has_duplicate_entry, NormalizedIconEntry};
use super::import::icon_entry_dir_windows;

pub(in crate::icons) fn create_icon_entry_windows(
    app_handle: &tauri::AppHandle,
    input: CreateIconEntryInput,
) -> Result<ImportDroppedPathsResult, String> {
    let entry = NormalizedIconEntry::from_create(&input)?;
    let snapshot = load_icon_library_snapshot(app_handle)?;
    if has_duplicate_entry(&snapshot, None, &entry) {
        return Ok(ImportDroppedPathsResult {
            imported_count: 0,
            duplicate_count: 1,
            invalid_count: 0,
        });
    }

    let destination_path = create_destination(app_handle, &entry)?;
    if let Err(error) = write_created_entry(app_handle, entry, destination_path.as_deref()) {
        remove_destination(destination_path.as_deref());
        return Err(error);
    }
    Ok(ImportDroppedPathsResult {
        imported_count: 1,
        duplicate_count: 0,
        invalid_count: 0,
    })
}

fn create_destination(
    app_handle: &tauri::AppHandle,
    entry: &NormalizedIconEntry,
) -> Result<Option<PathBuf>, String> {
    if entry.is_web {
        Ok(None)
    } else {
        let entry_dir = icon_entry_dir_windows(app_handle)?;
        create_managed_shortcut(&entry_dir, entry).map(Some)
    }
}

fn write_created_entry(
    app_handle: &tauri::AppHandle,
    entry: NormalizedIconEntry,
    destination_path: Option<&Path>,
) -> Result<(), String> {
    let created_scan = match destination_path {
        Some(path) => build_scanned_item_from_path(path)
            .ok_or_else(|| "Created icon entry could not be read".to_string())?,
        None => entry.scanned_item.clone(),
    };
    let mut snapshot = load_icon_library_snapshot(app_handle)?;
    let display_order = max_snapshot_display_order(&snapshot).saturating_add(1);
    let mut item = build_snapshot_item(
        app_handle,
        &created_scan,
        IconSource::Library,
        display_order,
    )?;
    entry.apply_metadata(&mut item);
    apply_explicit_icon(app_handle, &entry, &mut item)?;
    snapshot.icons.push(item);
    write_icon_snapshot(app_handle, IconSource::Library, &snapshot)
}

fn apply_explicit_icon(
    app_handle: &tauri::AppHandle,
    entry: &NormalizedIconEntry,
    item: &mut SnapshotIconItem,
) -> Result<(), String> {
    let data = if entry.icon_source == "text" {
        if entry.generated_icon_base64.is_empty() {
            return Err("Generated text icon is required".to_string());
        }
        Some(entry.generated_icon_base64.as_str())
    } else if entry.icon_source == "custom" && entry.generated_icon_base64.is_empty() {
        item.icon = build_custom_icon_path(
            app_handle,
            &entry.custom_icon_path,
            &item.id,
            IconSource::Library,
        )?;
        None
    } else if !entry.generated_icon_base64.is_empty() {
        Some(entry.generated_icon_base64.as_str())
    } else if entry.is_web && !entry.website_icon_base64.is_empty() {
        Some(entry.website_icon_base64.as_str())
    } else {
        None
    };
    if let Some(data) = data {
        item.icon = build_data_icon_path(app_handle, data, &item.id, IconSource::Library)?;
    }
    Ok(())
}

fn remove_destination(path: Option<&Path>) {
    if let Some(path) = path {
        let _ = std::fs::remove_file(path);
    }
}
