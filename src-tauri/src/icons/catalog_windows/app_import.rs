//! 「快捷导入」应用扫描。
//!
//! 启动台为空时的引导入口要能一次性把系统里已安装的应用找出来批量导入。
//! 扫描范围刻意铺得比桌面快照更广：用户开始菜单、公共开始菜单、用户桌面、
//! 公共桌面、快速启动，最后补上注册表 App Paths —— 后者覆盖那些只装了
//! exe、没有生成任何快捷方式的「非常规位置」。
//!
//! 重复检测在扫描阶段一次做完，区分三档：
//! - 一定重复（exact_duplicate）：条目的身份键（解析出的目标路径，无目标则用
//!   入口路径，与 `import_identity_key` 同一规则）与图标库中现有图标一致。
//!   这类应用就是「已导入」，确认弹窗里默认取消勾选。
//! - 可能重复（possible_duplicate）：身份键不同，但名称与现有图标相同。
//!   可能是同一软件的不同发行渠道，交给用户判断。
//! - 新应用（new）：其余全部。
//!
//! 扫描不做缓存：这个功能只在图标库为空（或用户主动点击）时触发一次，
//! 目录内容与图标库随时可能变化，缓存反而要处理失效。

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use crate::icons::models::{ScannedInstalledApp, SnapshotIconItem};
use crate::icons::search_icon_plan::is_special_shell_path;
use crate::icons::url_shortcut::{is_url_shortcut, read_url_shortcut};
use crate::shortcut_target::resolve_shortcut_target;

use super::storage::load_icon_library_snapshot;

/// 单次扫描的结果上限，防止病态目录树把确认弹窗撑爆。
const MAX_SCAN_RESULTS: usize = 2000;

/// 注册表 App Paths 单个来源的上限，它只是补充来源，不该主导整个清单。
const MAX_APP_PATHS_RESULTS: usize = 400;

/// 名称里含这些关键词的条目多半是安装器、卸载器或文档，不算「应用」。
/// 关键词按小写匹配，中英文都收。
const JUNK_NAME_KEYWORDS: &[&str] = &[
    "uninstall",
    "卸载",
    "setup",
    "installer",
    "安装程序",
    "readme",
    "帮助文档",
    "help",
    "license",
    "许可",
    "configure",
    "crash",
    "debug",
    "documentation",
    "manual",
    "手册",
    "更新程序",
    "升级",
    "upgrade",
    "修复",
    "repair",
    "register",
];

const STATUS_NEW: &str = "new";
const STATUS_POSSIBLE_DUPLICATE: &str = "possible_duplicate";
const STATUS_EXACT_DUPLICATE: &str = "exact_duplicate";

/// 来源优先级：开始菜单是应用快捷方式的「正主」，桌面/快速启动次之，
/// 注册表 App Paths 最后。同一身份键多条命中时保留优先级最高的那条。
const PRIORITY_USER_PROGRAMS: u8 = 0;
const PRIORITY_COMMON_PROGRAMS: u8 = 1;
const PRIORITY_USER_DESKTOP: u8 = 2;
const PRIORITY_COMMON_DESKTOP: u8 = 3;
const PRIORITY_QUICK_LAUNCH: u8 = 4;
const PRIORITY_APP_PATHS: u8 = 5;

#[derive(Debug, Clone)]
struct ScannedCandidate {
    display_name: String,
    /// 导入时作为入口路径传给 `create_icon_entry`。
    entry_path: String,
    /// 解析出的目标 / exe 路径 / URL，只用于展示。
    target_path: String,
    /// 去重与重复检测用的身份键。
    identity: String,
    item_type: String,
    source_label: &'static str,
    source_priority: u8,
}

pub(in crate::icons) fn scan_installed_apps_windows(
    app_handle: &tauri::AppHandle,
) -> Vec<ScannedInstalledApp> {
    let mut candidates = collect_folder_candidates();
    candidates.extend(collect_app_paths_candidates());
    let deduped = dedupe_candidates(candidates);
    let existing = load_icon_library_snapshot(app_handle)
        .map(|snapshot| snapshot.icons)
        .unwrap_or_default();
    // 图标库加载失败时按空库处理：扫描结果仍然可用，只是重复标记可能缺失。
    classify_candidates(deduped, existing)
}

