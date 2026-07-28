use std::collections::HashSet;
use std::path::PathBuf;

use crate::icons::models::ImportDroppedPathsResult;
use crate::icons::platform_windows::create_shortcut_windows;

use super::super::item::{
    build_import_file_path, build_scanned_item_from_path, build_snapshot_item, has_extension,
    import_identity_key,
};
use super::super::source::IconSource;
use super::super::storage::{
    load_icon_library_snapshot, max_snapshot_display_order, snapshot_base_dir, write_icon_snapshot,
};

pub(super) fn icon_entry_dir_windows(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let entry_dir = snapshot_base_dir(app_handle)?.join("icon-library-entries");
    if !entry_dir.exists() {
        std::fs::create_dir_all(&entry_dir).map_err(|error| {
            format!(
                "Failed to create icon library entry directory {:?}: {}",
                entry_dir, error
            )
        })?;
    }
    Ok(entry_dir)
}

pub(in crate::icons) fn import_dropped_paths_windows(
    app_handle: &tauri::AppHandle,
    paths: Vec<String>,
) -> Result<ImportDroppedPathsResult, String> {
    let entry_dir = icon_entry_dir_windows(app_handle)?;
    let mut snapshot = load_icon_library_snapshot(app_handle)?;
    let mut known_keys = snapshot
        .icons
        .iter()
        .map(|item| {
            if item.target_path.trim().is_empty() {
                item.path.trim().to_lowercase()
            } else {
                item.target_path.trim().to_lowercase()
            }
        })
        .collect::<HashSet<_>>();
    let mut next_display_order = max_snapshot_display_order(&snapshot);
    let mut imported_count = 0usize;
    let mut duplicate_count = 0usize;
    let mut invalid_count = 0usize;

    for raw_path in paths {
        let trimmed = raw_path.trim();
        if trimmed.is_empty() {
            invalid_count = invalid_count.saturating_add(1);
            continue;
        }

        let source_path = PathBuf::from(trimmed);
        let Some(scanned_item) = build_scanned_item_from_path(&source_path) else {
            invalid_count = invalid_count.saturating_add(1);
            continue;
        };

        let identity_key = import_identity_key(&scanned_item);
        if known_keys.contains(&identity_key) {
            duplicate_count = duplicate_count.saturating_add(1);
            continue;
        }

        let destination_path = build_import_file_path(&entry_dir, &source_path);
        if has_extension(&source_path, "lnk") {
            std::fs::copy(&source_path, &destination_path).map_err(|error| {
                format!(
                    "Failed to copy shortcut {:?} to {:?}: {}",
                    source_path, destination_path, error
                )
            })?;
        } else {
            create_shortcut_windows(&destination_path, &source_path.to_string_lossy(), "", "")?;
        }

        let created_scan = build_scanned_item_from_path(&destination_path)
            .ok_or_else(|| "Imported icon entry could not be read".to_string())?;
        next_display_order = next_display_order.saturating_add(1);
        snapshot.icons.push(build_snapshot_item(
            app_handle,
            &created_scan,
            IconSource::Library,
            next_display_order,
        )?);

        let _ = known_keys.insert(identity_key);
        imported_count = imported_count.saturating_add(1);
    }

    if imported_count > 0 {
        write_icon_snapshot(app_handle, IconSource::Library, &snapshot)?;
    }

    Ok(ImportDroppedPathsResult {
        imported_count,
        duplicate_count,
        invalid_count,
    })
}
