use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
use windows::Win32::Graphics::Gdi::{
    BeginPaint, CreatePen, CreateSolidBrush, DeleteObject, EndPaint, FillRect, InvalidateRect,
    RoundRect, SelectObject, HGDIOBJ, PAINTSTRUCT, PS_SOLID,
};
use windows::Win32::UI::Controls::{LVHITTESTINFO, LVM_GETTOPINDEX, LVM_HITTEST, LVM_SCROLL};
use windows::Win32::UI::Input::KeyboardAndMouse::{ReleaseCapture, SetCapture};
use windows::Win32::UI::Shell::DefSubclassProc;
use windows::Win32::UI::WindowsAndMessaging::{
    DefWindowProcW, GetClientRect, SendMessageW, WM_ERASEBKGND, WM_KEYDOWN, WM_LBUTTONDOWN,
    WM_LBUTTONUP, WM_MOUSEMOVE, WM_MOUSEWHEEL, WM_NCCREATE, WM_PAINT, WM_VSCROLL,
};

use super::{
    assign_context, context_from_window, row_count, HostContext, ScrollDrag, MIN_THUMB_HEIGHT,
};

fn thumb(context: &HostContext, height: i32) -> Option<(i32, i32, i32)> {
    let count = row_count(context);
    let page = (height / context.row_height).max(1);
    if count <= page {
        return None;
    }
    let margin = context.scale(3);
    let track = (height - margin * 2).max(1);
    let thumb_height = ((track as i64 * page as i64) / count as i64)
        .max(context.scale(MIN_THUMB_HEIGHT) as i64)
        .min(track as i64) as i32;
    let top_index = unsafe { SendMessageW(context.list, LVM_GETTOPINDEX, None, None).0 as i32 };
    let max_top = (count - page).max(1);
    let thumb_top =
        margin + ((track - thumb_height) as i64 * top_index as i64 / max_top as i64) as i32;
    Some((thumb_top, thumb_height, max_top))
}

unsafe fn paint(window: HWND, context: &HostContext) {
    let mut paint = PAINTSTRUCT::default();
    let dc = BeginPaint(window, &mut paint);
    let mut rect = RECT::default();
    let _ = GetClientRect(window, &mut rect);
    let background = CreateSolidBrush(super::paint::palette_background(context));
    FillRect(dc, &rect, background);
    let _ = DeleteObject(HGDIOBJ(background.0));

    if let Some((top, height, _)) = thumb(context, rect.bottom) {
        let inset = context.scale(2);
        let color = super::paint::palette_muted(context);
        let brush = CreateSolidBrush(color);
        let pen = CreatePen(PS_SOLID, 1, color);
        let previous_brush = SelectObject(dc, HGDIOBJ(brush.0));
        let previous_pen = SelectObject(dc, HGDIOBJ(pen.0));
        let _ = RoundRect(
            dc,
            inset,
            top,
            rect.right - inset,
            top + height,
            context.scale(8),
            context.scale(8),
        );
        SelectObject(dc, previous_brush);
        SelectObject(dc, previous_pen);
        let _ = DeleteObject(HGDIOBJ(brush.0));
        let _ = DeleteObject(HGDIOBJ(pen.0));
    }
    let _ = EndPaint(window, &paint);
}

unsafe fn scroll_to_top(context: &HostContext, target: i32) {
    let current = SendMessageW(context.list, LVM_GETTOPINDEX, None, None).0 as i32;
    let delta = target
        .saturating_sub(current)
        .saturating_mul(context.row_height);
    if delta != 0 {
        SendMessageW(
            context.list,
            LVM_SCROLL,
            Some(WPARAM(0)),
            Some(LPARAM(delta as isize)),
        );
    }
    let _ = InvalidateRect(Some(context.scrollbar), None, true);
}

unsafe fn pointer_down(window: HWND, context: &mut HostContext, y: i32) {
    let mut rect = RECT::default();
    let _ = GetClientRect(window, &mut rect);
    let Some((thumb_top, thumb_height, max_top)) = thumb(context, rect.bottom) else {
        return;
    };
    if y < thumb_top || y > thumb_top + thumb_height {
        let travel = (rect.bottom - context.scale(6) - thumb_height).max(1);
        let target = ((y - context.scale(3) - thumb_height / 2).clamp(0, travel) as i64
            * max_top as i64
            / travel as i64) as i32;
        scroll_to_top(context, target);
    }
    let top_index = SendMessageW(context.list, LVM_GETTOPINDEX, None, None).0 as i32;
    context.scroll_drag = Some(ScrollDrag {
        pointer_y: y,
        top_index,
    });
    SetCapture(window);
}

unsafe fn pointer_move(window: HWND, context: &HostContext, y: i32) {
    let Some(drag) = context.scroll_drag else {
        return;
    };
    let mut rect = RECT::default();
    let _ = GetClientRect(window, &mut rect);
    let Some((_, thumb_height, max_top)) = thumb(context, rect.bottom) else {
        return;
    };
    let travel = (rect.bottom - context.scale(6) - thumb_height).max(1);
    let delta = ((y - drag.pointer_y) as i64 * max_top as i64 / travel as i64) as i32;
    scroll_to_top(context, (drag.top_index + delta).clamp(0, max_top));
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
    let y = ((lparam.0 >> 16) as i16) as i32;
    match message {
        WM_PAINT => {
            paint(window, context);
            LRESULT(0)
        }
        WM_LBUTTONDOWN => {
            pointer_down(window, context, y);
            LRESULT(0)
        }
        WM_MOUSEMOVE => {
            pointer_move(window, context, y);
            LRESULT(0)
        }
        WM_LBUTTONUP => {
            context.scroll_drag = None;
            let _ = ReleaseCapture();
            LRESULT(0)
        }
        WM_MOUSEWHEEL => {
            let result = SendMessageW(context.list, message, Some(wparam), Some(lparam));
            let _ = InvalidateRect(Some(context.scrollbar), None, true);
            result
        }
        WM_ERASEBKGND => LRESULT(1),
        _ => DefWindowProcW(window, message, wparam, lparam),
    }
}

unsafe fn update_hover(context: &HostContext, lparam: LPARAM) {
    let mut hit = LVHITTESTINFO {
        pt: POINT {
            x: (lparam.0 as i16) as i32,
            y: ((lparam.0 >> 16) as i16) as i32,
        },
        ..Default::default()
    };
    let index = SendMessageW(
        context.list,
        LVM_HITTEST,
        None,
        Some(LPARAM((&mut hit as *mut LVHITTESTINFO) as isize)),
    )
    .0 as i32;
    if let Ok(mut model) = context.model.lock() {
        if model.hovered != index {
            model.hovered = index;
            let _ = InvalidateRect(Some(context.list), None, false);
        }
    }
}

pub(super) unsafe extern "system" fn list_subclass_proc(
    window: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _subclass_id: usize,
    reference: usize,
) -> LRESULT {
    let context = &mut *(reference as *mut HostContext);
    if message == WM_MOUSEMOVE {
        update_hover(context, lparam);
    }
    let result = DefSubclassProc(window, message, wparam, lparam);
    if matches!(
        message,
        WM_MOUSEWHEEL | WM_VSCROLL | WM_KEYDOWN | WM_LBUTTONDOWN | WM_LBUTTONUP
    ) {
        let _ = InvalidateRect(Some(context.scrollbar), None, true);
    }
    result
}
