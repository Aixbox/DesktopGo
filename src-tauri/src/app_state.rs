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
    pub(crate) display_layout: Mutex<Option<DisplayLayout>>,
}

/// 主窗口所在显示器的工作区与缩放比例快照。
///
/// 窗口只在创建时居中过一次，`show()` 不会重算位置；显示器分辨率或缩放一变，
/// 旧坐标就不再落在工作区正中。记下这份快照，下次显示时比对就知道要不要重排。
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct DisplayLayout {
    /// 显示器名称（Windows 形如 `\\.\DISPLAY1`），换分辨率时保持不变。
    pub(crate) monitor: Option<String>,
    pub(crate) x: i32,
    pub(crate) y: i32,
    pub(crate) width: u32,
    pub(crate) height: u32,
    /// 缩放比例按千分之一存整数，避免浮点比较误差。
    pub(crate) scale_milli: u32,
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
            display_layout: Mutex::new(None),
        }
    }
}
