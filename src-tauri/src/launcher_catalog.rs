//! 「最佳匹配」用的启动器目录表。
//!
//! Everything 只做字面子串匹配，所以 `vscode` 永远搜不到 `Visual Studio Code`
//! —— 关键词里没有空格，而 Everything 无法被要求做词首缩写匹配。
//!
//! 所以这里把用户指定的目录整体读出来交给前端，由前端用 fzf 式打分在内存里匹配，
//! 和启动台图标同一套逻辑。对齐 Listary 的做法：它的应用索引与文件索引是分开的，
//! 搜索参数里有 `only_search_in_paths`（见 docs/LISTARY_BINARY_ANALYSIS.zh-CN.md 第 4 节）。
//!
//! 扫哪些目录、收哪些类型，全部由 `LauncherCatalogConfig` 决定 —— 开始菜单、桌面、
//! 快速启动只是前端首次写入的**预设**内容（`default_launcher_folders`），这里不再有
//! 「内置目录」这个概念。返回值把每个目录的真实路径、层数、条目数一起报给前端，
//! 设置页显示的就是搜索真正用的那份清单，不会出现两套说法。
//!
//! 目录内容随时可能变化，所以这里不做任何缓存：每次调用都重新枚举，
//! 由前端决定在一次面板会话内复用。`.lnk` 的目标解析是唯一的例外
//! （见 `crate::shortcut_target`），它按修改时间缓存，重复枚举不必重复走 COM。

use crate::shortcut_target::resolve_shortcut_target;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// 兜底上限。「不限层数」配上一个大目录时全靠它收口。
const MAX_CATALOG_ENTRIES: usize = 20_000;

/// 层数与条数上限，和前端 `bestMatchFolders.ts` 里的常量对齐。
/// `max_depth: 0` 表示不限层数。
const MIN_DEPTH: usize = 1;
const MAX_DEPTH: usize = 8;
const DEFAULT_DEPTH: usize = 2;
const MAX_FOLDERS: usize = 16;

/// 「不限层数」的绝对兜底。目录树再深也不该无限递归下去 —— 真正的环由
/// 「不跟随符号链接/junction」挡住，这个常量挡的是病态深的普通目录树。
const ABSOLUTE_MAX_DEPTH: usize = 32;

/// 「其它类型」哨兵，和前端 `catalogFileTypes.ts` 的 `CATALOG_ANY_EXTENSION` 一致：
/// 出现在清单里就表示不按扩展名过滤。
const ANY_EXTENSION: &str = "*";

fn default_enabled() -> bool {
    true
}

fn default_include_folders() -> bool {
    true
}

