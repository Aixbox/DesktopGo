use serde::Serialize;
use std::{
    cell::{Cell, RefCell},
    collections::HashSet,
    ffi::OsString,
    os::windows::ffi::OsStringExt,
    path::PathBuf,
    ptr,
    rc::Rc,
};
use tauri::{Emitter, Manager};
use windows::Win32::System::Com::CLSCTX_INPROC_SERVER;
use windows::{
    core::implement,
    Win32::{
        Foundation::{HWND, LPARAM, POINT, POINTL},
        System::{
            Com::{
                CoCreateInstance, CoTaskMemFree, IDataObject, DVASPECT_CONTENT, FORMATETC,
                STGMEDIUM, TYMED_HGLOBAL,
            },
            Ole::{
                IDropTarget, IDropTarget_Impl, RegisterDragDrop, ReleaseStgMedium, RevokeDragDrop,
                CF_HDROP, DROPEFFECT, DROPEFFECT_COPY, DROPEFFECT_LINK, DROPEFFECT_MOVE,
                DROPEFFECT_NONE,
            },
            SystemServices::MODIFIERKEYS_FLAGS,
        },
        UI::{
            Shell::{
                CLSID_DragDropHelper, DragQueryFileW, IDropTargetHelper, IShellItem,
                IShellItemArray, SHCreateShellItemArrayFromDataObject, HDROP,
                SIGDN_DESKTOPABSOLUTEPARSING, SIGDN_FILESYSPATH, SIGDN_NORMALDISPLAY,
            },
            WindowsAndMessaging::EnumChildWindows,
        },
    },
};

use crate::icons::normalize_special_shell_path;

pub const NATIVE_FILE_DRAG_EVENT: &str = "desktopgo://native-file-drag";

