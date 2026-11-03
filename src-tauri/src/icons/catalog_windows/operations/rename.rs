use std::path::{Path, PathBuf};

use windows::core::HSTRING;
use windows::Win32::Storage::FileSystem::{MoveFileExW, MOVEFILE_WRITE_THROUGH};
use windows::Win32::UI::Shell::{
    SHChangeNotify, SHCNE_RENAMEFOLDER, SHCNE_RENAMEITEM, SHCNF_PATHW,
};

use super::super::item::stable_item_key;
use super::super::shell_entry::shell_entry_path;
use super::super::source::IconSource;
use super::super::storage::{load_icon_library_snapshot, write_icon_snapshot};
use super::import::icon_entry_dir_windows;
use super::rename_shortcuts::{prepare_rewrites, ShortcutRewrite};
use crate::icons::models::{IconRenameResult, IconSnapshot, ScannedDesktopItem};

pub(in crate::icons) fn rename_icon_entry_windows(
    app_handle: &tauri::AppHandle,
    id: &str,
    name: &str,
) -> Result<Vec<IconRenameResult>, String> {
    let snapshot = load_icon_library_snapshot(app_handle)?;
    let entry_dir = icon_entry_dir_windows(app_handle)?;
    rename_entry(&snapshot, id, name, &entry_dir, |updated| {
        write_icon_snapshot(app_handle, IconSource::Library, updated)
    })
}

// Keep the existing library ID: layout, folders, Dock and selection refer to it.
fn rename_entry(
    snapshot: &IconSnapshot,
    id: &str,
    name: &str,
    entry_dir: &Path,
    persist: impl FnOnce(&IconSnapshot) -> Result<(), String>,
) -> Result<Vec<IconRenameResult>, String> {
    let index = snapshot
        .icons
        .iter()
        .position(|item| item.id == id)
        .ok_or_else(|| "图标已不存在，请刷新后重试。".to_string())?;
    let original = &snapshot.icons[index];
    let source = Path::new(shell_entry_path(original, entry_dir));
    if !source.is_absolute() || !source.exists() {
        return Err("源文件不存在，或此图标没有可重命名的本地文件。".to_string());
    }
    let is_directory = source.is_dir();
    let destination = renamed_path(source, name, is_directory)?;
    let updated = updated_snapshot(snapshot, index, source, &destination, is_directory)?;
    let rewrites = prepare_rewrites(snapshot, &updated, entry_dir)?;
    let moved = source.as_os_str() != destination.as_os_str();
    if moved {
        move_without_replacing(source, &destination)?;
    }
    let result = rewrites
        .iter()
        .try_for_each(ShortcutRewrite::apply)
        .and_then(|()| persist(&updated));
    if let Err(error) = result {
        return Err(rollback_rename(
            &rewrites,
            source,
            &destination,
            moved,
            &error,
        ));
    }
    if moved {
        notify_renamed(source, &destination, is_directory);
    }
    Ok(rename_results(snapshot, &updated, index, entry_dir))
}

fn rollback_rename(
    rewrites: &[ShortcutRewrite],
    source: &Path,
    destination: &Path,
    moved: bool,
    error: &str,
) -> String {
    let mut failures = rewrites
        .iter()
        .filter_map(|rewrite| rewrite.restore().err())
        .collect::<Vec<_>>();
    if moved {
        if let Err(failure) = move_without_replacing(destination, source) {
            failures.push(format!("{failure}；源文件现位于 {}", destination.display()));
        }
    }
    if failures.is_empty() {
        format!("重命名未完成，已恢复原文件与快捷方式：{error}")
    } else {
        format!("重命名失败：{error}；回滚失败：{}", failures.join("；"))
    }
}

fn updated_snapshot(
    snapshot: &IconSnapshot,
    selected: usize,
    source: &Path,
    destination: &Path,
    is_directory: bool,
) -> Result<IconSnapshot, String> {
    let mut updated = snapshot.clone();
    let name = if is_directory {
        destination.file_name()
    } else {
        destination.file_stem()
    }
    .ok_or_else(|| "文件名无效。".to_string())?
    .to_string_lossy()
    .into_owned();
    for (index, item) in updated.icons.iter_mut().enumerate() {
        let original = &snapshot.icons[index];
        item.path = remap_path(&item.path, source, destination, is_directory);
        item.target_path = remap_path(&item.target_path, source, destination, is_directory);
        item.working_directory =
            remap_path(&item.working_directory, source, destination, is_directory);
        if index == selected {
            item.name.clone_from(&name);
        }
        if original.path != item.path || original.target_path != item.target_path {
            item.key = stable_item_key(&ScannedDesktopItem {
                name: item.name.clone(),
                path: item.path.clone(),
                target_path: item.target_path.clone(),
                item_type: item.item_type.clone(),
            });
        }
    }
    Ok(updated)
}

