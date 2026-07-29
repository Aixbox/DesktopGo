mod host;
mod layout;
mod paint;
mod scrollbar;

use std::ffi::c_void;
use std::sync::{mpsc, Arc, Mutex};

use once_cell::sync::{Lazy, OnceCell};
use serde::Serialize;
use tauri::Manager;
use windows::core::{w, PCWSTR, PWSTR};
use windows::Win32::Foundation::{GetLastError, HINSTANCE, HWND, LPARAM, RECT, WPARAM};
use windows::Win32::Graphics::Gdi::{
    CreateFontW, InvalidateRect, CLEARTYPE_QUALITY, DEFAULT_CHARSET, DEFAULT_PITCH, FF_DONTCARE,
    FONT_CLIP_PRECISION, FONT_OUTPUT_PRECISION, HFONT,
};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::Controls::{
    ImageList_Create, ImageList_SetImageCount, InitCommonControls, ILC_COLOR32, LVCF_WIDTH,
    LVCOLUMNW, LVIF_STATE, LVIS_SELECTED, LVITEMW, LVM_ENSUREVISIBLE, LVM_INSERTCOLUMNW,
    LVM_SETBKCOLOR, LVM_SETCOLUMNWIDTH, LVM_SETEXTENDEDLISTVIEWSTYLE, LVM_SETIMAGELIST,
    LVM_SETITEMCOUNT, LVM_SETITEMSTATE, LVM_SETTEXTBKCOLOR, LVSIL_SMALL, LVS_EX_DOUBLEBUFFER,
    LVS_EX_FULLROWSELECT, LVS_NOCOLUMNHEADER, LVS_OWNERDATA, LVS_REPORT, LVS_SHOWSELALWAYS,
    LVS_SINGLESEL,
};
use windows::Win32::UI::Shell::SetWindowSubclass;
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DestroyWindow, GetClientRect, GetSystemMetrics, GetWindowLongPtrW, IsWindow,
    MoveWindow, RegisterClassW, SendMessageW, SetWindowLongPtrW, SetWindowPos, ShowWindow,
    CREATESTRUCTW, GWLP_USERDATA, HWND_TOP, SM_CXVSCROLL, SWP_NOACTIVATE, SWP_SHOWWINDOW, SW_HIDE,
    WINDOW_EX_STYLE, WINDOW_STYLE, WNDCLASSW, WS_CHILD, WS_CLIPCHILDREN, WS_CLIPSIBLINGS,
    WS_VISIBLE,
};

use super::model::{NativeSearchBounds, NativeSearchModel, NativeSearchPalette};
use super::NativeSearchListState;

const HOST_CLASS: &str = "DesktopGoNativeSearchListHost";
const SCROLL_CLASS: &str = "DesktopGoNativeSearchListScroll";
const SCROLLBAR_WIDTH: i32 = 12;
const MIN_THUMB_HEIGHT: i32 = 44;
const LIST_SUBCLASS_ID: usize = 0xD35C_0001;

static HOST_CLASS_WIDE: Lazy<Vec<u16>> = Lazy::new(|| wide(HOST_CLASS));
static SCROLL_CLASS_WIDE: Lazy<Vec<u16>> = Lazy::new(|| wide(SCROLL_CLASS));
static WINDOW_CLASSES_REGISTERED: OnceCell<()> = OnceCell::new();

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct NativeSearchEvent {
    index: i32,
    item: crate::everything::SearchHit,
}

#[derive(Clone, Copy)]
struct ScrollDrag {
    pointer_y: i32,
    top_index: i32,
}

pub(super) struct HostContext {
    app: tauri::AppHandle,
    model: Arc<Mutex<NativeSearchModel>>,
    list: HWND,
    scrollbar: HWND,
    spacer_images: windows::Win32::UI::Controls::HIMAGELIST,
    name_font: HFONT,
    detail_font: HFONT,
    row_height: i32,
    scale_factor: f64,
    scroll_drag: Option<ScrollDrag>,
}

impl HostContext {
    pub(super) fn scale(&self, value: i32) -> i32 {
        (value as f64 * self.scale_factor).round().max(1.0) as i32
    }
}

fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

fn hwnd(raw: isize) -> HWND {
    HWND(raw as *mut c_void)
}

