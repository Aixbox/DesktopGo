#[cfg(windows)]
mod catalog_windows;
mod image_data;
mod models;
#[cfg(windows)]
mod platform_windows;
mod search_cache;
mod search_icon_plan;
mod service;
#[cfg(windows)]
mod shell_icon_windows;
mod url_shortcut;
mod website;

/// 「无快捷方式」的注册应用来源（App Paths + 商店应用）。最佳匹配目录表
/// （`crate::launcher_catalog`）复用这份清单，目录清单扫不到的应用从这里补。
pub(crate) use catalog_windows::app_import::{collect_registered_app_candidates, ScannedCandidate};
pub use models::{CreateIconEntryInput, IconMutationTarget, UpdateIconEntryInput};
pub use models::{
    DesktopIcon, IconManagerItem, ImportDroppedPathsResult, InvalidIconEntry, ScannedInstalledApp,
    WebsiteIconResult,
};
/// `.lnk` 目标解析。图标提取之外，`crate::shortcut_target` 也要用它做搜索去重。
#[cfg(windows)]
pub(crate) use platform_windows::resolve_lnk;
pub(crate) use search_icon_plan::normalize_special_shell_path;
pub use service::{
    create_icon_entry, delete_icons, get_custom_icon_source, get_icon_edit_source,
    get_icon_manager_items, get_icons, get_path_icon_base64, get_search_result_icons, hide_icons,
    import_app_entries, import_dropped_paths, launch_app, scan_installed_apps, scan_invalid_icons,
    unhide_icons, update_icon_entry,
};
pub use website::{extract_website_icon, optimize_icon_data_uri};
