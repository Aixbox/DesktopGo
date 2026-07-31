//! 「最佳匹配」用的启动器目录表。
//!
//! Everything 只做字面子串匹配，所以 `vscode` 永远搜不到 `Visual Studio Code`
//! —— 关键词里没有空格，而 Everything 无法被要求做词首缩写匹配。
//!
//! 高优先级目录（开始菜单、桌面、快速启动）总共只有几百条，所以这里把它们整体
//! 读出来交给前端，由前端用 fzf 式打分在内存里匹配，和启动台图标同一套逻辑。
//! 对齐 Listary 的做法：它的应用索引与文件索引是分开的，搜索参数里有
//! `only_search_in_paths`（见 docs/LISTARY_BINARY_ANALYSIS.zh-CN.md 第 4 节）。
//!
//! 目录内容随时可能变化，所以这里不做任何缓存：每次调用都重新枚举，
//! 由前端决定在一次面板会话内复用。`.lnk` 的目标解析是唯一的例外
//! （见 `crate::shortcut_target`），它按修改时间缓存，重复枚举不必重复走 COM。

use crate::shortcut_target::resolve_shortcut_target;
use serde::Serialize;
use std::path::{Path, PathBuf};

/// 兜底上限。正常情况下这几个目录远小于它，超出说明用户把桌面当仓库用了。
const MAX_CATALOG_ENTRIES: usize = 4_000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherCatalogEntry {
    path: String,
    name: String,
    parent: String,
    is_file: bool,
    is_folder: bool,
    /// `.lnk` 解析出的目标路径，其它条目为空串。前端靠它把「程序本体」和
    /// 「指向它的快捷方式」判成同一条（见 src/lib/search/launcherIdentity.ts）。
    target_path: String,
}

impl LauncherCatalogEntry {
    /// 只给搜索调试日志用：统计一次枚举里有多少 `.lnk` 的目标解析成功，
    /// 「最佳匹配里为什么还有重复」不开 DevTools 也能定位。
    pub fn has_shortcut_target(&self) -> bool {
        !self.target_path.is_empty()
    }
}

struct CatalogRoot {
    path: PathBuf,
    /// 1 表示只读这一层。开始菜单需要往里钻（`Visual Studio Code\...lnk`），
    /// 桌面则要浅一些，否则把当仓库用的桌面整棵树读进来。
    max_depth: usize,
}

fn push_entry(entries: &mut Vec<LauncherCatalogEntry>, path: &Path, is_folder: bool) {
    let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
        return;
    };
    entries.push(LauncherCatalogEntry {
        path: path.to_string_lossy().to_string(),
        name: name.to_string(),
        parent: path
            .parent()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_default(),
        is_file: !is_folder,
        is_folder,
        // 目录不可能是快捷方式，连扩展名判断都省掉。
        target_path: if is_folder {
            String::new()
        } else {
            resolve_shortcut_target(path).unwrap_or_default()
        },
    });
}

fn walk_root(root: &Path, depth: usize, entries: &mut Vec<LauncherCatalogEntry>) {
    if depth == 0 || entries.len() >= MAX_CATALOG_ENTRIES {
        return;
    }
    let Ok(reader) = std::fs::read_dir(root) else {
        return;
    };

    for entry in reader.flatten() {
        if entries.len() >= MAX_CATALOG_ENTRIES {
            return;
        }
        let path = entry.path();
        let is_folder = entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false);
        push_entry(entries, &path, is_folder);
        if is_folder {
            walk_root(&path, depth - 1, entries);
        }
    }
}

pub fn collect_launcher_catalog() -> Vec<LauncherCatalogEntry> {
    let mut entries = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for root in catalog_roots() {
        // 同一个物理目录可能被多个 known folder 指到（桌面被 OneDrive 重定向时）。
        if !seen.insert(root.path.to_string_lossy().to_lowercase()) {
            continue;
        }
        walk_root(&root.path, root.max_depth, &mut entries);
    }

    entries
}

#[cfg(windows)]
fn catalog_roots() -> Vec<CatalogRoot> {
    use windows::Win32::UI::Shell::{
        FOLDERID_CommonPrograms, FOLDERID_Desktop, FOLDERID_Programs, FOLDERID_PublicDesktop,
        FOLDERID_QuickLaunch,
    };

    [
        (FOLDERID_Programs, 4),
        (FOLDERID_CommonPrograms, 4),
        (FOLDERID_Desktop, 2),
        (FOLDERID_PublicDesktop, 2),
        (FOLDERID_QuickLaunch, 2),
    ]
    .into_iter()
    .filter_map(|(folder_id, max_depth)| {
        known_folder_path(&folder_id).map(|path| CatalogRoot { path, max_depth })
    })
    .collect()
}

/// 走 `SHGetKnownFolderPath` 而不是拼环境变量，这样桌面被 OneDrive 重定向时
/// 也能拿到真实位置。
#[cfg(windows)]
fn known_folder_path(folder_id: &windows_core::GUID) -> Option<PathBuf> {
    use windows::Win32::System::Com::CoTaskMemFree;
    use windows::Win32::UI::Shell::{SHGetKnownFolderPath, KF_FLAG_DEFAULT};

    unsafe {
        let raw = SHGetKnownFolderPath(folder_id, KF_FLAG_DEFAULT, None).ok()?;
        if raw.is_null() {
            return None;
        }
        let value = raw.to_string().ok().map(PathBuf::from);
        CoTaskMemFree(Some(raw.0 as *const _));
        value.filter(|path| path.is_dir())
    }
}

#[cfg(not(windows))]
fn catalog_roots() -> Vec<CatalogRoot> {
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn walks_only_to_the_requested_depth() {
        let root = std::env::temp_dir().join("desktopgo-catalog-depth-test");
        let nested = root.join("level1").join("level2");
        let _ = std::fs::create_dir_all(&nested);
        let _ = std::fs::write(root.join("top.txt"), b"x");
        let _ = std::fs::write(nested.join("deep.txt"), b"x");

        let mut shallow = Vec::new();
        walk_root(&root, 1, &mut shallow);
        assert!(shallow.iter().any(|entry| entry.name == "top.txt"));
        assert!(!shallow.iter().any(|entry| entry.name == "deep.txt"));
        // 非快捷方式条目不带目标路径。
        assert!(shallow
            .iter()
            .filter(|entry| entry.name == "top.txt")
            .all(|entry| entry.target_path.is_empty()));

        let mut deep = Vec::new();
        walk_root(&root, 3, &mut deep);
        assert!(deep.iter().any(|entry| entry.name == "deep.txt"));
        assert!(deep
            .iter()
            .any(|entry| entry.is_folder && entry.name == "level1"));

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn missing_root_is_skipped_without_panicking() {
        let mut entries = Vec::new();
        walk_root(Path::new("Z:/desktopgo-does-not-exist"), 3, &mut entries);
        assert!(entries.is_empty());
    }
}
