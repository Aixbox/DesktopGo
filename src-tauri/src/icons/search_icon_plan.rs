//! Decides where a search row's icon comes from, and therefore what it can be
//! cached by.
//!
//! Everything's own debug build logs `add ext icon %s`: ordinary files share one
//! icon per extension, and only entries that own an icon (executables,
//! shortcuts, folders with a `desktop.ini`) are worth resolving per path. That
//! split is what keeps a 20,000 row result set to a handful of icon extractions.

use std::path::Path;

/// The identity an icon can be cached under.
#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub(super) enum SearchIconSource {
    /// Virtual shell entry such as `::{GUID}`; only the shell namespace resolves it.
    ShellNamespace(String),
    /// Picture that acts as its own icon when Windows already cached the thumbnail.
    Thumbnail(String),
    /// Icon shared by every entry with this extension (lowercase, without the dot).
    SharedExtension(String),
    /// Icon that belongs to this single entry.
    OwnedByPath(String),
}

/// Extensions whose icon is stored inside the individual file, so two files with
/// the same extension routinely look different.
const OWNED_ICON_EXTENSIONS: &[&str] = &[
    "exe",
    "com",
    "scr",
    "pif",
    "dll",
    "ocx",
    "cpl",
    "msc",
    "msstyles",
    "lnk",
    "url",
    "ico",
    "cur",
    "ani",
    "appref-ms",
    "library-ms",
    "search-ms",
    "settingcontent-ms",
];

/// Picture formats whose own content is the better icon at list sizes.
const THUMBNAIL_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff"];

/// Canonicalizes a root Shell namespace entry to the `::{GUID}` form used by
/// the icon catalog and Shell APIs.
pub(crate) fn normalize_special_shell_path(path: &str) -> Option<String> {
    let trimmed = path.trim().trim_end_matches(['\\', '/']);
    let candidate = trimmed
        .get(..6)
        .filter(|prefix| prefix.eq_ignore_ascii_case("shell:"))
        .map_or(trimmed, |_| &trimmed[6..]);
    let guid = candidate
        .strip_prefix("::{")
        .and_then(|value| value.strip_suffix('}'))?;

    let guid = uuid::Uuid::parse_str(guid).ok()?;
    Some(format!("::{{{guid}}}"))
}

/// Control panel style entries are addressed by one CLSID instead of by a file path.
pub(crate) fn is_special_shell_path(path: &str) -> bool {
    normalize_special_shell_path(path).is_some()
}

/// `shell:AppsFolder` 的 parsing name 根（CLSID_AppsFolder）：SHParseDisplayName
/// 能沿它解析出具体商店应用条目。
pub(crate) const APPS_FOLDER_PARSING_ROOT: &str = "::{4234d49b-0245-4df3-b780-3893943456e1}";

/// 商店应用（UWP/MSIX）条目的目标形式：`shell:AppsFolder\<AUMID>`。
/// 这类条目没有文件路径，启动与图标提取都走 Shell 命名空间。
pub(crate) fn is_uwp_shell_path(path: &str) -> bool {
    let lower = path.trim().to_ascii_lowercase();
    lower.starts_with("shell:apps\\") || lower.starts_with("shell:appsfolder\\")
}

/// 从商店应用条目的两种目标形式中取出 AUMID：
/// `shell:AppsFolder\<AUMID>`（存储形式）与
/// `::{CLSID_AppsFolder}\<AUMID>`（Shell parsing name 形式）。
pub(crate) fn uwp_aumid_from_path(path: &str) -> Option<&str> {
    let trimmed = path.trim();
    let rest = if let Some(tail) = trimmed.strip_prefix(APPS_FOLDER_PARSING_ROOT) {
        tail
    } else {
        let lower = trimmed.to_ascii_lowercase();
        if lower.starts_with("shell:apps\\") {
            trimmed.get(11..)?
        } else if lower.starts_with("shell:appsfolder\\") {
            trimmed.get(17..)?
        } else {
            return None;
        }
    };
    let aumid = rest.trim_start_matches('\\').trim();
    (!aumid.is_empty()).then_some(aumid)
}

/// `shell:AppsFolder\<AUMID>` → `::{CLSID_AppsFolder}\<AUMID>`。
/// Shell 的 parsing name 形式；注意 AppsFolder 不能用
/// `SHCreateItemFromParsingName` 可靠解析，条目创建统一走
/// `create_shell_item_from_path` 里的 `SHCreateItemInKnownFolder` 分支。
pub(crate) fn uwp_parsing_path(path: &str) -> Option<String> {
    uwp_aumid_from_path(path).map(|aumid| format!("{APPS_FOLDER_PARSING_ROOT}\\{aumid}"))
}

