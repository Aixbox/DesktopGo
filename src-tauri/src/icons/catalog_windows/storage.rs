use std::collections::HashSet;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};

use crate::icons::models::{IconSnapshot, LegacySnapshotIconPaths};

use super::source::{IconSource, ICON_SNAPSHOT_VERSION};

pub(super) fn snapshot_base_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    crate::storage_profile::app_local_data_dir(app_handle)
}

fn snapshot_file_path(
    app_handle: &tauri::AppHandle,
    source: IconSource,
) -> Result<PathBuf, String> {
    Ok(snapshot_base_dir(app_handle)?.join(source.snapshot_file_name()))
}

pub(super) fn max_snapshot_display_order(snapshot: &IconSnapshot) -> u64 {
    snapshot
        .icons
        .iter()
        .map(|item| item.display_order)
        .max()
        .unwrap_or(0)
}

fn normalize_snapshot_display_order(snapshot: &mut IconSnapshot) -> bool {
    if snapshot.icons.is_empty() {
        return false;
    }

    let mut changed = false;
    let all_zero = snapshot.icons.iter().all(|item| item.display_order == 0);
    if all_zero {
        for (index, item) in snapshot.icons.iter_mut().enumerate() {
            let next_order = (index as u64).saturating_add(1);
            if item.display_order != next_order {
                item.display_order = next_order;
                changed = true;
            }
        }
        return changed;
    }

    let mut used_orders = HashSet::new();
    let mut next_order = max_snapshot_display_order(snapshot);
    for item in &mut snapshot.icons {
        if item.display_order == 0 || !used_orders.insert(item.display_order) {
            next_order = next_order.saturating_add(1);
            item.display_order = next_order;
            changed = true;
            let _ = used_orders.insert(item.display_order);
        }
    }

    changed
}

fn best_legacy_icon_path(paths: &LegacySnapshotIconPaths) -> &str {
    [
        paths.master.as_str(),
        paths.large.as_str(),
        paths.medium.as_str(),
        paths.small.as_str(),
    ]
    .into_iter()
    .find(|path| !path.is_empty())
    .unwrap_or_default()
}

pub(super) fn is_legacy_bucket_icon_path(path: &str) -> bool {
    let normalized = path.replace('\\', "/");
    ["/small/", "/medium/", "/large/"]
        .iter()
        .any(|segment| normalized.contains(segment))
}

pub(super) fn migrate_snapshot_to_single_icon(snapshot: &mut IconSnapshot) -> bool {
    let mut changed = snapshot.version != ICON_SNAPSHOT_VERSION;
    snapshot.version = ICON_SNAPSHOT_VERSION;

    for item in &mut snapshot.icons {
        if item.icon.is_empty() {
            if let Some(paths) = item.legacy_icons.as_ref() {
                item.icon = best_legacy_icon_path(paths).to_string();
            }
        }
        if item.legacy_icons.take().is_some() {
            changed = true;
        }
    }

    changed
}

fn obsolete_legacy_icon_paths(snapshot: &IconSnapshot) -> HashSet<String> {
    let mut obsolete = HashSet::new();
    for item in &snapshot.icons {
        let Some(paths) = item.legacy_icons.as_ref() else {
            continue;
        };
        let retained = if item.icon.is_empty() {
            best_legacy_icon_path(paths)
        } else {
            item.icon.as_str()
        };
        for path in [&paths.master, &paths.large, &paths.medium, &paths.small] {
            if !path.is_empty() && path != retained {
                obsolete.insert(path.clone());
            }
        }
    }
    obsolete
}

pub(super) fn read_icon_snapshot(
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

    let obsolete_icon_paths = obsolete_legacy_icon_paths(&snapshot);
    let changed = normalize_snapshot_display_order(&mut snapshot)
        | migrate_snapshot_to_single_icon(&mut snapshot);

    if changed {
        write_icon_snapshot(app_handle, source, &snapshot)?;
        for rel_path in obsolete_icon_paths {
            let _ = remove_cached_icon_file(app_handle, &rel_path);
        }
    }

    Ok(Some(snapshot))
}

pub(super) fn write_icon_snapshot(
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
    write_snapshot_file_atomically(&path, &json)
}

fn write_snapshot_file_atomically(path: &Path, json: &str) -> Result<(), String> {
    write_snapshot_file_atomically_with_replace(path, json, |temporary_path, snapshot_path| {
        std::fs::rename(temporary_path, snapshot_path)
    })
}

