//! Windows system image list adapter.
//!
//! Everything resolves a list row's icon with `SHGetFileInfoW` +
//! `SHGFI_SYSICONINDEX` and then draws straight out of the shared system image
//! list (`ImageList_DrawEx` is one of its only two comctl32 imports). The
//! expensive part of an icon is therefore never per file: it is per *index* in
//! that shared list. DesktopGo cannot draw into a native list view, so it
//! renders the same index into a PNG once and lets the WebView reuse it.

use std::mem::size_of;

use windows::core::PCWSTR;
use windows::Win32::Graphics::Gdi::{
    DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO, BITMAPINFOHEADER,
    DIB_RGB_COLORS, HBITMAP, HDC,
};
use windows::Win32::Storage::FileSystem::{
    FILE_ATTRIBUTE_DIRECTORY, FILE_ATTRIBUTE_NORMAL, FILE_FLAGS_AND_ATTRIBUTES,
};
use windows::Win32::UI::Controls::{IImageList, ILD_TRANSPARENT};
use windows::Win32::UI::Shell::{
    SHGetFileInfoW, SHGetImageList, SHFILEINFOW, SHGFI_SYSICONINDEX, SHGFI_USEFILEATTRIBUTES,
    SHIL_EXTRALARGE, SHIL_JUMBO, SHIL_LARGE, SHIL_SMALL,
};
use windows::Win32::UI::WindowsAndMessaging::{DestroyIcon, GetIconInfo, HICON, ICONINFO};

use crate::icons::image_data::{bgra_to_rgba, encode_rgba_png_data_uri, is_fully_transparent};

/// Windows publishes one shared image list per icon size. Picking the list that
/// already matches the requested size avoids resampling on our side.
pub(super) fn image_list_id_for_size(icon_size: i32) -> i32 {
    let id = match icon_size {
        size if size <= 16 => SHIL_SMALL,
        size if size <= 32 => SHIL_LARGE,
        size if size <= 48 => SHIL_EXTRALARGE,
        _ => SHIL_JUMBO,
    };
    id as i32
}

/// Resolves the shared system image list slot for a path.
///
/// `use_file_attributes` keeps the call inside the shell's association table:
/// no disk access and no third-party icon handler, which is what makes it cheap
/// enough to run for every visible row and safe for paths that are missing,
/// unreadable or longer than `MAX_PATH`.
pub(super) fn system_icon_index(
    path: &str,
    is_directory: bool,
    use_file_attributes: bool,
) -> Option<i32> {
    let wide_path: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
    let mut info = SHFILEINFOW::default();
    let mut flags = SHGFI_SYSICONINDEX;
    let mut attributes = FILE_FLAGS_AND_ATTRIBUTES(0);
    if use_file_attributes {
        flags |= SHGFI_USEFILEATTRIBUTES;
        attributes = if is_directory {
            FILE_ATTRIBUTE_DIRECTORY
        } else {
            FILE_ATTRIBUTE_NORMAL
        };
    }

    let image_list = unsafe {
        SHGetFileInfoW(
            PCWSTR(wide_path.as_ptr()),
            attributes,
            Some(&mut info),
            size_of::<SHFILEINFOW>() as u32,
            flags,
        )
    };
    if image_list == 0 || info.iIcon < 0 {
        return None;
    }

    Some(info.iIcon)
}

/// Renders one shared image list slot into a PNG data URI.
pub(super) fn icon_index_to_data_uri(icon_index: i32, image_list_id: i32) -> Option<String> {
    let image_list: IImageList = unsafe { SHGetImageList(image_list_id) }.ok()?;
    let icon = unsafe { image_list.GetIcon(icon_index, ILD_TRANSPARENT.0) }.ok()?;
    unsafe { owned_icon_to_data_uri(icon) }
}

/// Converts an owned HICON and releases it after reading its color and mask
/// bitmaps. Resource extraction and the shared image list use the same path so
/// alpha and legacy icon masks behave consistently.
pub(super) unsafe fn owned_icon_to_data_uri(icon: HICON) -> Option<String> {
    if icon.is_invalid() {
        return None;
    }
    let data_uri = unsafe { icon_to_data_uri(icon) };
    unsafe {
        let _ = DestroyIcon(icon);
    }
    data_uri
}

/// Resolves a path through the shared image list used by Windows shell views.
/// This is also the mask-aware fallback for image-factory bitmaps that do not
/// expose a usable alpha channel.
pub(super) fn path_icon_to_data_uri(
    path: &str,
    is_directory: bool,
    icon_size: i32,
) -> Option<String> {
    let icon_index = system_icon_index(path, is_directory, false)
        .or_else(|| system_icon_index(path, is_directory, true))?;
    icon_index_to_data_uri(icon_index, image_list_id_for_size(icon_size))
}