fn remap_path(value: &str, source: &Path, destination: &Path, include_children: bool) -> String {
    let source = source.to_string_lossy();
    let prefix = value.get(..source.len());
    if !prefix.is_some_and(|prefix| prefix.eq_ignore_ascii_case(&source)) {
        return value.to_string();
    }
    let suffix = &value[source.len()..];
    if suffix.is_empty()
        || (include_children && (suffix.starts_with('\\') || suffix.starts_with('/')))
    {
        format!("{}{suffix}", destination.display())
    } else {
        value.to_string()
    }
}

fn rename_results(
    original: &IconSnapshot,
    updated: &IconSnapshot,
    selected: usize,
    entry_dir: &Path,
) -> Vec<IconRenameResult> {
    original
        .icons
        .iter()
        .zip(&updated.icons)
        .enumerate()
        .filter(|(index, (old, new))| {
            *index == selected
                || old.path != new.path
                || old.target_path != new.target_path
                || old.working_directory != new.working_directory
        })
        .map(|(_, (old, item))| IconRenameResult {
            id: item.id.clone(),
            name: item.name.clone(),
            old_path: old.path.clone(),
            path: item.path.clone(),
            target_path: item.target_path.clone(),
            shell_path: shell_entry_path(item, entry_dir).to_string(),
            working_directory: item.working_directory.clone(),
        })
        .collect()
}

fn renamed_path(source: &Path, name: &str, is_directory: bool) -> Result<PathBuf, String> {
    let name = name.trim();
    validate_file_name(name)?;
    // The inline editor displays the stem, just as existing launchpad labels do.
    // Preserve the source extension, including .lnk/.url, without duplicating it.
    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .filter(|_| !is_directory);
    let file_name = match extension {
        Some(ext)
            if !name
                .to_lowercase()
                .ends_with(&format!(".{}", ext.to_lowercase())) =>
        {
            format!("{name}.{ext}")
        }
        _ => name.to_string(),
    };
    validate_file_name(&file_name)?;
    let parent = source
        .parent()
        .ok_or_else(|| "无法重命名根目录。".to_string())?;
    Ok(parent.join(file_name))
}

fn validate_file_name(name: &str) -> Result<(), String> {
    if name.is_empty()
        || name.ends_with('.')
        || name.ends_with(' ')
        || name
            .chars()
            .any(|ch| ch.is_control() || "<>:\"/\\|?*".contains(ch))
        || name.encode_utf16().count() > 255
    {
        return Err("文件名无效：不能为空、包含路径或非法字符，也不能以句点结尾。".to_string());
    }
    let stem = name
        .split('.')
        .next()
        .unwrap_or_default()
        .trim_end()
        .to_uppercase();
    let device = matches!(
        stem.as_str(),
        "CON" | "PRN" | "AUX" | "NUL" | "CONIN$" | "CONOUT$"
    ) || ["COM", "LPT"].iter().any(|prefix| {
        stem.strip_prefix(prefix).is_some_and(|suffix| {
            matches!(
                suffix,
                "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "¹" | "²" | "³"
            )
        })
    });
    if device {
        return Err("文件名不能使用 Windows 保留名称。".to_string());
    }
    Ok(())
}

fn move_without_replacing(source: &Path, destination: &Path) -> Result<(), String> {
    // Unlike fs::rename, this never replaces another existing file, even if it
    // appears after validation. It also supports case-only renames on Windows.
    unsafe {
        MoveFileExW(
            &HSTRING::from(source),
            &HSTRING::from(destination),
            MOVEFILE_WRITE_THROUGH,
        )
    }
    .map_err(|error| format!("无法重命名源文件，请检查同名文件、访问权限或文件占用：{error}"))
}

fn notify_renamed(source: &Path, destination: &Path, is_directory: bool) {
    let source = HSTRING::from(source);
    let destination = HSTRING::from(destination);
    let event = if is_directory {
        SHCNE_RENAMEFOLDER
    } else {
        SHCNE_RENAMEITEM
    };
    unsafe {
        SHChangeNotify(
            event,
            SHCNF_PATHW,
            Some(source.as_ptr().cast()),
            Some(destination.as_ptr().cast()),
        );
    }
}

#[cfg(test)]
#[path = "rename_tests.rs"]
mod tests;
