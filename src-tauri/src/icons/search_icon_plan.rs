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

/// Control panel style entries are addressed by CLSID instead of by file path.
pub(super) fn is_shell_namespace_path(path: &str) -> bool {
    let trimmed = path.trim();
    trimmed.starts_with("::{") && trimmed.ends_with('}')
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
    if is_shell_namespace_path(trimmed) {
        return SearchIconSource::ShellNamespace(trimmed.to_lowercase());
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
        extension_lookup_name, icon_extension, is_shell_namespace_path, plan_search_icon,
        SearchIconSource,
    };

    #[test]
    fn extension_lookups_use_a_short_synthetic_name() {
        assert_eq!(extension_lookup_name("pdf"), "file.pdf");
        assert_eq!(extension_lookup_name(""), "file");
    }

    #[test]
    fn recognizes_shell_namespace_entries() {
        assert!(is_shell_namespace_path(
            "::{20D04FE0-3AEA-1069-A2D8-08002B30309D}"
        ));
        assert!(!is_shell_namespace_path("C:\\Users\\demo\\notes.txt"));
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
    }
}
