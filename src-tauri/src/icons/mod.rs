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
mod website;

pub use models::{CreateIconEntryInput, IconMutationTarget, UpdateIconEntryInput};
pub use models::{
    DesktopIcon, IconManagerItem, ImportDroppedPathsResult, InvalidIconEntry, WebsiteIconResult,
};
pub use service::{
    create_icon_entry, delete_icons, get_custom_icon_source, get_icon_edit_source,
    get_icon_manager_items, get_icons, get_path_icon_base64, get_search_result_icons, hide_icons,
    import_dropped_paths, launch_app, scan_invalid_icons, unhide_icons, update_icon_entry,
};
pub use website::{extract_website_icon, optimize_icon_data_uri};