unsafe fn context_from_window(window: HWND) -> Option<&'static mut HostContext> {
    let pointer = GetWindowLongPtrW(window, GWLP_USERDATA) as *mut HostContext;
    pointer.as_mut()
}

unsafe fn assign_context(window: HWND, lparam: LPARAM) -> bool {
    let create = &*(lparam.0 as *const CREATESTRUCTW);
    let pointer = create.lpCreateParams as *mut HostContext;
    if pointer.is_null() {
        return false;
    }
    SetWindowLongPtrW(window, GWLP_USERDATA, pointer as isize);
    true
}

fn register_window_classes() -> Result<(), String> {
    WINDOW_CLASSES_REGISTERED
        .get_or_try_init(|| {
            let module = unsafe { GetModuleHandleW(None) }
                .map_err(|error| format!("GetModuleHandleW failed: {error}"))?;
            for (name, procedure) in [
                (HOST_CLASS_WIDE.as_slice(), host::window_proc as _),
                (SCROLL_CLASS_WIDE.as_slice(), scrollbar::window_proc as _),
            ] {
                let class = WNDCLASSW {
                    lpfnWndProc: Some(procedure),
                    hInstance: HINSTANCE(module.0),
                    lpszClassName: PCWSTR(name.as_ptr()),
                    ..Default::default()
                };
                if unsafe { RegisterClassW(&class) } == 0 {
                    let code = unsafe { GetLastError() }.0;
                    if code != 1410 {
                        return Err(format!("RegisterClassW failed with code {code}"));
                    }
                }
            }
            Ok(())
        })
        .map(|_| ())
}

fn create_font(height: i32, weight: i32) -> HFONT {
    unsafe {
        CreateFontW(
            -height,
            0,
            0,
            0,
            weight,
            0,
            0,
            0,
            DEFAULT_CHARSET,
            FONT_OUTPUT_PRECISION::default(),
            FONT_CLIP_PRECISION::default(),
            CLEARTYPE_QUALITY,
            DEFAULT_PITCH.0 as u32 | FF_DONTCARE.0 as u32,
            w!("Segoe UI"),
        )
    }
}

unsafe fn create_host(
    parent: HWND,
    app: tauri::AppHandle,
    model: Arc<Mutex<NativeSearchModel>>,
    scale_factor: f64,
) -> Result<HWND, String> {
    register_window_classes()?;
    InitCommonControls();
    let module = GetModuleHandleW(None).map_err(|error| error.to_string())?;
    let row_height = (60.0 * scale_factor).round() as i32;
    let spacer_images = ImageList_Create(1, row_height, ILC_COLOR32, 1, 1);
    let _ = ImageList_SetImageCount(spacer_images, 1);
    let context = Box::new(HostContext {
        app,
        model,
        list: HWND::default(),
        scrollbar: HWND::default(),
        spacer_images,
        name_font: create_font((14.0 * scale_factor).round() as i32, 500),
        detail_font: create_font((12.0 * scale_factor).round() as i32, 400),
        row_height,
        scale_factor,
        scroll_drag: None,
    });
    let context_pointer = Box::into_raw(context);
    let host = CreateWindowExW(
        WINDOW_EX_STYLE::default(),
        PCWSTR(HOST_CLASS_WIDE.as_ptr()),
        PCWSTR::null(),
        WS_CHILD | WS_CLIPCHILDREN | WS_CLIPSIBLINGS,
        0,
        0,
        1,
        1,
        Some(parent),
        None,
        Some(HINSTANCE(module.0)),
        Some(context_pointer.cast()),
    )
    .map_err(|error| format!("Failed to create native search host: {error}"))?;

    let list_style = WINDOW_STYLE(
        WS_CHILD.0
            | WS_VISIBLE.0
            | WS_CLIPSIBLINGS.0
            | LVS_REPORT
            | LVS_OWNERDATA
            | LVS_NOCOLUMNHEADER
            | LVS_SINGLESEL
            | LVS_SHOWSELALWAYS,
    );
    let list = match CreateWindowExW(
        WINDOW_EX_STYLE::default(),
        w!("SysListView32"),
        PCWSTR::null(),
        list_style,
        0,
        0,
        1,
        1,
        Some(host),
        None,
        Some(HINSTANCE(module.0)),
        None,
    ) {
        Ok(list) => list,
        Err(error) => {
            let _ = DestroyWindow(host);
            return Err(format!("Failed to create native search list: {error}"));
        }
    };
    let scrollbar = match CreateWindowExW(
        WINDOW_EX_STYLE::default(),
        PCWSTR(SCROLL_CLASS_WIDE.as_ptr()),
        PCWSTR::null(),
        WS_CHILD | WS_VISIBLE | WS_CLIPSIBLINGS,
        0,
        0,
        1,
        1,
        Some(host),
        None,
        Some(HINSTANCE(module.0)),
        Some(context_pointer.cast()),
    ) {
        Ok(scrollbar) => scrollbar,
        Err(error) => {
            let _ = DestroyWindow(host);
            return Err(format!("Failed to create native search scrollbar: {error}"));
        }
    };

    (*context_pointer).list = list;
    (*context_pointer).scrollbar = scrollbar;
    let mut column = LVCOLUMNW {
        mask: LVCF_WIDTH,
        cx: 1,
        pszText: PWSTR::null(),
        ..Default::default()
    };
    SendMessageW(
        list,
        LVM_INSERTCOLUMNW,
        Some(WPARAM(0)),
        Some(LPARAM((&mut column as *mut LVCOLUMNW) as isize)),
    );
    SendMessageW(
        list,
        LVM_SETIMAGELIST,
        Some(WPARAM(LVSIL_SMALL as usize)),
        Some(LPARAM((*context_pointer).spacer_images.0)),
    );
    SendMessageW(
        list,
        LVM_SETEXTENDEDLISTVIEWSTYLE,
        Some(WPARAM(0)),
        Some(LPARAM(
            (LVS_EX_DOUBLEBUFFER | LVS_EX_FULLROWSELECT) as isize,
        )),
    );
    let _ = SetWindowSubclass(
        list,
        Some(scrollbar::list_subclass_proc),
        LIST_SUBCLASS_ID,
        context_pointer as usize,
    );
    Ok(host)
}