unsafe fn icon_to_data_uri(icon: HICON) -> Option<String> {
    let mut info = ICONINFO::default();
    unsafe { GetIconInfo(icon, &mut info) }.ok()?;

    let device_context = unsafe { GetDC(None) };
    let data_uri = unsafe { icon_bitmaps_to_data_uri(device_context, info.hbmColor, info.hbmMask) };
    unsafe {
        ReleaseDC(None, device_context);
        release_bitmap(info.hbmColor);
        release_bitmap(info.hbmMask);
    }

    data_uri
}

unsafe fn release_bitmap(bitmap: HBITMAP) {
    if !bitmap.is_invalid() {
        unsafe {
            let _ = DeleteObject(bitmap.into());
        }
    }
}

unsafe fn icon_bitmaps_to_data_uri(
    device_context: HDC,
    color: HBITMAP,
    mask: HBITMAP,
) -> Option<String> {
    let (width, height, pixels) = unsafe { read_bitmap_pixels(device_context, color) }?;
    let mut rgba = bgra_to_rgba(&pixels);
    if is_fully_transparent(&rgba) {
        unsafe { apply_mask_alpha(device_context, mask, width, height, &mut rgba) };
    }

    encode_rgba_png_data_uri(&rgba, width, height)
}

/// Legacy 4/8-bit icons carry no alpha channel, so their transparency only
/// exists in the AND mask. Without this the icon would read as a solid block.
unsafe fn apply_mask_alpha(
    device_context: HDC,
    mask: HBITMAP,
    width: u32,
    height: u32,
    rgba: &mut [u8],
) {
    let mask_pixels = unsafe { read_bitmap_pixels(device_context, mask) }
        .filter(|(mask_width, mask_height, _)| *mask_width == width && *mask_height >= height)
        .map(|(_, _, pixels)| pixels);

    for (index, pixel) in rgba.chunks_exact_mut(4).enumerate() {
        let masked_out = mask_pixels
            .as_ref()
            .and_then(|pixels| pixels.get(index * 4))
            .is_some_and(|channel| *channel != 0);
        pixel[3] = if masked_out { 0 } else { 255 };
    }
}

/// Reads a GDI bitmap as top-down 32-bit BGRA.
pub(super) unsafe fn read_bitmap_pixels(
    device_context: HDC,
    bitmap: HBITMAP,
) -> Option<(u32, u32, Vec<u8>)> {
    if bitmap.is_invalid() {
        return None;
    }

    let mut description = BITMAP::default();
    let copied = unsafe {
        GetObjectW(
            bitmap.into(),
            size_of::<BITMAP>() as i32,
            Some(&mut description as *mut _ as *mut _),
        )
    };
    if copied == 0 || description.bmWidth <= 0 || description.bmHeight <= 0 {
        return None;
    }

    let width = description.bmWidth as u32;
    let height = description.bmHeight as u32;
    let mut header = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: description.bmWidth,
            biHeight: -description.bmHeight,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: 0,
            ..Default::default()
        },
        ..Default::default()
    };

    let mut pixels = vec![0u8; (width as usize) * (height as usize) * 4];
    let scanlines = unsafe {
        GetDIBits(
            device_context,
            bitmap,
            0,
            height,
            Some(pixels.as_mut_ptr().cast()),
            &mut header,
            DIB_RGB_COLORS,
        )
    };
    if scanlines == 0 {
        return None;
    }

    Some((width, height, pixels))
}

#[cfg(test)]
mod tests {
    use super::image_list_id_for_size;
    use windows::Win32::UI::Shell::{SHIL_EXTRALARGE, SHIL_JUMBO, SHIL_LARGE, SHIL_SMALL};

    #[test]
    fn maps_requested_sizes_to_the_matching_system_image_list() {
        assert_eq!(image_list_id_for_size(16), SHIL_SMALL as i32);
        assert_eq!(image_list_id_for_size(32), SHIL_LARGE as i32);
        assert_eq!(image_list_id_for_size(48), SHIL_EXTRALARGE as i32);
        assert_eq!(image_list_id_for_size(256), SHIL_JUMBO as i32);
    }

    #[test]
    fn clamps_unusual_sizes_to_the_nearest_usable_list() {
        assert_eq!(image_list_id_for_size(8), SHIL_SMALL as i32);
        assert_eq!(image_list_id_for_size(24), SHIL_LARGE as i32);
        assert_eq!(image_list_id_for_size(64), SHIL_JUMBO as i32);
    }
}