/// Lowercase extension without the dot; empty when the entry has none.
pub(super) fn icon_extension(path: &str) -> String {
    Path::new(path)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_default()
}

pub(super) fn plan_search_icon(path: &str, is_folder: bool) -> SearchIconSource {
    let trimmed = path.trim();
    if let Some(shell_path) = normalize_special_shell_path(trimmed) {
        return SearchIconSource::ShellNamespace(shell_path.to_lowercase());
    }
    if is_folder {
        return SearchIconSource::OwnedByPath(trimmed.to_lowercase());
    }

    let extension = icon_extension(trimmed);
    if THUMBNAIL_EXTENSIONS.contains(&extension.as_str()) {
        return SearchIconSource::Thumbnail(trimmed.to_lowercase());
    }
    if OWNED_ICON_EXTENSIONS.contains(&extension.as_str()) {
        return SearchIconSource::OwnedByPath(trimmed.to_lowercase());
    }

    SearchIconSource::SharedExtension(extension)
}

/// Stand-in name used to ask the shell about an extension rather than a file.
///
/// The shell's association lookup only reads the extension, and a short synthetic
/// name also sidesteps `MAX_PATH`: Everything's changelog records the same class of
/// fix for "files with paths longer than 260 characters".
pub(super) fn extension_lookup_name(extension: &str) -> String {
    if extension.is_empty() {
        "file".to_string()
    } else {
        format!("file.{extension}")
    }
}

#[cfg(test)]
mod tests {
    use super::{
        extension_lookup_name, icon_extension, is_special_shell_path, is_uwp_shell_path,
        normalize_special_shell_path, plan_search_icon, uwp_aumid_from_path, uwp_parsing_path,
        SearchIconSource,
    };

    #[test]
    fn recognizes_uwp_shell_targets() {
        assert!(is_uwp_shell_path(
            "shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App"
        ));
        assert!(is_uwp_shell_path("shell:apps\\Vendor.App_abc123!Entry"));
        assert!(is_uwp_shell_path(
            "SHELL:APPSFOLDER\\microsoft.windowsterminal_8wekyb3d8bbwe!app"
        ));
        assert!(!is_uwp_shell_path("shell:desktop"));
        assert!(!is_uwp_shell_path(
            "shell:::{645FF040-5081-101B-9F08-00AA002F954E}"
        ));
        assert!(!is_uwp_shell_path("C:\\Program Files\\app.exe"));
        assert!(!is_uwp_shell_path(""));
    }

    #[test]
    fn converts_uwp_targets_to_parsable_namespace_paths() {
        assert_eq!(
            uwp_parsing_path("shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App"),
            Some(format!(
                "::{{4234d49b-0245-4df3-b780-3893943456e1}}\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App"
            ))
        );
        assert_eq!(
            uwp_parsing_path("shell:apps\\Vendor.App_abc123!Entry"),
            Some("::{4234d49b-0245-4df3-b780-3893943456e1}\\Vendor.App_abc123!Entry".to_string())
        );
        assert_eq!(uwp_parsing_path("shell:apps\\"), None);
        assert_eq!(uwp_parsing_path("shell:desktop"), None);
        assert_eq!(uwp_parsing_path("C:\\Apps\\foo.exe"), None);
    }

    #[test]
    fn extracts_aumid_from_both_uwp_path_forms() {
        // 存储形式（shell: 协议）。
        assert_eq!(
            uwp_aumid_from_path("shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App"),
            Some("Microsoft.WindowsCalculator_8wekyb3d8bbwe!App")
        );
        // Shell parsing name 形式（图标提取链路内部转换后的形式）。
        assert_eq!(
            uwp_aumid_from_path("::{4234d49b-0245-4df3-b780-3893943456e1}\\Vendor.App_abc!Entry"),
            Some("Vendor.App_abc!Entry")
        );
        // 根目录本身不是应用条目。
        assert_eq!(
            uwp_aumid_from_path("::{4234d49b-0245-4df3-b780-3893943456e1}"),
            None
        );
        assert_eq!(uwp_aumid_from_path("shell:AppsFolder\\"), None);
        assert_eq!(
            uwp_aumid_from_path("::{645FF040-5081-101B-9F08-00AA002F954E}"),
            None
        );
        assert_eq!(uwp_aumid_from_path("C:\\Program Files\\app.exe"), None);
    }

