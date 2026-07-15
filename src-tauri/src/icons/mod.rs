mod models;
#[cfg(windows)]
mod platform_windows;
mod service;

pub use models::{CreateIconEntryInput, IconMutationTarget};
pub use models::{DesktopIcon, IconManagerItem, ImportDroppedPathsResult, InvalidIconEntry};
pub use service::{
    create_icon_entry, delete_icons, get_icon_manager_items, get_icons, get_path_icon_base64,
    hide_icons, import_dropped_paths, launch_app, scan_invalid_icons, unhide_icons,
};
