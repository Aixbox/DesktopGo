use std::collections::HashSet;
use std::path::PathBuf;

use crate::icons::models::{IconMutationTarget, InvalidIconEntry};

use super::super::source::IconSource;
use super::super::storage::{
    load_icon_library_snapshot, max_snapshot_display_order, read_icon_snapshot,
    remove_cached_icon_file, write_icon_snapshot,
};
use super::super::view::invalid_icon_reason;
use super::import::icon_entry_dir_windows;

pub(in crate::icons) fn scan_invalid_icons_windows(
    app_handle: &tauri::AppHandle,
) -> Result<Vec<InvalidIconEntry>, String> {
    let mut invalid_icons = Vec::new();

    for item in load_icon_library_snapshot(app_handle)?.icons {
        let Some(reason) = invalid_icon_reason(&item) else {
            continue;
        };
        invalid_icons.push(InvalidIconEntry {
            id: item.id,
            name: item.name,
            path: item.path,
            target_path: item.target_path,
            reason: reason.to_string(),
        });
    }

    invalid_icons.sort_by(|left, right| {
        left.name
            .to_lowercase()
            .cmp(&right.name.to_lowercase())
            .then_with(|| left.path.to_lowercase().cmp(&right.path.to_lowercase()))
    });
    Ok(invalid_icons)
}

fn set_icons_hidden_state_in_snapshot_windows(
    app_handle: &tauri::AppHandle,
    source: IconSource,
    id_set: &HashSet<String>,
    hidden: bool,
) -> Result<usize, String> {
    if id_set.is_empty() {
        return Ok(0);
    }

    let mut snapshot = match read_icon_snapshot(app_handle, source)? {
        Some(snapshot) => snapshot,
        None => return Ok(0),
    };
    let mut max_display_order = if hidden {
        0
    } else {
        max_snapshot_display_order(&snapshot)
    };

    let mut changed_count = 0usize;
    for item in &mut snapshot.icons {
        if id_set.contains(&item.id) && item.hidden != hidden {
            item.hidden = hidden;
            if !hidden {
                max_display_order = max_display_order.saturating_add(1);
                item.display_order = max_display_order;
            }
            changed_count += 1;
        }
    }

    if changed_count > 0 {
        write_icon_snapshot(app_handle, source, &snapshot)?;
    }

    Ok(changed_count)
}

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

    let managed_entry_dir = icon_entry_dir_windows(app_handle)?;
    for item in &removed_items {
        let entry_path = PathBuf::from(&item.path);
        if entry_path.parent() == Some(managed_entry_dir.as_path()) && entry_path.is_file() {
            std::fs::remove_file(&entry_path).map_err(|error| {
                format!(
                    "Failed to remove managed icon entry {:?}: {}",
                    entry_path, error
                )
            })?;
        }
        remove_cached_icon_file(app_handle, &item.icon)?;
    }

    write_icon_snapshot(app_handle, source, &snapshot)?;
    Ok(removed_items.len())
}

pub(in crate::icons) fn hide_icons_windows(
    app_handle: &tauri::AppHandle,
    targets: &[IconMutationTarget],
) -> Result<usize, String> {
    if targets.is_empty() {
        return Ok(0);
    }

    let id_set = targets
        .iter()
        .map(|target| target.id.clone())
        .collect::<HashSet<_>>();
    set_icons_hidden_state_in_snapshot_windows(app_handle, IconSource::Library, &id_set, true)
}

pub(in crate::icons) fn unhide_icons_windows(
    app_handle: &tauri::AppHandle,
    targets: &[IconMutationTarget],
) -> Result<usize, String> {
    if targets.is_empty() {
        return Ok(0);
    }

    let id_set = targets
        .iter()
        .map(|target| target.id.clone())
        .collect::<HashSet<_>>();
    set_icons_hidden_state_in_snapshot_windows(app_handle, IconSource::Library, &id_set, false)
}

pub(in crate::icons) fn delete_icons_windows(
    app_handle: &tauri::AppHandle,
    targets: &[IconMutationTarget],
) -> Result<usize, String> {
    if targets.is_empty() {
        return Ok(0);
    }

    let id_set = targets
        .iter()
        .map(|target| target.id.clone())
        .collect::<HashSet<_>>();
    delete_icons_in_snapshot_windows(app_handle, IconSource::Library, &id_set)
}
