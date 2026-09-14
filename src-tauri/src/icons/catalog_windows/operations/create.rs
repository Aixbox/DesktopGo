use std::path::{Path, PathBuf};

use crate::icons::models::{
    CreateIconEntryInput, IconSnapshot, ImportDroppedPathsResult, SnapshotIconItem,
};

use super::super::image::{build_custom_icon_path, build_data_icon_path};
use super::super::item::{
    build_scanned_item_from_path, build_snapshot_item, set_automatic_target_icon_cache,
};
use super::super::source::IconSource;
use super::super::storage::{
    load_icon_library_snapshot, max_snapshot_display_order, remove_cached_icon_file,
    write_icon_snapshot,
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
    let mut created_icon = None;
    if let Err(error) = write_created_entry(
        app_handle,
        entry,
        destination_path.as_deref(),
        &mut created_icon,
    ) {
        remove_destination(destination_path.as_deref());
        if let Some(icon) = created_icon {
            let _ = remove_cached_icon_file(app_handle, &icon);
        }
        return Err(error);
    }
    Ok(ImportDroppedPathsResult {
        imported_count: 1,
        duplicate_count: 0,
        invalid_count: 0,
    })
}

/// 单个批量条目的创建结果：要么产出可写入快照的条目，要么被判定为重复/无效。
/// `SnapshotIconItem` 体积较大，装箱避免枚举整体膨胀。
enum BatchEntryOutcome {
    Imported {
        item: Box<SnapshotIconItem>,
        destination_path: Option<PathBuf>,
        icon: String,
    },
    Duplicate,
    Invalid,
}

/// 为「快捷导入」准备单个条目：创建托管快捷方式并生成快照数据。
/// 失败时自行清理已产生的中间文件，调用方只需按结果计数。
fn prepare_batch_entry(
    app_handle: &tauri::AppHandle,
    entry_dir: &Path,
    snapshot: &IconSnapshot,
    display_order: u64,
    input: CreateIconEntryInput,
) -> BatchEntryOutcome {
    let Ok(entry) = NormalizedIconEntry::from_create(&input) else {
        return BatchEntryOutcome::Invalid;
    };
    if has_duplicate_entry(snapshot, None, &entry) {
        return BatchEntryOutcome::Duplicate;
    }

    let destination_path = if entry.writes_direct_snapshot() {
        None
    } else {
        match create_managed_shortcut(entry_dir, &entry) {
            Ok(path) => Some(path),
            Err(_) => return BatchEntryOutcome::Invalid,
        }
    };

    let created_scan = match destination_path.as_deref() {
        Some(path) => match build_scanned_item_from_path(path) {
            Some(scan) => scan,
            None => {
                remove_destination(destination_path.as_deref());
                return BatchEntryOutcome::Invalid;
            }
        },
        None => entry.scanned_item.clone(),
    };
    let Ok(mut item) = build_snapshot_item(
        app_handle,
        &created_scan,
        IconSource::Library,
        display_order,
    ) else {
        remove_destination(destination_path.as_deref());
        return BatchEntryOutcome::Invalid;
    };

    let icon_before_apply = item.icon.clone();
    item.origin = entry.origin.clone();
    entry.apply_metadata(&mut item);
    if apply_explicit_icon(app_handle, &entry, &mut item).is_err() {
        let _ = remove_cached_icon_file(app_handle, &icon_before_apply);
        remove_destination(destination_path.as_deref());
        return BatchEntryOutcome::Invalid;
    }
    set_automatic_target_icon_cache(&mut item, entry_uses_automatic_target_icon(&entry));
    BatchEntryOutcome::Imported {
        icon: item.icon.clone(),
        item: Box::new(item),
        destination_path,
    }
}

/// 批量创建图标条目。「快捷导入」一次导入几十上百个应用，不能像拖入导入那样
/// 逐条 load/write 快照 —— 那是 O(n²) 的文件读写。这里整体加载一次快照，
/// 循环创建条目，最后写回一次；单个条目失败只计数，不中断整批。
pub(in crate::icons) fn create_icon_entries_windows(
    app_handle: &tauri::AppHandle,
    inputs: Vec<CreateIconEntryInput>,
) -> Result<ImportDroppedPathsResult, String> {
    let mut result = ImportDroppedPathsResult {
        imported_count: 0,
        duplicate_count: 0,
        invalid_count: 0,
    };
    if inputs.is_empty() {
        return Ok(result);
    }

    let entry_dir = icon_entry_dir_windows(app_handle)?;
    let mut snapshot = load_icon_library_snapshot(app_handle)?;
    let mut next_display_order = max_snapshot_display_order(&snapshot);
    // 成功创建的条目：(托管快捷方式路径, 图标缓存文件)。最终写回失败时整体回滚。
    let mut created_entries: Vec<(Option<PathBuf>, String)> = Vec::new();

    for input in inputs {
        let display_order = next_display_order.saturating_add(1);
        match prepare_batch_entry(app_handle, &entry_dir, &snapshot, display_order, input) {
            BatchEntryOutcome::Duplicate => {
                result.duplicate_count = result.duplicate_count.saturating_add(1);
            }
            BatchEntryOutcome::Invalid => {
                result.invalid_count = result.invalid_count.saturating_add(1);
            }
            BatchEntryOutcome::Imported {
                item,
                destination_path,
                icon,
            } => {
                created_entries.push((destination_path, icon));
                snapshot.icons.push(*item);
                next_display_order = display_order;
                result.imported_count = result.imported_count.saturating_add(1);
            }
        }
    }

    if result.imported_count == 0 {
        return Ok(result);
    }
    if let Err(error) = write_icon_snapshot(app_handle, IconSource::Library, &snapshot) {
        for (destination_path, icon) in created_entries {
            let _ = remove_cached_icon_file(app_handle, &icon);
            remove_destination(destination_path.as_deref());
        }
        return Err(error);
    }
    Ok(result)
}

fn create_destination(
    app_handle: &tauri::AppHandle,
    entry: &NormalizedIconEntry,
) -> Result<Option<PathBuf>, String> {
    if entry.writes_direct_snapshot() {
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
    created_icon: &mut Option<String>,
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
    created_icon.replace(item.icon.clone());
    item.origin = entry.origin.clone();
    entry.apply_metadata(&mut item);
    apply_explicit_icon(app_handle, &entry, &mut item)?;
    created_icon.replace(item.icon.clone());
    set_automatic_target_icon_cache(&mut item, entry_uses_automatic_target_icon(&entry));
    snapshot.icons.push(item);
    write_icon_snapshot(app_handle, IconSource::Library, &snapshot)
}

fn entry_uses_automatic_target_icon(entry: &NormalizedIconEntry) -> bool {
    entry.icon_source == "target"
        && entry.generated_icon_base64.is_empty()
        && !entry.writes_direct_snapshot()
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