thread_local! {
    static REGISTERED_TARGETS: RefCell<Vec<(isize, IDropTarget)>> = const { RefCell::new(Vec::new()) };
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeFileDragPayload {
    event_type: &'static str,
    items: Vec<NativeFileDragItem>,
    paths: Vec<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeFileDragItem {
    path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    display_name: Option<String>,
}

struct StgMediumGuard(STGMEDIUM);

impl StgMediumGuard {
    unsafe fn hdrop(&self) -> HDROP {
        HDROP(self.0.u.hGlobal.0 as _)
    }
}

impl Drop for StgMediumGuard {
    fn drop(&mut self) {
        unsafe { ReleaseStgMedium(&mut self.0) };
    }
}

#[implement(IDropTarget)]
struct ShellDropTarget {
    hwnd: HWND,
    app: tauri::AppHandle,
    helper: Option<IDropTargetHelper>,
    cursor_effect: Cell<DROPEFFECT>,
    enter_is_valid: Cell<bool>,
    entered_items: RefCell<Vec<NativeFileDragItem>>,
}

impl ShellDropTarget {
    fn new(hwnd: HWND, app: tauri::AppHandle) -> Self {
        let helper = unsafe {
            CoCreateInstance::<_, IDropTargetHelper>(
                &CLSID_DragDropHelper,
                None,
                CLSCTX_INPROC_SERVER,
            )
        }
        .ok();

        Self {
            hwnd,
            app,
            helper,
            cursor_effect: Cell::new(DROPEFFECT_NONE),
            enter_is_valid: Cell::new(false),
            entered_items: RefCell::new(Vec::new()),
        }
    }

    fn emit(&self, event_type: &'static str, items: Vec<NativeFileDragItem>) {
        let payload = NativeFileDragPayload {
            event_type,
            paths: items.iter().map(|item| item.path.clone()).collect(),
            items,
        };
        if let Err(error) = self.app.emit(NATIVE_FILE_DRAG_EVENT, payload) {
            eprintln!("Failed to emit native file drag event: {error}");
        }
    }

    unsafe fn collect_paths(data_object: &IDataObject) -> Option<Vec<NativeFileDragItem>> {
        let format = FORMATETC {
            cfFormat: CF_HDROP.0,
            ptd: ptr::null_mut(),
            dwAspect: DVASPECT_CONTENT.0,
            lindex: -1,
            tymed: TYMED_HGLOBAL.0 as u32,
        };
        let medium = StgMediumGuard(data_object.GetData(&format).ok()?);
        let hdrop = medium.hdrop();
        let item_count = DragQueryFileW(hdrop, 0xFFFF_FFFF, None);
        let mut paths = Vec::with_capacity(item_count as usize);

        for index in 0..item_count {
            let character_count = DragQueryFileW(hdrop, index, None) as usize;
            let mut path_buffer = vec![0; character_count + 1];
            DragQueryFileW(hdrop, index, Some(&mut path_buffer));
            let path: PathBuf = OsString::from_wide(&path_buffer[..character_count]).into();
            paths.push(NativeFileDragItem {
                path: path.to_string_lossy().into_owned(),
                display_name: None,
            });
        }

        Some(paths)
    }

    unsafe fn collect_shell_items(data_object: &IDataObject) -> Option<Vec<NativeFileDragItem>> {
        let shell_items: IShellItemArray =
            SHCreateShellItemArrayFromDataObject(data_object).ok()?;
        let item_count = shell_items.GetCount().ok()?;
        let mut items = Vec::with_capacity(item_count as usize);

        for index in 0..item_count {
            let Ok(shell_item) = shell_items.GetItemAt(index) else {
                continue;
            };
            if let Some(item) = Self::shell_item_to_drag_item(&shell_item) {
                items.push(item);
            }
        }

        Some(items)
    }

    unsafe fn shell_item_to_drag_item(shell_item: &IShellItem) -> Option<NativeFileDragItem> {
        let path = Self::shell_item_display_name(shell_item, SIGDN_DESKTOPABSOLUTEPARSING)
            .and_then(|value| normalize_special_shell_path(&value))
            .or_else(|| Self::shell_item_display_name(shell_item, SIGDN_FILESYSPATH))?;
        Some(NativeFileDragItem {
            path,
            display_name: Self::shell_item_display_name(shell_item, SIGDN_NORMALDISPLAY),
        })
    }

    unsafe fn shell_item_display_name(
        shell_item: &windows::Win32::UI::Shell::IShellItem,
        display_name_kind: windows::Win32::UI::Shell::SIGDN,
    ) -> Option<String> {
        let raw = shell_item.GetDisplayName(display_name_kind).ok()?;
        if raw.is_null() {
            return None;
        }
        let value = raw
            .to_string()
            .ok()
            .filter(|value| !value.trim().is_empty());
        CoTaskMemFree(Some(raw.0 as *const _));
        value
    }

    unsafe fn collect_dropped_items(data_object: &IDataObject) -> Option<Vec<NativeFileDragItem>> {
        let sources = [
            Self::collect_shell_items(data_object),
            Self::collect_paths(data_object),
        ];
        let mut seen = HashSet::new();
        let items = sources
            .into_iter()
            .flatten()
            .flatten()
            .filter(|item| seen.insert(item.path.to_lowercase()))
            .collect::<Vec<_>>();
        (!items.is_empty()).then_some(items)
    }

    fn screen_point(point: &POINTL) -> POINT {
        POINT {
            x: point.x,
            y: point.y,
        }
    }
}

fn resolve_cursor_effect(is_valid: bool, allowed_effects: DROPEFFECT) -> DROPEFFECT {
    if !is_valid {
        return DROPEFFECT_NONE;
    }
    [DROPEFFECT_COPY, DROPEFFECT_LINK, DROPEFFECT_MOVE]
        .into_iter()
        .find(|effect| allowed_effects.contains(*effect))
        .unwrap_or(DROPEFFECT_NONE)
}

#[allow(non_snake_case)]
impl IDropTarget_Impl for ShellDropTarget_Impl {
    fn DragEnter(
        &self,
        data_object: windows::core::Ref<'_, IDataObject>,
        _key_state: MODIFIERKEYS_FLAGS,
        point: &POINTL,
        effect: *mut DROPEFFECT,
    ) -> windows::core::Result<()> {
        let Some(data_object_ref) = data_object.as_ref() else {
            self.entered_items.borrow_mut().clear();
            unsafe { *effect = DROPEFFECT_NONE };
            return Ok(());
        };
        let items = unsafe { ShellDropTarget::collect_dropped_items(data_object_ref) };
        let is_valid = items.as_ref().is_some_and(|items| !items.is_empty());
        let allowed_effects = unsafe { *effect };
        let cursor_effect = resolve_cursor_effect(is_valid, allowed_effects);
        let is_valid = is_valid && cursor_effect != DROPEFFECT_NONE;

        self.enter_is_valid.set(is_valid);
        self.cursor_effect.set(cursor_effect);
        self.entered_items
            .replace(items.clone().unwrap_or_default());
        unsafe { *effect = cursor_effect };

        if !is_valid {
            return Ok(());
        }

        let screen_point = ShellDropTarget::screen_point(point);
        if let Some(helper) = &self.helper {
            let _ = unsafe {
                helper.DragEnter(self.hwnd, data_object_ref, &screen_point, cursor_effect)
            };
        }
        self.emit("enter", items.unwrap_or_default());
        Ok(())
    }

    fn DragOver(
        &self,
        _key_state: MODIFIERKEYS_FLAGS,
        point: &POINTL,
        effect: *mut DROPEFFECT,
    ) -> windows::core::Result<()> {
        let allowed_effects = unsafe { *effect };
        let cursor_effect = resolve_cursor_effect(self.enter_is_valid.get(), allowed_effects);
        self.cursor_effect.set(cursor_effect);
        unsafe { *effect = cursor_effect };
        if self.enter_is_valid.get() {
            let screen_point = ShellDropTarget::screen_point(point);
            if let Some(helper) = &self.helper {
                let _ = unsafe { helper.DragOver(&screen_point, cursor_effect) };
            }
        }
        Ok(())
    }

    fn DragLeave(&self) -> windows::core::Result<()> {
        if self.enter_is_valid.replace(false) {
            if let Some(helper) = &self.helper {
                let _ = unsafe { helper.DragLeave() };
            }
            self.emit("leave", Vec::new());
        }
        self.entered_items.borrow_mut().clear();
        self.cursor_effect.set(DROPEFFECT_NONE);
        Ok(())
    }

    fn Drop(
        &self,
        data_object: windows::core::Ref<'_, IDataObject>,
        _key_state: MODIFIERKEYS_FLAGS,
        point: &POINTL,
        effect: *mut DROPEFFECT,
    ) -> windows::core::Result<()> {
        let allowed_effects = unsafe { *effect };
        let cursor_effect = resolve_cursor_effect(self.enter_is_valid.get(), allowed_effects);
        unsafe { *effect = cursor_effect };
        let was_valid = self.enter_is_valid.replace(false);

        if cursor_effect != DROPEFFECT_NONE && was_valid {
            let Some(data_object_ref) = data_object.as_ref() else {
                self.entered_items.borrow_mut().clear();
                self.cursor_effect.set(DROPEFFECT_NONE);
                return Ok(());
            };
            let items = unsafe { ShellDropTarget::collect_dropped_items(data_object_ref) }
                .filter(|items| !items.is_empty())
                .unwrap_or_else(|| self.entered_items.borrow().clone());
            self.entered_items.borrow_mut().clear();
            let screen_point = ShellDropTarget::screen_point(point);
            if let Some(helper) = &self.helper {
                let _ = unsafe { helper.Drop(data_object_ref, &screen_point, cursor_effect) };
            }
            self.emit("drop", items);
        } else {
            self.entered_items.borrow_mut().clear();
        }

        self.cursor_effect.set(DROPEFFECT_NONE);
        Ok(())
    }
}

pub fn install(window: &tauri::WebviewWindow) -> Result<usize, String> {
    let parent = window
        .hwnd()
        .map_err(|error| format!("Failed to resolve main window handle: {error}"))?;
    let app = window.app_handle().clone();

    // Revoke targets from a previous WebView instance before registering the
    // new handles. Revoking them after RegisterDragDrop would also revoke a
    // freshly installed target when the window is recreated.
    REGISTERED_TARGETS.with(|current| {
        for (hwnd, _) in current.borrow_mut().drain(..) {
            let _ = unsafe { RevokeDragDrop(HWND(hwnd as *mut _)) };
        }
    });

    let registered = Rc::new(RefCell::new(Vec::<(isize, IDropTarget)>::new()));
    let callback_targets = registered.clone();

    let mut callback = move |hwnd: HWND| {
        if callback_targets
            .borrow()
            .iter()
            .any(|(registered_hwnd, _)| *registered_hwnd == hwnd.0 as isize)
        {
            return true;
        }

        let target: IDropTarget = ShellDropTarget::new(hwnd, app.clone()).into();
        let _ = unsafe { RevokeDragDrop(hwnd) };
        if unsafe { RegisterDragDrop(hwnd, &target) }.is_ok() {
            callback_targets
                .borrow_mut()
                .push((hwnd.0 as isize, target));
        }
        true
    };
    let mut callback_ref: &mut dyn FnMut(HWND) -> bool = &mut callback;
    let callback_pointer: *mut std::ffi::c_void = unsafe { std::mem::transmute(&mut callback_ref) };

    unsafe extern "system" fn enumerate_callback(hwnd: HWND, param: LPARAM) -> windows::core::BOOL {
        let callback =
            &mut *(param.0 as *mut std::ffi::c_void as *mut &mut dyn FnMut(HWND) -> bool);
        callback(hwnd).into()
    }

    callback(parent);
    let _ = unsafe {
        EnumChildWindows(
            Some(parent),
            Some(enumerate_callback),
            LPARAM(callback_pointer as isize),
        )
    };
    drop(callback);

    let targets = Rc::try_unwrap(registered)
        .map_err(|_| "Failed to finalize native drag-drop targets".to_string())?
        .into_inner();
    let installed_count = targets.len();
    REGISTERED_TARGETS.with(|current| *current.borrow_mut() = targets);

    if installed_count == 0 {
        return Err("No WebView drag-drop target was found".to_string());
    }
    Ok(installed_count)
}

#[cfg(test)]
mod tests {
    use super::resolve_cursor_effect;
    use windows::Win32::System::Ole::{
        DROPEFFECT_COPY, DROPEFFECT_LINK, DROPEFFECT_MOVE, DROPEFFECT_NONE,
    };

    #[test]
    fn chooses_an_effect_allowed_by_the_drag_source() {
        assert_eq!(
            resolve_cursor_effect(true, DROPEFFECT_LINK),
            DROPEFFECT_LINK
        );
        assert_eq!(
            resolve_cursor_effect(true, DROPEFFECT_MOVE | DROPEFFECT_LINK),
            DROPEFFECT_LINK
        );
        assert_eq!(
            resolve_cursor_effect(true, DROPEFFECT_COPY | DROPEFFECT_LINK),
            DROPEFFECT_COPY
        );
    }

    #[test]
    fn rejects_invalid_or_unsupported_drops() {
        assert_eq!(
            resolve_cursor_effect(false, DROPEFFECT_COPY),
            DROPEFFECT_NONE
        );
        assert_eq!(
            resolve_cursor_effect(true, DROPEFFECT_NONE),
            DROPEFFECT_NONE
        );
    }
}