fn write_snapshot_file_atomically_with_replace(
    path: &Path,
    json: &str,
    replace_file: impl FnOnce(&Path, &Path) -> std::io::Result<()>,
) -> Result<(), String> {
    let temporary_path = snapshot_temporary_path(path)?;
    let result = (|| {
        let mut temporary_file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary_path)
            .map_err(|error| format!("Failed to create temporary icon snapshot: {error}"))?;
        temporary_file
            .write_all(json.as_bytes())
            .map_err(|error| format!("Failed to write temporary icon snapshot: {error}"))?;
        temporary_file
            .sync_all()
            .map_err(|error| format!("Failed to sync temporary icon snapshot: {error}"))?;
        drop(temporary_file);

        replace_file(&temporary_path, path)
            .map_err(|error| format!("Failed to replace icon snapshot: {error}"))
    })();

    if result.is_err() {
        let _ = std::fs::remove_file(&temporary_path);
    }
    result
}

fn snapshot_temporary_path(path: &Path) -> Result<PathBuf, String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Icon snapshot path has no parent directory".to_string())?;
    let file_name = path
        .file_name()
        .ok_or_else(|| "Icon snapshot path has no file name".to_string())?
        .to_string_lossy();
    Ok(parent.join(format!(".{file_name}.{}.tmp", uuid::Uuid::new_v4())))
}

pub(super) fn remove_cached_icon_file(
    app_handle: &tauri::AppHandle,
    rel_path: &str,
) -> Result<(), String> {
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

pub(super) fn load_icon_library_snapshot(
    app_handle: &tauri::AppHandle,
) -> Result<IconSnapshot, String> {
    if let Some(snapshot) = read_icon_snapshot(app_handle, IconSource::Library)? {
        return Ok(snapshot);
    }

    let mut icons = Vec::new();
    for legacy_source in [IconSource::Desktop, IconSource::CustomApp] {
        if let Some(snapshot) = read_icon_snapshot(app_handle, legacy_source)? {
            icons.extend(snapshot.icons);
        }
    }
    icons.sort_by_key(|item| item.display_order);
    for (index, item) in icons.iter_mut().enumerate() {
        item.display_order = (index as u64).saturating_add(1);
    }
    let snapshot = IconSnapshot {
        version: ICON_SNAPSHOT_VERSION,
        icons,
    };
    write_icon_snapshot(app_handle, IconSource::Library, &snapshot)?;
    Ok(snapshot)
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::io::{Error, ErrorKind};
    use std::path::PathBuf;

    use super::{write_snapshot_file_atomically, write_snapshot_file_atomically_with_replace};

    fn test_directory() -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "desktopgo-icon-snapshot-test-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&path).expect("create test snapshot directory");
        path
    }

    #[test]
    fn atomically_replaces_a_snapshot_after_writing_the_temporary_file() {
        let directory = test_directory();
        let snapshot_path = directory.join("icons.json");
        fs::write(&snapshot_path, "old snapshot").expect("write original snapshot");

        write_snapshot_file_atomically(&snapshot_path, "new snapshot")
            .expect("replace snapshot atomically");

        assert_eq!(
            fs::read_to_string(&snapshot_path).expect("read replaced snapshot"),
            "new snapshot"
        );
        assert_eq!(
            fs::read_dir(&directory)
                .expect("read snapshot directory")
                .count(),
            1
        );
        fs::remove_dir_all(directory).expect("remove test snapshot directory");
    }

    #[test]
    fn keeps_the_existing_snapshot_and_removes_temp_file_when_replace_fails() {
        let directory = test_directory();
        let snapshot_path = directory.join("icons.json");
        fs::write(&snapshot_path, "old snapshot").expect("write original snapshot");

        let error =
            write_snapshot_file_atomically_with_replace(&snapshot_path, "new snapshot", |_, _| {
                Err(Error::new(
                    ErrorKind::PermissionDenied,
                    "test replacement failure",
                ))
            })
            .expect_err("replacement failure should be returned");

        assert!(error.contains("Failed to replace icon snapshot"));
        assert_eq!(
            fs::read_to_string(&snapshot_path).expect("read original snapshot"),
            "old snapshot"
        );
        assert_eq!(
            fs::read_dir(&directory)
                .expect("read snapshot directory")
                .count(),
            1
        );
        fs::remove_dir_all(directory).expect("remove test snapshot directory");
    }
}
