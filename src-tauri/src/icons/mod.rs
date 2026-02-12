mod models;
#[cfg(windows)]
mod platform_windows;
mod service;

pub use models::{DesktopIcon, IconSyncResult};
pub use service::{
    delete_desktop_icons, get_desktop_icons, hide_desktop_icons, launch_app,
    sync_full_desktop_icons, sync_new_desktop_icons,
};
