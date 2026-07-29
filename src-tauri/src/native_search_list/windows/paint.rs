use std::collections::HashMap;
use std::mem::size_of;
use std::sync::Mutex;

use once_cell::sync::Lazy;
use windows::core::PCWSTR;
use windows::Win32::Foundation::{COLORREF, LPARAM, RECT};
use windows::Win32::Graphics::Gdi::{
    CreatePen, CreateSolidBrush, DeleteObject, DrawTextW, FillRect, RoundRect, SelectObject,
    SetBkMode, SetTextColor, DT_END_ELLIPSIS, DT_LEFT, DT_NOPREFIX, DT_SINGLELINE, DT_VCENTER,
    HGDIOBJ, PS_SOLID, TRANSPARENT,
};
use windows::Win32::Storage::FileSystem::{FILE_ATTRIBUTE_DIRECTORY, FILE_ATTRIBUTE_NORMAL};
use windows::Win32::UI::Controls::{
    ImageList_DrawEx, CDDS_ITEMPREPAINT, CDDS_PREPAINT, CDRF_NOTIFYITEMDRAW, CDRF_SKIPDEFAULT,
    CLR_NONE, HIMAGELIST, ILD_TRANSPARENT, NMLVCUSTOMDRAW,
};
use windows::Win32::UI::Shell::{
    SHGetFileInfoW, SHFILEINFOW, SHGFI_LARGEICON, SHGFI_SYSICONINDEX, SHGFI_USEFILEATTRIBUTES,
};

use super::HostContext;

#[derive(Clone, Copy)]
struct ShellIcon {
    image_list: HIMAGELIST,
    index: i32,
}

unsafe impl Send for ShellIcon {}

static SHELL_ICON_CACHE: Lazy<Mutex<HashMap<String, ShellIcon>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

fn colorref(rgb: [u8; 3]) -> COLORREF {
    COLORREF(rgb[0] as u32 | (rgb[1] as u32) << 8 | (rgb[2] as u32) << 16)
}

fn icon_cache_key(path: &str, is_folder: bool) -> String {
    if is_folder {
        return "<folder>".to_string();
    }
    std::path::Path::new(path)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| format!(".{}", value.to_ascii_lowercase()))
        .unwrap_or_else(|| "<file>".to_string())
}

fn resolve_shell_icon(path: &str, is_folder: bool) -> Option<ShellIcon> {
    let key = icon_cache_key(path, is_folder);
    if let Some(icon) = SHELL_ICON_CACHE.lock().ok()?.get(&key).copied() {
        return Some(icon);
    }

    let probe = if is_folder {
        "folder".to_string()
    } else if key.starts_with('.') {
        format!("file{key}")
    } else {
        "file".to_string()
    };
    let wide: Vec<u16> = probe.encode_utf16().chain(std::iter::once(0)).collect();
    let mut info = SHFILEINFOW::default();
    let attributes = if is_folder {
        FILE_ATTRIBUTE_DIRECTORY
    } else {
        FILE_ATTRIBUTE_NORMAL
    };
    let flags = SHGFI_SYSICONINDEX | SHGFI_USEFILEATTRIBUTES | SHGFI_LARGEICON;
    let handle = unsafe {
        SHGetFileInfoW(
            PCWSTR(wide.as_ptr()),
            attributes,
            Some(&mut info),
            size_of::<SHFILEINFOW>() as u32,
            flags,
        )
    };
    if handle == 0 {
        return None;
    }

    let icon = ShellIcon {
        image_list: HIMAGELIST(handle as isize),
        index: info.iIcon,
    };
    if let Ok(mut cache) = SHELL_ICON_CACHE.lock() {
        cache.insert(key, icon);
    }
    Some(icon)
}

