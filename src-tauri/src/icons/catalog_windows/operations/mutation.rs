use std::collections::HashSet;
use std::path::PathBuf;

use crate::icons::models::{IconMutationTarget, InvalidIconEntry};

use super::super::item::is_web_url;
use super::super::source::IconSource;
use super::super::storage::{
    load_icon_library_snapshot, max_snapshot_display_order, read_icon_snapshot,
    remove_cached_icon_file, write_icon_snapshot,
};
use super::super::view::invalid_icon_reason;
use super::import::icon_entry_dir_windows;
use crate::icons::search_icon_plan::{is_special_shell_path, is_uwp_shell_path};

const DELETE_SOURCE_SETTING_KEY: &str = "deleteIconSourceFile";
const DELETE_NEW_FILE_SOURCE_SETTING_KEY: &str = "deleteNewFileSource";

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

    // 源文件删除判定：全局开关对所有图标生效；「仅新建」开关只对 origin=new
    // 的图标生效。失败仅记录，不影响条目移除。
    let delete_source_all = read_delete_source_setting(app_handle);
    let delete_source_new = read_delete_new_file_source_setting(app_handle);
    {
        let source_paths: Vec<PathBuf> = removed_items
            .iter()
            .filter(|item| delete_source_all || (delete_source_new && item.origin == "new"))
            .filter(|item| {
                !is_web_url(&item.target_path)
                    && !is_special_shell_path(&item.path)
                    && !is_uwp_shell_path(&item.path)
            })
            .map(|item| PathBuf::from(&item.path))
            .filter(|entry_path| {
                !entry_path.as_os_str().is_empty()
                    && entry_path.parent() != Some(managed_entry_dir.as_path())
            })
            .collect();
        if let Err(error) = delete_paths_to_recycle_bin(&source_paths) {
            eprintln!("Failed to recycle source files: {error}");
        }
    }

    write_icon_snapshot(app_handle, source, &snapshot)?;
    Ok(removed_items.len())
}

/// 读取「删除图标时同时删除源文件」设置开关（对全部图标生效）；默认关闭。
fn read_delete_source_setting(app_handle: &tauri::AppHandle) -> bool {
    use tauri_plugin_store::StoreExt;

    app_handle
        .store(crate::storage_profile::settings_store_path())
        .ok()
        .and_then(|store| {
            store
                .get(DELETE_SOURCE_SETTING_KEY)
                .and_then(|value| value.as_bool())
        })
        .unwrap_or(false)
}

/// 读取「新建创建的图标删除时同时删除源文件」设置开关；默认关闭。
fn read_delete_new_file_source_setting(app_handle: &tauri::AppHandle) -> bool {
    use tauri_plugin_store::StoreExt;

    app_handle
        .store(crate::storage_profile::settings_store_path())
        .ok()
        .and_then(|store| {
            store
                .get(DELETE_NEW_FILE_SOURCE_SETTING_KEY)
                .and_then(|value| value.as_bool())
        })
        .unwrap_or(false)
}

/// 通过 SHFileOperationW 把文件/目录移入回收站（FOF_ALLOWUNDO），与资源管理
/// 器删除行为一致。
fn delete_paths_to_recycle_bin(paths: &[PathBuf]) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;

    use windows::core::PCWSTR;
    use windows::Win32::UI::Shell::{
        SHFileOperationW, FOF_ALLOWUNDO, FOF_NOCONFIRMATION, FOF_NOERRORUI, FOF_SILENT, FO_DELETE,
        SHFILEOPSTRUCTW,
    };

    if paths.is_empty() {
        return Ok(());
    }

    let mut from: Vec<u16> = Vec::new();
    for path in paths {
        from.extend(path.as_os_str().encode_wide());
        from.push(0);
    }
    from.push(0); // pFrom 以双空字符结尾

    let mut operation = SHFILEOPSTRUCTW {
        hwnd: Default::default(),
        wFunc: FO_DELETE,
        pFrom: PCWSTR::from_raw(from.as_ptr()),
        pTo: PCWSTR::null(),
        fFlags: (FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_SILENT | FOF_NOERRORUI).0 as u16,
        fAnyOperationsAborted: Default::default(),
        hNameMappings: std::ptr::null_mut(),
        lpszProgressTitle: PCWSTR::null(),
    };
    let code = unsafe { SHFileOperationW(&mut operation) };
    if code != 0 || operation.fAnyOperationsAborted.as_bool() {
        return Err(format!("回收站删除失败（代码 {code}）"));
    }
    Ok(())
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