/// 缺字段时按默认层数处理。不能让它落到 0 —— 0 现在表示「不限层数」，
/// 一份不完整的配置不该因此把整棵树读进来。
fn default_depth() -> usize {
    DEFAULT_DEPTH
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogFolderConfig {
    pub path: String,
    /// 0 表示不限层数。
    #[serde(default = "default_depth")]
    pub max_depth: usize,
    /// 缺字段时按启用处理：用户加过的目录不该因为版本差异静默失效。
    #[serde(default = "default_enabled")]
    pub enabled: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherCatalogConfig {
    #[serde(default)]
    pub folders: Vec<CatalogFolderConfig>,
    /// 收录哪些扩展名（不含点、小写）。含 `*` 表示不过滤；为空表示只收文件夹。
    #[serde(default)]
    pub extensions: Vec<String>,
    #[serde(default = "default_include_folders")]
    pub include_folders: bool,
}

impl Default for LauncherCatalogConfig {
    fn default() -> Self {
        Self {
            folders: Vec::new(),
            extensions: Vec::new(),
            include_folders: true,
        }
    }
}

/// 收录规则。从配置里算一次，枚举时反复用。
struct EntryFilter {
    extensions: Vec<String>,
    allow_any_extension: bool,
    include_folders: bool,
}

impl EntryFilter {
    fn new(config: &LauncherCatalogConfig) -> Self {
        Self {
            allow_any_extension: config
                .extensions
                .iter()
                .any(|value| value.trim() == ANY_EXTENSION),
            extensions: config
                .extensions
                .iter()
                .map(|value| value.trim().trim_start_matches('.').to_lowercase())
                .filter(|value| !value.is_empty() && value != ANY_EXTENSION)
                .collect(),
            include_folders: config.include_folders,
        }
    }

    fn accepts_file(&self, path: &Path) -> bool {
        if self.allow_any_extension {
            return true;
        }
        path.extension()
            .and_then(|value| value.to_str())
            .map(|extension| {
                self.extensions
                    .iter()
                    .any(|allowed| extension.eq_ignore_ascii_case(allowed))
            })
            .unwrap_or(false)
    }
}

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

/// 一个目录的执行结果。设置页据此显示「这个目录真实在哪、扫了几层、收了多少条」。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherCatalogRoot {
    /// 稳定标识：归一化（小写、正斜杠）后的路径，前端按它对上自己那一行。
    pub key: String,
    pub path: String,
    /// 实际使用的层数，0 表示不限层数。
    pub max_depth: usize,
    pub enabled: bool,
    /// 路径当前是否存在。不存在也照样回报，好让设置页标注「未找到」而不是悄悄消失。
    pub exists: bool,
    /// 与前面某个目录指向同一个位置。这种目录不重复枚举。
    pub duplicate: bool,
    pub entry_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherCatalogSnapshot {
    pub roots: Vec<LauncherCatalogRoot>,
    pub entries: Vec<LauncherCatalogEntry>,
    /// 是否撞到 `MAX_CATALOG_ENTRIES`。撞到说明清单被截断，设置页要给出提示。
    pub truncated: bool,
}

/// 预设目录：开始菜单（当前用户 / 所有用户）、桌面（用户 / 公共）、快速启动。
/// 只是给前端首次写入清单用的建议值，写进去之后就是普通目录了。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DefaultLauncherFolder {
    pub path: String,
    pub max_depth: usize,
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

/// 递归枚举。`depth` 是**剩余**层数，调用方已经把「不限层数」换算成
/// `ABSOLUTE_MAX_DEPTH`，所以这里不需要区分两种模式。
///
/// 刻意不跟随符号链接与 junction：不限层数遇上目录环会直接把栈撑爆，而
/// `DirEntry::file_type` 不跟随链接，正好能在下钻前挡住。
fn walk_dir(
    dir: &Path,
    depth: usize,
    filter: &EntryFilter,
    entries: &mut Vec<LauncherCatalogEntry>,
) {
    if depth == 0 || entries.len() >= MAX_CATALOG_ENTRIES {
        return;
    }
    let Ok(reader) = std::fs::read_dir(dir) else {
        return;
    };

    for entry in reader.flatten() {
        if entries.len() >= MAX_CATALOG_ENTRIES {
            return;
        }
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        let path = entry.path();

        if file_type.is_dir() {
            if filter.include_folders {
                push_entry(entries, &path, true);
            }
            walk_dir(&path, depth - 1, filter, entries);
            continue;
        }
        if file_type.is_symlink() {
            // 指向目录的链接会在上面的分支之外被跳过，指向文件的链接照常按扩展名判断。
            if path.is_dir() {
                continue;
            }
        }
        if filter.accepts_file(&path) {
            push_entry(entries, &path, false);
        }
    }
}

/// 配置里的层数换算成实际递归深度：0（不限）→ `ABSOLUTE_MAX_DEPTH`，其余钳到 1..=8。
fn resolve_depth(max_depth: usize) -> usize {
    if max_depth == 0 {
        ABSOLUTE_MAX_DEPTH
    } else {
        max_depth.clamp(MIN_DEPTH, MAX_DEPTH)
    }
}

/// 归一化路径，用作去重键与前端对行的标识。和前端 `normalizeCatalogFolderPath` 一致。
fn folder_key(path: &str) -> String {
    path.trim()
        .replace('\\', "/")
        .trim_end_matches('/')
        .to_lowercase()
}

pub fn collect_launcher_catalog(config: LauncherCatalogConfig) -> LauncherCatalogSnapshot {
    let filter = EntryFilter::new(&config);
    let mut entries = Vec::new();
    let mut roots = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for folder in config.folders.iter().take(MAX_FOLDERS) {
        let trimmed = folder.path.trim();
        if trimmed.is_empty() {
            continue;
        }

        let key = folder_key(trimmed);
        // 同一个位置被填了两次（或者两个 known folder 指向同一处）时只枚举一次。
        let duplicate = !seen.insert(key.clone());
        let path = PathBuf::from(trimmed);
        let exists = path.is_dir();
        let before = entries.len();
        // 层数按配置原样回报（0 = 不限），换算只发生在真正下钻的时候。
        let reported_depth = if folder.max_depth == 0 {
            0
        } else {
            folder.max_depth.clamp(MIN_DEPTH, MAX_DEPTH)
        };

        if folder.enabled && exists && !duplicate {
            walk_dir(
                &path,
                resolve_depth(folder.max_depth),
                &filter,
                &mut entries,
            );
        }

        roots.push(LauncherCatalogRoot {
            key,
            path: trimmed.to_string(),
            max_depth: reported_depth,
            enabled: folder.enabled,
            exists,
            duplicate,
            entry_count: entries.len() - before,
        });
    }

    let truncated = entries.len() >= MAX_CATALOG_ENTRIES;
    LauncherCatalogSnapshot {
        roots,
        entries,
        truncated,
    }
}

/// 预设目录。只返回真实存在的那些 —— 清单里塞一堆「未找到」没有意义。
/// 开始菜单要往里钻（`Visual Studio Code\...lnk`），桌面浅一些，否则把当仓库用的
/// 桌面整棵树读进来。
#[cfg(windows)]
pub fn default_launcher_folders() -> Vec<DefaultLauncherFolder> {
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
        let path = known_folder_path(&folder_id)?;
        if !path.is_dir() {
            return None;
        }
        Some(DefaultLauncherFolder {
            path: path.to_string_lossy().to_string(),
            max_depth,
        })
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
        value.filter(|path| !path.as_os_str().is_empty())
    }
}

#[cfg(not(windows))]
pub fn default_launcher_folders() -> Vec<DefaultLauncherFolder> {
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn folder(path: &Path, max_depth: usize, enabled: bool) -> CatalogFolderConfig {
        CatalogFolderConfig {
            path: path.to_string_lossy().to_string(),
            max_depth,
            enabled,
        }
    }

    fn config(folders: Vec<CatalogFolderConfig>, extensions: &[&str]) -> LauncherCatalogConfig {
        LauncherCatalogConfig {
            folders,
            extensions: extensions.iter().map(|value| value.to_string()).collect(),
            include_folders: true,
        }
    }

    /// `root/{top.txt, tool.exe, plugin.dll, level1/{level2/deep.exe}}`
    fn temp_tree(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(name);
        let _ = std::fs::remove_dir_all(&root);
        let nested = root.join("level1").join("level2");
        let _ = std::fs::create_dir_all(&nested);
        let _ = std::fs::write(root.join("top.txt"), b"x");
        let _ = std::fs::write(root.join("tool.exe"), b"x");
        let _ = std::fs::write(root.join("plugin.dll"), b"x");
        let _ = std::fs::write(nested.join("deep.exe"), b"x");
        root
    }

    fn names(snapshot: &LauncherCatalogSnapshot) -> Vec<&str> {
        snapshot
            .entries
            .iter()
            .map(|entry| entry.name.as_str())
            .collect()
    }

    #[test]
    fn walks_only_to_the_requested_depth() {
        let root = temp_tree("desktopgo-catalog-depth");

        let shallow =
            collect_launcher_catalog(config(vec![folder(&root, 1, true)], &["exe", "txt"]));
        assert!(names(&shallow).contains(&"tool.exe"));
        assert!(names(&shallow).contains(&"top.txt"));
        assert!(!names(&shallow).contains(&"deep.exe"), "1 层不该看到第三层");

        let deep = collect_launcher_catalog(config(vec![folder(&root, 3, true)], &["exe"]));
        assert!(names(&deep).contains(&"deep.exe"), "3 层应该看到第三层");
        assert!(names(&deep).contains(&"level1"), "文件夹本身也应收录");

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn unlimited_depth_reaches_the_bottom_and_is_reported_as_zero() {
        let root = temp_tree("desktopgo-catalog-unlimited");

        let snapshot = collect_launcher_catalog(config(vec![folder(&root, 0, true)], &["exe"]));
        assert!(names(&snapshot).contains(&"deep.exe"), "不限层数应扫到底");
        assert_eq!(snapshot.roots[0].max_depth, 0, "层数应原样回报 0（不限）");

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn extension_filter_decides_which_files_are_collected() {
        let root = temp_tree("desktopgo-catalog-extensions");

        let programs = collect_launcher_catalog(config(vec![folder(&root, 2, true)], &["exe"]));
        assert!(names(&programs).contains(&"tool.exe"));
        assert!(!names(&programs).contains(&"top.txt"), "未勾选的类型不该收");
        assert!(!names(&programs).contains(&"plugin.dll"), "dll 不在清单里");

        // 「其它类型」哨兵 = 不过滤。
        let everything = collect_launcher_catalog(config(vec![folder(&root, 2, true)], &["*"]));
        assert!(
            names(&everything).contains(&"plugin.dll"),
            "勾了其它类型就全收"
        );

        // 点号与大小写都应被容忍。
        let tolerant = collect_launcher_catalog(config(vec![folder(&root, 2, true)], &[".EXE"]));
        assert!(names(&tolerant).contains(&"tool.exe"));

        // 一个类型都不勾时只剩文件夹。
        let folders_only = collect_launcher_catalog(config(vec![folder(&root, 2, true)], &[]));
        assert!(folders_only.entries.iter().all(|entry| entry.is_folder));
        assert!(names(&folders_only).contains(&"level1"));

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn folders_can_be_excluded() {
        let root = temp_tree("desktopgo-catalog-no-folders");

        let snapshot = collect_launcher_catalog(LauncherCatalogConfig {
            folders: vec![folder(&root, 3, true)],
            extensions: vec!["exe".to_string()],
            include_folders: false,
        });
        assert!(snapshot.entries.iter().all(|entry| !entry.is_folder));
        // 不收文件夹条目，但仍然要往里钻。
        assert!(names(&snapshot).contains(&"deep.exe"));

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn snapshot_reports_every_folder_with_its_own_count() {
        let root = temp_tree("desktopgo-catalog-snapshot");
        let snapshot = collect_launcher_catalog(config(
            vec![
                folder(&root, 2, true),
                // 同一个目录换个写法再填一次：应被标成重复且不重复枚举。
                CatalogFolderConfig {
                    path: format!("{}\\", root.to_string_lossy()),
                    max_depth: 2,
                    enabled: true,
                },
                folder(Path::new("Z:/desktopgo-missing"), 2, true),
                folder(&root.join("level1"), 2, false),
            ],
            &["exe"],
        ));

        assert_eq!(snapshot.roots.len(), 4, "每条目录都要回报");
        assert!(
            snapshot.roots[0].enabled && snapshot.roots[0].exists && !snapshot.roots[0].duplicate
        );
        assert!(snapshot.roots[0].entry_count > 0);
        assert_eq!(snapshot.roots[0].entry_count, snapshot.entries.len());

        assert!(snapshot.roots[1].duplicate, "同一目录的第二条应标成重复");
        assert_eq!(snapshot.roots[1].entry_count, 0);

        assert!(!snapshot.roots[2].exists, "不存在的目录应回报 exists=false");
        assert_eq!(snapshot.roots[2].entry_count, 0);

        assert!(!snapshot.roots[3].enabled, "停用的目录不应枚举");
        assert_eq!(snapshot.roots[3].entry_count, 0);

        assert!(!snapshot.truncated);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn folder_count_is_capped_and_blank_paths_are_skipped() {
        let mut folders: Vec<CatalogFolderConfig> = (0..MAX_FOLDERS + 4)
            .map(|index| folder(&PathBuf::from(format!("Z:/folder{index}")), 2, true))
            .collect();
        folders.insert(
            0,
            CatalogFolderConfig {
                path: "   ".to_string(),
                max_depth: 2,
                enabled: true,
            },
        );

        let snapshot = collect_launcher_catalog(config(folders, &["exe"]));
        assert_eq!(
            snapshot.roots.len(),
            MAX_FOLDERS - 1,
            "空路径跳过、总数受上限约束"
        );
    }

    #[test]
    fn depth_is_clamped_and_defaults_when_missing() {
        assert_eq!(resolve_depth(0), ABSOLUTE_MAX_DEPTH, "0 表示不限层数");
        assert_eq!(resolve_depth(1), 1);
        assert_eq!(resolve_depth(99), MAX_DEPTH);
        assert_eq!(default_depth(), DEFAULT_DEPTH);

        let parsed: CatalogFolderConfig =
            serde_json::from_str(r#"{"path":"D:/Green"}"#).expect("应能解析缺字段的配置");
        assert_eq!(
            parsed.max_depth, DEFAULT_DEPTH,
            "缺层数字段不该变成不限层数"
        );
        assert!(parsed.enabled, "缺 enabled 字段应按启用处理");
    }

    #[test]
    fn missing_root_is_skipped_without_panicking() {
        let snapshot = collect_launcher_catalog(config(
            vec![folder(Path::new("Z:/desktopgo-does-not-exist"), 3, true)],
            &["exe"],
        ));
        assert!(snapshot.entries.is_empty());
        assert!(!snapshot.roots[0].exists);
    }
}
