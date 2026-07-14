mod models;
#[cfg(windows)]
mod platform_windows;
mod service;

pub use models::{CreateIconEntryInput, IconMutationTarget};
pub use models::{DesktopIcon, IconManagerItem, IconSyncResult, ImportDroppedPathsResult};
pub use service::{
    create_icon_entry, delete_desktop_icons, get_default_customapp_dir, get_desktop_icons,
    get_icon_manager_items, get_path_icon_base64, hide_desktop_icons, import_dropped_paths,
    launch_app, sync_full_customapp_icons, sync_full_desktop_icons, sync_new_customapp_icons,
    sync_new_desktop_icons, unhide_desktop_icons,
};