fn collect_folder_candidates() -> Vec<ScannedCandidate> {
    #[cfg(windows)]
    {
        use windows::Win32::UI::Shell::{
            FOLDERID_CommonPrograms, FOLDERID_Desktop, FOLDERID_Programs, FOLDERID_PublicDesktop,
            FOLDERID_QuickLaunch,
        };

        let sources: [(&str, &windows_core::GUID, usize, u8); 5] = [
            ("开始菜单", &FOLDERID_Programs, 6, PRIORITY_USER_PROGRAMS),
            (
                "公共开始菜单",
                &FOLDERID_CommonPrograms,
                6,
                PRIORITY_COMMON_PROGRAMS,
            ),
            ("桌面", &FOLDERID_Desktop, 2, PRIORITY_USER_DESKTOP),
            (
                "公共桌面",
                &FOLDERID_PublicDesktop,
                2,
                PRIORITY_COMMON_DESKTOP,
            ),
            ("快速启动", &FOLDERID_QuickLaunch, 3, PRIORITY_QUICK_LAUNCH),
        ];

        let mut candidates = Vec::new();
        for (label, folder_id, max_depth, priority) in sources {
            if candidates.len() >= MAX_SCAN_RESULTS {
                break;
            }
            let Some(root) = crate::launcher_catalog::known_folder_path(folder_id) else {
                continue;
            };
            if !root.is_dir() {
                continue;
            }
            let mut source = FolderSource { label, priority };
            walk_folder(&root, max_depth, &mut source, &mut candidates);
        }
        candidates
    }
    #[cfg(not(windows))]
    {
        Vec::new()
    }
}

struct FolderSource {
    label: &'static str,
    priority: u8,
}

/// 递归枚举，层数是**剩余**层数。与 `launcher_catalog::walk_dir` 一致：
/// 不跟随符号链接与 junction，防止目录环把栈撑爆。
fn walk_folder(
    dir: &Path,
    depth: usize,
    source: &mut FolderSource,
    out: &mut Vec<ScannedCandidate>,
) {
    if depth == 0 || out.len() >= MAX_SCAN_RESULTS {
        return;
    }
    let Ok(reader) = std::fs::read_dir(dir) else {
        return;
    };

    for entry in reader.flatten() {
        if out.len() >= MAX_SCAN_RESULTS {
            return;
        }
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        let path = entry.path();
        if file_type.is_dir() {
            walk_folder(&path, depth - 1, source, out);
            continue;
        }
        if file_type.is_symlink() && path.is_dir() {
            continue;
        }
        if let Some(candidate) = candidate_from_file(&path, source) {
            out.push(candidate);
        }
    }
}

fn candidate_from_file(path: &Path, source: &mut FolderSource) -> Option<ScannedCandidate> {
    let file_name = path.file_name().and_then(|value| value.to_str())?;
    if file_name.starts_with('.') || file_name.eq_ignore_ascii_case("desktop.ini") {
        return None;
    }
    let display_name = path
        .file_stem()
        .and_then(|value| value.to_str())
        .map(|value| value.trim().to_string())
        .unwrap_or_default();
    if is_junk_name(&display_name) {
        return None;
    }

    let entry_path = path.to_string_lossy().to_string();
    let path_lowercase = entry_path.to_lowercase();

    if super::item::has_extension(path, "lnk") {
        let resolved = resolve_shortcut_target(path).unwrap_or_default();
        if resolved.is_empty() {
            // 解析不出的快捷方式（指向 shell 命名空间、部分商店应用等）仍保留，
            // 让用户在确认弹窗里自行决定；身份键退化为入口路径本身。
            return Some(ScannedCandidate {
                display_name,
                entry_path,
                target_path: String::new(),
                identity: path_lowercase,
                item_type: "shortcut".to_string(),
                source_label: source.label,
                source_priority: source.priority,
            });
        }
        if is_special_shell_path(&resolved) || Path::new(&resolved).is_dir() {
            return None;
        }
        return Some(ScannedCandidate {
            display_name,
            entry_path,
            target_path: resolved.clone(),
            identity: resolved.to_lowercase(),
            item_type: "shortcut".to_string(),
            source_label: source.label,
            source_priority: source.priority,
        });
    }

    if is_url_shortcut(path) {
        let url = read_url_shortcut(path)
            .map(|info| info.target)
            .unwrap_or_default();
        let url = url.trim().to_string();
        if url.is_empty() {
            return None;
        }
        return Some(ScannedCandidate {
            display_name,
            entry_path,
            target_path: url.clone(),
            identity: url.to_lowercase(),
            item_type: "shortcut".to_string(),
            source_label: source.label,
            source_priority: source.priority,
        });
    }

    if super::item::has_extension(path, "exe") {
        return Some(ScannedCandidate {
            display_name,
            entry_path,
            target_path: path_lowercase.clone(),
            identity: path_lowercase,
            item_type: "executable".to_string(),
            source_label: source.label,
            source_priority: source.priority,
        });
    }

    None
}