    #[test]
    fn extension_lookups_use_a_short_synthetic_name() {
        assert_eq!(extension_lookup_name("pdf"), "file.pdf");
        assert_eq!(extension_lookup_name(""), "file");
    }

    #[test]
    fn recognizes_only_valid_shell_namespace_entries() {
        assert!(is_special_shell_path(
            "::{20D04FE0-3AEA-1069-A2D8-08002B30309D}"
        ));
        assert!(is_special_shell_path(
            "::{645ff040-5081-101b-9f08-00aa002f954e}"
        ));
        assert!(!is_special_shell_path("::{not-a-guid}"));
        assert!(!is_special_shell_path(
            "::{20D04FE0-3AEA-1069-A2D8-08002B30309D}\\child"
        ));
        assert!(!is_special_shell_path("C:\\Users\\demo\\notes.txt"));
    }

    #[test]
    fn normalizes_shell_uri_and_trailing_separator_variants() {
        assert_eq!(
            normalize_special_shell_path("shell:::{645FF040-5081-101B-9F08-00AA002F954E}\\"),
            Some("::{645ff040-5081-101b-9f08-00aa002f954e}".to_string())
        );
        assert_eq!(
            normalize_special_shell_path("SHELL:::{645FF040-5081-101B-9F08-00AA002F954E}"),
            Some("::{645ff040-5081-101b-9f08-00aa002f954e}".to_string())
        );
        assert_eq!(
            normalize_special_shell_path("::{20D04FE0-3AEA-1069-A2D8-08002B30309D}"),
            Some("::{20d04fe0-3aea-1069-a2d8-08002b30309d}".to_string())
        );
        assert_eq!(normalize_special_shell_path("::{not-a-guid}"), None);
    }

    #[test]
    fn reads_extensions_case_insensitively() {
        assert_eq!(icon_extension("C:\\demo\\Report.PDF"), "pdf");
        assert_eq!(icon_extension("C:\\demo\\archive.tar.gz"), "gz");
        assert_eq!(icon_extension("C:\\demo\\hosts"), "");
    }

    #[test]
    fn ordinary_files_share_one_icon_per_extension() {
        assert_eq!(
            plan_search_icon("C:\\demo\\a.txt", false),
            SearchIconSource::SharedExtension("txt".to_string())
        );
        assert_eq!(
            plan_search_icon("C:\\demo\\b.TXT", false),
            SearchIconSource::SharedExtension("txt".to_string())
        );
        assert_eq!(
            plan_search_icon("C:\\demo\\hosts", false),
            SearchIconSource::SharedExtension(String::new())
        );
    }

    #[test]
    fn entries_that_carry_their_own_icon_are_keyed_by_path() {
        assert_eq!(
            plan_search_icon("C:\\demo\\tool.exe", false),
            SearchIconSource::OwnedByPath("c:\\demo\\tool.exe".to_string())
        );
        assert_eq!(
            plan_search_icon("C:\\demo\\link.lnk", false),
            SearchIconSource::OwnedByPath("c:\\demo\\link.lnk".to_string())
        );
        assert_eq!(
            plan_search_icon("C:\\Users\\demo\\Downloads", true),
            SearchIconSource::OwnedByPath("c:\\users\\demo\\downloads".to_string())
        );
    }

    #[test]
    fn pictures_prefer_their_own_thumbnail() {
        assert_eq!(
            plan_search_icon("C:\\demo\\shot.PNG", false),
            SearchIconSource::Thumbnail("c:\\demo\\shot.png".to_string())
        );
    }

    #[test]
    fn shell_namespace_entries_win_over_folder_and_extension_rules() {
        assert_eq!(
            plan_search_icon("::{ED7BA470-8E54-465E-825C-99712043E01C}", true),
            SearchIconSource::ShellNamespace(
                "::{ed7ba470-8e54-465e-825c-99712043e01c}".to_string()
            )
        );
        assert_eq!(
            plan_search_icon("shell:::{645FF040-5081-101B-9F08-00AA002F954E}\\", false),
            SearchIconSource::ShellNamespace(
                "::{645ff040-5081-101b-9f08-00aa002f954e}".to_string()
            )
        );
    }
}