fn row_count(context: &HostContext) -> i32 {
    context
        .model
        .lock()
        .map(|model| model.rows.len().min(i32::MAX as usize) as i32)
        .unwrap_or(0)
}

unsafe fn layout_children(host: HWND, context: &HostContext) {
    let mut rect = RECT::default();
    if GetClientRect(host, &mut rect).is_err() {
        return;
    }
    let width = rect.right.max(1);
    let height = rect.bottom.max(1);
    let system_scrollbar_width = GetSystemMetrics(SM_CXVSCROLL).max(1);
    let (content_width, scrollbar_width) = layout::resolve_list_layout(
        width,
        system_scrollbar_width,
        context.scale(SCROLLBAR_WIDTH),
    );
    let _ = MoveWindow(context.list, 0, 0, width, height, true);
    let _ = SetWindowPos(
        context.scrollbar,
        Some(HWND_TOP),
        content_width,
        0,
        scrollbar_width,
        height,
        SWP_NOACTIVATE,
    );
    SendMessageW(
        context.list,
        LVM_SETCOLUMNWIDTH,
        Some(WPARAM(0)),
        Some(LPARAM(content_width as isize)),
    );
}

unsafe fn update_list(context: &HostContext) {
    let background = paint::palette_background(context).0 as isize;
    SendMessageW(
        context.list,
        LVM_SETBKCOLOR,
        Some(WPARAM(0)),
        Some(LPARAM(background)),
    );
    SendMessageW(
        context.list,
        LVM_SETTEXTBKCOLOR,
        Some(WPARAM(0)),
        Some(LPARAM(background)),
    );
    SendMessageW(
        context.list,
        LVM_SETITEMCOUNT,
        Some(WPARAM(row_count(context) as usize)),
        Some(LPARAM(0)),
    );
    let _ = InvalidateRect(Some(context.list), None, true);
    let _ = InvalidateRect(Some(context.scrollbar), None, true);
}

async fn dispatch_main_thread<T: Send + 'static>(
    window: &tauri::WebviewWindow,
    task: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    let (sender, receiver) = mpsc::sync_channel(1);
    window
        .run_on_main_thread(move || {
            let _ = sender.send(task());
        })
        .map_err(|error| format!("Failed to dispatch native search operation: {error}"))?;
    tauri::async_runtime::spawn_blocking(move || {
        receiver
            .recv()
            .map_err(|_| "Native search operation did not return".to_string())?
    })
    .await
    .map_err(|error| format!("Failed to join native search operation: {error}"))?
}

