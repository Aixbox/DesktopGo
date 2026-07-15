use serde::Serialize;
use std::{
    cell::{Cell, RefCell},
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
        Foundation::{DRAGDROP_E_INVALIDHWND, HWND, LPARAM, POINT, POINTL},
        System::{
            Com::{CoCreateInstance, IDataObject, DVASPECT_CONTENT, FORMATETC, TYMED_HGLOBAL},
            Ole::{
                IDropTarget, IDropTarget_Impl, RegisterDragDrop, RevokeDragDrop, CF_HDROP,
                DROPEFFECT, DROPEFFECT_COPY, DROPEFFECT_NONE,
            },
            SystemServices::MODIFIERKEYS_FLAGS,
        },
        UI::{
            Shell::{CLSID_DragDropHelper, DragQueryFileW, IDropTargetHelper, HDROP},
            WindowsAndMessaging::EnumChildWindows,
        },
    },
};

pub const NATIVE_FILE_DRAG_EVENT: &str = "desktopgo://native-file-drag";

thread_local! {
    static REGISTERED_TARGETS: RefCell<Vec<(isize, IDropTarget)>> = const { RefCell::new(Vec::new()) };
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeFileDragPayload {
    event_type: &'static str,
    paths: Vec<String>,
}

#[implement(IDropTarget)]
struct ShellDropTarget {
    hwnd: HWND,
    app: tauri::AppHandle,
    helper: Option<IDropTargetHelper>,
    cursor_effect: Cell<DROPEFFECT>,
    enter_is_valid: Cell<bool>,
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
        }
    }

    fn emit(&self, event_type: &'static str, paths: Vec<PathBuf>) {
        let payload = NativeFileDragPayload {
            event_type,
            paths: paths
                .into_iter()
                .map(|path| path.to_string_lossy().into_owned())
                .collect(),
        };
        if let Err(error) = self.app.emit(NATIVE_FILE_DRAG_EVENT, payload) {
            eprintln!("Failed to emit native file drag event: {error}");
        }
    }

    unsafe fn collect_paths(data_object: &IDataObject) -> Option<Vec<PathBuf>> {
        let format = FORMATETC {
            cfFormat: CF_HDROP.0,
            ptd: ptr::null_mut(),
            dwAspect: DVASPECT_CONTENT.0,
            lindex: -1,
            tymed: TYMED_HGLOBAL.0 as u32,
        };
        let medium = data_object.GetData(&format).ok()?;
        let hdrop = HDROP(medium.u.hGlobal.0 as _);
        let item_count = DragQueryFileW(hdrop, 0xFFFF_FFFF, None);
        let mut paths = Vec::with_capacity(item_count as usize);

        for index in 0..item_count {
            let character_count = DragQueryFileW(hdrop, index, None) as usize;
            let mut path_buffer = vec![0; character_count + 1];
            DragQueryFileW(hdrop, index, Some(&mut path_buffer));
            paths.push(OsString::from_wide(&path_buffer[..character_count]).into());
        }

        Some(paths)
    }

    fn screen_point(point: &POINTL) -> POINT {
        POINT {
            x: point.x,
            y: point.y,
        }
    }
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
            unsafe { *effect = DROPEFFECT_NONE };
            return Ok(());
        };
        let paths = unsafe { ShellDropTarget::collect_paths(data_object_ref) };
        let is_valid = paths.as_ref().is_some_and(|paths| !paths.is_empty());
        let cursor_effect = if is_valid {
            DROPEFFECT_COPY
        } else {
            DROPEFFECT_NONE
        };

        self.enter_is_valid.set(is_valid);
        self.cursor_effect.set(cursor_effect);
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
        self.emit("enter", paths.unwrap_or_default());
        Ok(())
    }

    fn DragOver(
        &self,
        _key_state: MODIFIERKEYS_FLAGS,
        point: &POINTL,
        effect: *mut DROPEFFECT,
    ) -> windows::core::Result<()> {
        let cursor_effect = self.cursor_effect.get();
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
        let cursor_effect = self.cursor_effect.get();
        unsafe { *effect = cursor_effect };

        if self.enter_is_valid.replace(false) {
            let Some(data_object_ref) = data_object.as_ref() else {
                self.cursor_effect.set(DROPEFFECT_NONE);
                return Ok(());
            };
            let paths =
                unsafe { ShellDropTarget::collect_paths(data_object_ref) }.unwrap_or_default();
            let screen_point = ShellDropTarget::screen_point(point);
            if let Some(helper) = &self.helper {
                let _ = unsafe { helper.Drop(data_object_ref, &screen_point, cursor_effect) };
            }
            self.emit("drop", paths);
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
    let registered = Rc::new(RefCell::new(Vec::<(isize, IDropTarget)>::new()));
    let callback_targets = registered.clone();

    let mut callback = move |hwnd: HWND| {
        let target: IDropTarget = ShellDropTarget::new(hwnd, app.clone()).into();
        let revoke_result = unsafe { RevokeDragDrop(hwnd) };
        if revoke_result != Err(DRAGDROP_E_INVALIDHWND.into())
            && unsafe { RegisterDragDrop(hwnd, &target) }.is_ok()
        {
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
    REGISTERED_TARGETS.with(|current| {
        let mut current = current.borrow_mut();
        for (hwnd, _) in current.drain(..) {
            let _ = unsafe { RevokeDragDrop(HWND(hwnd as *mut _)) };
        }
        *current = targets;
    });

    if installed_count == 0 {
        return Err("No WebView drag-drop target was found".to_string());
    }
    Ok(installed_count)
}