/// 注册表 App Paths：`HKLM/HKCU\...\App Paths` 的每个子键是一项已注册应用，
/// 默认值是可执行文件路径。覆盖那些没写快捷方式、只装了 exe 的应用。
fn collect_app_paths_candidates() -> Vec<ScannedCandidate> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ};
    use winreg::RegKey;

    const APP_PATHS: &str = r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths";
    const APP_PATHS_WOW64: &str =
        r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths";

    let hives = [
        (HKEY_LOCAL_MACHINE, APP_PATHS),
        (HKEY_LOCAL_MACHINE, APP_PATHS_WOW64),
        (HKEY_CURRENT_USER, APP_PATHS),
    ];
    let mut candidates = Vec::new();
    for (hive, sub_path) in hives {
        let Ok(root) = RegKey::predef(hive).open_subkey_with_flags(sub_path, KEY_READ) else {
            continue;
        };
        for sub_name in root.enum_keys().flatten() {
            if candidates.len() >= MAX_APP_PATHS_RESULTS {
                return candidates;
            }
            let Ok(sub) = root.open_subkey_with_flags(&sub_name, KEY_READ) else {
                continue;
            };
            let Some(raw_path) = sub.get_value::<String, _>("").ok() else {
                continue;
            };
            let expanded = expand_env_vars(&raw_path)
                .trim()
                .trim_matches('"')
                .trim()
                .to_string();
            if expanded.is_empty() {
                continue;
            }
            let exe_path = PathBuf::from(&expanded);
            if !exe_path.is_file() {
                continue;
            }
            let display_name = sub_name
                .trim()
                .strip_suffix(".exe")
                .unwrap_or(sub_name.trim())
                .trim()
                .trim_end_matches('.')
                .to_string();
            if is_junk_name(&display_name) {
                continue;
            }
            let identity = expanded.to_lowercase();
            candidates.push(ScannedCandidate {
                display_name,
                target_path: expanded.clone(),
                entry_path: expanded,
                identity,
                item_type: "executable".to_string(),
                source_label: "注册表",
                source_priority: PRIORITY_APP_PATHS,
            });
        }
    }
    candidates
}

/// 展开注册表值里常见的 `%ProgramFiles%` 之类的环境变量引用。
/// 展开失败的变量保留原样，让后续的存在性检查自然过滤掉。
fn expand_env_vars(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let mut rest = input;
    while let Some(start) = rest.find('%') {
        output.push_str(&rest[..start]);
        let after = &rest[start + 1..];
        match after.find('%') {
            Some(end) => {
                let name = &after[..end];
                if name.is_empty() {
                    output.push('%');
                } else if let Ok(value) = std::env::var(name) {
                    output.push_str(&value);
                } else {
                    output.push('%');
                    output.push_str(name);
                    output.push('%');
                }
                rest = &after[end + 1..];
            }
            None => {
                output.push('%');
                rest = after;
            }
        }
    }
    output.push_str(rest);
    output
}

fn is_junk_name(display_name: &str) -> bool {
    let normalized = display_name.trim().to_lowercase();
    normalized.is_empty()
        || JUNK_NAME_KEYWORDS
            .iter()
            .any(|keyword| normalized.contains(keyword))
}

/// 同一身份键只保留优先级最高（数字最小）的条目，然后按来源与名称排序。
fn dedupe_candidates(candidates: Vec<ScannedCandidate>) -> Vec<ScannedCandidate> {
    let mut best: HashMap<String, ScannedCandidate> = HashMap::new();
    for candidate in candidates {
        let dominated = best
            .get(&candidate.identity)
            .is_some_and(|existing| existing.source_priority <= candidate.source_priority);
        if !dominated {
            best.insert(candidate.identity.clone(), candidate);
        }
    }
    let mut deduped: Vec<ScannedCandidate> = best.into_values().collect();
    deduped.sort_by(|left, right| {
        left.source_priority
            .cmp(&right.source_priority)
            .then_with(|| {
                left.display_name
                    .to_lowercase()
                    .cmp(&right.display_name.to_lowercase())
            })
    });
    deduped.truncate(MAX_SCAN_RESULTS);
    deduped
}