pub(super) async fn show(
    window: tauri::WebviewWindow,
    state: &NativeSearchListState,
    bounds: NativeSearchBounds,
    palette: NativeSearchPalette,
) -> Result<(), String> {
    let scale_factor = window.scale_factor().unwrap_or(1.0);
    if let Ok(mut model) = state.model.lock() {
        model.palette = palette;
        model.scale_factor = scale_factor;
    }
    let parent = window.hwnd().map_err(|error| error.to_string())?.0 as isize;
    let app = window.app_handle().clone();
    let model = Arc::clone(&state.model);
    let existing = state.host()?;
    let x = (bounds.x * scale_factor).round() as i32;
    let y = (bounds.y * scale_factor).round() as i32;
    let width = (bounds.width * scale_factor).round().max(1.0) as i32;
    let height = (bounds.height * scale_factor).round().max(1.0) as i32;
    let host_raw = dispatch_main_thread(&window, move || unsafe {
        let host = if existing == 0 || !IsWindow(Some(hwnd(existing))).as_bool() {
            create_host(hwnd(parent), app, model, scale_factor)?
        } else {
            hwnd(existing)
        };
        let context = context_from_window(host)
            .ok_or_else(|| "Native search host has no context".to_string())?;
        let _ = SetWindowPos(
            host,
            Some(HWND_TOP),
            x,
            y,
            width,
            height,
            SWP_NOACTIVATE | SWP_SHOWWINDOW,
        );
        layout_children(host, context);
        update_list(context);
        Ok(host.0 as isize)
    })
    .await?;
    state.set_host(host_raw)
}

pub(super) async fn hide(
    window: tauri::WebviewWindow,
    state: &NativeSearchListState,
) -> Result<(), String> {
    let host = state.host()?;
    if host == 0 {
        return Ok(());
    }
    dispatch_main_thread(&window, move || unsafe {
        let _ = ShowWindow(hwnd(host), SW_HIDE);
        Ok(())
    })
    .await
}

pub(super) async fn select(
    window: tauri::WebviewWindow,
    state: &NativeSearchListState,
    index: i32,
) -> Result<(), String> {
    let host = state.host()?;
    if host == 0 {
        return Ok(());
    }
    dispatch_main_thread(&window, move || unsafe {
        let context = context_from_window(hwnd(host))
            .ok_or_else(|| "Native search host has no context".to_string())?;
        let count = row_count(context);
        let selected = if index >= 0 && index < count {
            index
        } else {
            -1
        };
        if let Ok(mut model) = context.model.lock() {
            model.selected = selected;
        }
        let mut clear = LVITEMW {
            stateMask: LVIS_SELECTED,
            state: Default::default(),
            mask: LVIF_STATE,
            ..Default::default()
        };
        SendMessageW(
            context.list,
            LVM_SETITEMSTATE,
            Some(WPARAM(usize::MAX)),
            Some(LPARAM((&mut clear as *mut LVITEMW) as isize)),
        );
        if selected >= 0 {
            let mut item = LVITEMW {
                stateMask: LVIS_SELECTED,
                state: LVIS_SELECTED,
                mask: LVIF_STATE,
                ..Default::default()
            };
            SendMessageW(
                context.list,
                LVM_SETITEMSTATE,
                Some(WPARAM(selected as usize)),
                Some(LPARAM((&mut item as *mut LVITEMW) as isize)),
            );
            SendMessageW(
                context.list,
                LVM_ENSUREVISIBLE,
                Some(WPARAM(selected as usize)),
                Some(LPARAM(0)),
            );
        }
        let _ = InvalidateRect(Some(context.list), None, false);
        let _ = InvalidateRect(Some(context.scrollbar), None, true);
        Ok(())
    })
    .await
}

#[allow(dead_code)]
pub(super) async fn destroy(
    window: tauri::WebviewWindow,
    state: &NativeSearchListState,
) -> Result<(), String> {
    let host = state.host()?;
    if host == 0 {
        return Ok(());
    }
    dispatch_main_thread(&window, move || unsafe {
        DestroyWindow(hwnd(host)).map_err(|error| error.to_string())
    })
    .await?;
    state.set_host(0)
}
