use tauri::Emitter;
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::Graphics::Gdi::{DeleteObject, HGDIOBJ};
use windows::Win32::UI::Controls::{
    ImageList_Destroy, LVIS_SELECTED, LVN_ITEMCHANGED, NMHDR, NMLISTVIEW, NM_CUSTOMDRAW, NM_DBLCLK,
    NM_RCLICK, NM_RETURN,
};
use windows::Win32::UI::WindowsAndMessaging::{
    DefWindowProcW, SetWindowLongPtrW, GWLP_USERDATA, WM_ERASEBKGND, WM_NCCREATE, WM_NCDESTROY,
    WM_NOTIFY, WM_SIZE,
};

use super::{assign_context, context_from_window, layout_children, HostContext, NativeSearchEvent};

fn event_for_index(context: &HostContext, index: i32) -> Option<NativeSearchEvent> {
    let model = context.model.lock().ok()?;
    let row = model.rows.get(index as usize)?;
    Some(NativeSearchEvent {
        index,
        item: row.item.clone(),
    })
}

unsafe fn handle_notify(context: &mut HostContext, lparam: LPARAM) -> LRESULT {
    let header = &*(lparam.0 as *const NMHDR);
    if header.hwndFrom != context.list {
        return LRESULT(0);
    }
    match header.code {
        NM_CUSTOMDRAW => LRESULT(super::paint::handle_custom_draw(lparam, context)),
        LVN_ITEMCHANGED => {
            let notification = &*(lparam.0 as *const NMLISTVIEW);
            if notification.iItem >= 0 && notification.uNewState & LVIS_SELECTED.0 != 0 {
                if let Ok(mut model) = context.model.lock() {
                    model.selected = notification.iItem;
                }
                if let Some(payload) = event_for_index(context, notification.iItem) {
                    let _ = context
                        .app
                        .emit("desktopgo://native-search-select", payload);
                }
            }
            LRESULT(0)
        }
        NM_DBLCLK | NM_RCLICK => {
            let notification = &*(lparam.0 as *const NMLISTVIEW);
            if let Some(payload) = event_for_index(context, notification.iItem) {
                let event = if header.code == NM_DBLCLK {
                    "desktopgo://native-search-activate"
                } else {
                    "desktopgo://native-search-context-menu"
                };
                let _ = context.app.emit(event, payload);
            }
            LRESULT(0)
        }
        NM_RETURN => {
            let selected = context
                .model
                .lock()
                .map(|model| model.selected)
                .unwrap_or(-1);
            if let Some(payload) = event_for_index(context, selected) {
                let _ = context
                    .app
                    .emit("desktopgo://native-search-activate", payload);
            }
            LRESULT(0)
        }
        _ => LRESULT(0),
    }
}

pub(super) unsafe extern "system" fn window_proc(
    window: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if message == WM_NCCREATE && !assign_context(window, lparam) {
        return LRESULT(0);
    }
    let Some(context) = context_from_window(window) else {
        return DefWindowProcW(window, message, wparam, lparam);
    };
    match message {
        WM_SIZE => {
            layout_children(window, context);
            LRESULT(0)
        }
        WM_NOTIFY => handle_notify(context, lparam),
        WM_ERASEBKGND => LRESULT(1),
        WM_NCDESTROY => {
            SetWindowLongPtrW(window, GWLP_USERDATA, 0);
            let pointer = context as *mut HostContext;
            if context.spacer_images.0 != 0 {
                let _ = ImageList_Destroy(Some(context.spacer_images));
            }
            let _ = DeleteObject(HGDIOBJ(context.name_font.0));
            let _ = DeleteObject(HGDIOBJ(context.detail_font.0));
            drop(Box::from_raw(pointer));
            DefWindowProcW(window, message, wparam, lparam)
        }
        _ => DefWindowProcW(window, message, wparam, lparam),
    }
}
