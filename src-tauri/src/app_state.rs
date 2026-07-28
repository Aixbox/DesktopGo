use serde::Serialize;
use std::sync::{atomic::AtomicBool, Mutex};
use std::time::Instant;

pub(crate) const WINDOW_PERSISTENT_CHANGED_EVENT: &str = "desktopgo://window-persistent-changed";
pub(crate) const SETTINGS_RETURNED_TO_MAIN_EVENT: &str = "desktopgo://settings-returned-to-main";

pub(crate) struct MainWindowState {
    pub(crate) ready: AtomicBool,
    pub(crate) pending_show: AtomicBool,
    pub(crate) suppress_blur: AtomicBool,
    pub(crate) window_persistent_enabled: AtomicBool,
    pub(crate) transparent_surface_enabled: AtomicBool,
    pub(crate) manual_always_on_top_enabled: AtomicBool,
    pub(crate) suppress_blur_until: Mutex<Option<Instant>>,
    pub(crate) last_show_request: Mutex<Option<Instant>>,
}

#[derive(Clone, Copy, Serialize)]
pub(crate) struct WindowPersistentChangedPayload {
    pub(crate) enabled: bool,
}

impl Default for MainWindowState {
    fn default() -> Self {
        Self {
            ready: AtomicBool::new(false),
            pending_show: AtomicBool::new(false),
            suppress_blur: AtomicBool::new(false),
            window_persistent_enabled: AtomicBool::new(false),
            transparent_surface_enabled: AtomicBool::new(true),
            manual_always_on_top_enabled: AtomicBool::new(false),
            suppress_blur_until: Mutex::new(None),
            last_show_request: Mutex::new(None),
        }
    }
}