fn classify_candidates(
    candidates: Vec<ScannedCandidate>,
    existing: Vec<SnapshotIconItem>,
) -> Vec<ScannedInstalledApp> {
    let existing_identities: HashSet<String> = existing
        .iter()
        .map(|item| {
            // 与 import_identity_key 同一规则：优先目标路径，无目标退化为入口路径。
            if item.target_path.trim().is_empty() {
                item.path.trim().to_lowercase()
            } else {
                item.target_path.trim().to_lowercase()
            }
        })
        .collect();
    let existing_names: HashSet<String> = existing
        .iter()
        .map(|item| item.name.trim().to_lowercase())
        .filter(|name| !name.is_empty())
        .collect();

    candidates
        .into_iter()
        .map(|candidate| {
            let status = if existing_identities.contains(&candidate.identity) {
                STATUS_EXACT_DUPLICATE
            } else if existing_names.contains(&candidate.display_name.to_lowercase()) {
                STATUS_POSSIBLE_DUPLICATE
            } else {
                STATUS_NEW
            };
            ScannedInstalledApp {
                source_path: candidate.entry_path,
                display_name: candidate.display_name,
                target_path: candidate.target_path,
                item_type: candidate.item_type,
                source_label: candidate.source_label.to_string(),
                status: status.to_string(),
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn candidate(name: &str, identity: &str, priority: u8) -> ScannedCandidate {
        ScannedCandidate {
            display_name: name.to_string(),
            entry_path: format!("C:\\dummy\\{name}.lnk"),
            target_path: identity.to_string(),
            identity: identity.to_lowercase(),
            item_type: "shortcut".to_string(),
            source_label: "测试",
            source_priority: priority,
        }
    }

    #[test]
    fn junk_names_are_filtered() {
        assert!(is_junk_name("Uninstall Foo"));
        assert!(is_junk_name("应用卸载程序"));
        assert!(is_junk_name("  "));
        assert!(!is_junk_name("Visual Studio Code"));
        assert!(!is_junk_name("微信"));
    }

    #[test]
    fn env_vars_expand_and_keep_unknown_placeholders() {
        std::env::set_var("DESKTOPGO_TEST_DIR", "C:\\Program Files");
        assert_eq!(
            expand_env_vars("%DESKTOPGO_TEST_DIR%\\app.exe"),
            "C:\\Program Files\\app.exe"
        );
        assert_eq!(
            expand_env_vars("%DESKTOPGO_TEST_MISSING_VAR%\\app.exe"),
            "%DESKTOPGO_TEST_MISSING_VAR%\\app.exe"
        );
    }

    #[test]
    fn dedupe_keeps_the_highest_priority_entry_per_identity() {
        let deduped = dedupe_candidates(vec![
            candidate("注册表版", "C:\\Apps\\foo.exe", PRIORITY_APP_PATHS),
            candidate("桌面版", "C:\\Apps\\foo.exe", PRIORITY_USER_DESKTOP),
            candidate("菜单版", "C:\\Apps\\foo.exe", PRIORITY_USER_PROGRAMS),
            candidate("另一个", "C:\\Apps\\bar.exe", PRIORITY_USER_PROGRAMS),
        ]);
        assert_eq!(deduped.len(), 2);
        let foo = deduped
            .iter()
            .find(|item| item.identity == "c:\\apps\\foo.exe")
            .expect("foo 条目应保留");
        assert_eq!(foo.display_name, "菜单版", "同身份键保留开始菜单来源");
        assert!(
            deduped
                .iter()
                .any(|item| item.identity == "c:\\apps\\bar.exe"),
            "不同身份键的条目互不干扰"
        );
    }

    #[test]
    fn classification_matches_identity_and_name() {
        let existing = vec![SnapshotIconItem {
            id: "existing-id".to_string(),
            key: "existing-key".to_string(),
            display_order: 1,
            name: "微信".to_string(),
            path: "C:\\Library\\wechat.lnk".to_string(),
            target_path: "C:\\Apps\\WeChat.exe".to_string(),
            launch_arguments: String::new(),
            working_directory: String::new(),
            custom_icon_path: String::new(),
            icon_source: "target".to_string(),
            icon_color: "none".to_string(),
            icon_text: String::new(),
            item_type: "shortcut".to_string(),
            origin: "import".to_string(),
            hidden: false,
            icon: String::new(),
            automatic_target_icon_cache: false,
            automatic_target_icon_cache_version: 0,
            legacy_icons: None,
        }];

        let classified = classify_candidates(
            vec![
                // 大小写不同但身份一致 → 一定重复。
                candidate("WeChat", "c:\\apps\\wechat.exe", PRIORITY_USER_DESKTOP),
                // 目标不同但名称相同 → 可能重复。
                candidate(
                    "微信",
                    "C:\\Other\\wechat-portable.exe",
                    PRIORITY_USER_DESKTOP,
                ),
                // 都不同 → 新应用。
                candidate("DesktopGo", "C:\\Apps\\desktopgo.exe", PRIORITY_APP_PATHS),
            ],
            existing,
        );

        assert_eq!(classified[0].status, "exact_duplicate");
        assert_eq!(classified[1].status, "possible_duplicate");
        assert_eq!(classified[2].status, "new");
    }
}