unsafe fn paint_background(
    draw: &NMLVCUSTOMDRAW,
    context: &HostContext,
    selected: bool,
    hovered: bool,
) {
    let Ok(model) = context.model.lock() else {
        return;
    };
    let palette = model.palette;
    drop(model);
    let background = CreateSolidBrush(colorref(palette.background));
    FillRect(draw.nmcd.hdc, &draw.nmcd.rc, background);
    let _ = DeleteObject(HGDIOBJ(background.0));

    if !selected && !hovered {
        return;
    }
    let fill = if selected {
        palette.selection
    } else {
        palette.hover
    };
    let brush = CreateSolidBrush(colorref(fill));
    let border = if selected { palette.accent } else { fill };
    let pen = CreatePen(PS_SOLID, context.scale(1), colorref(border));
    let previous_brush = SelectObject(draw.nmcd.hdc, HGDIOBJ(brush.0));
    let previous_pen = SelectObject(draw.nmcd.hdc, HGDIOBJ(pen.0));
    let inset_x = context.scale(7);
    let inset_y = context.scale(4);
    let _ = RoundRect(
        draw.nmcd.hdc,
        draw.nmcd.rc.left + inset_x,
        draw.nmcd.rc.top + inset_y,
        draw.nmcd.rc.right - inset_x,
        draw.nmcd.rc.bottom - inset_y,
        context.scale(7),
        context.scale(7),
    );
    SelectObject(draw.nmcd.hdc, previous_brush);
    SelectObject(draw.nmcd.hdc, previous_pen);
    let _ = DeleteObject(HGDIOBJ(brush.0));
    let _ = DeleteObject(HGDIOBJ(pen.0));
}

unsafe fn paint_row(draw: &NMLVCUSTOMDRAW, context: &HostContext, index: usize) {
    let Ok(model) = context.model.lock() else {
        return;
    };
    if index >= model.rows.len() {
        return;
    }
    let selected = model.selected == index as i32;
    let hovered = model.hovered == index as i32;
    let palette = model.palette;
    drop(model);

    paint_background(draw, context, selected, hovered);
    let Ok(mut model) = context.model.lock() else {
        return;
    };
    let row = &mut model.rows[index];
    let icon_left = draw.nmcd.rc.left + context.scale(12);
    let icon_top = draw.nmcd.rc.top + (context.row_height - context.scale(28)) / 2;
    if let Some(icon) = resolve_shell_icon(&row.item.path, row.item.is_folder) {
        let _ = ImageList_DrawEx(
            icon.image_list,
            icon.index,
            draw.nmcd.hdc,
            icon_left,
            icon_top,
            context.scale(28),
            context.scale(28),
            COLORREF(CLR_NONE as u32),
            COLORREF(CLR_NONE as u32),
            ILD_TRANSPARENT,
        );
    }

    SetBkMode(draw.nmcd.hdc, TRANSPARENT);
    let text_left = icon_left + context.scale(40);
    let text_right = draw.nmcd.rc.right - context.scale(18);
    let flags = DT_LEFT | DT_SINGLELINE | DT_VCENTER | DT_END_ELLIPSIS | DT_NOPREFIX;
    let mut name_rect = RECT {
        left: text_left,
        top: draw.nmcd.rc.top + context.scale(8),
        right: text_right,
        bottom: draw.nmcd.rc.top + context.scale(31),
    };
    let old_font = SelectObject(draw.nmcd.hdc, HGDIOBJ(context.name_font.0));
    SetTextColor(draw.nmcd.hdc, colorref(palette.foreground));
    DrawTextW(draw.nmcd.hdc, &mut row.name, &mut name_rect, flags);

    let mut parent_rect = RECT {
        left: text_left,
        top: draw.nmcd.rc.top + context.scale(30),
        right: text_right,
        bottom: draw.nmcd.rc.bottom - context.scale(7),
    };
    SelectObject(draw.nmcd.hdc, HGDIOBJ(context.detail_font.0));
    SetTextColor(draw.nmcd.hdc, colorref(palette.muted));
    DrawTextW(draw.nmcd.hdc, &mut row.parent, &mut parent_rect, flags);
    SelectObject(draw.nmcd.hdc, old_font);
}

pub(super) unsafe fn handle_custom_draw(lparam: LPARAM, context: &HostContext) -> isize {
    let draw = &*(lparam.0 as *const NMLVCUSTOMDRAW);
    if draw.nmcd.dwDrawStage == CDDS_PREPAINT {
        return CDRF_NOTIFYITEMDRAW as isize;
    }
    if draw.nmcd.dwDrawStage == CDDS_ITEMPREPAINT {
        paint_row(draw, context, draw.nmcd.dwItemSpec);
        return CDRF_SKIPDEFAULT as isize;
    }
    0
}

pub(super) fn palette_background(context: &HostContext) -> COLORREF {
    context
        .model
        .lock()
        .map(|model| colorref(model.palette.background))
        .unwrap_or(COLORREF(0))
}

pub(super) fn palette_muted(context: &HostContext) -> COLORREF {
    context
        .model
        .lock()
        .map(|model| colorref(model.palette.muted))
        .unwrap_or(COLORREF(0))
}
