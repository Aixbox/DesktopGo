use base64::Engine;
use std::path::PathBuf;

use super::models::{DesktopIcon, ICON_SOURCE_DESKTOP};
pub(super) fn get_dpi_scale() -> f64 {
    unsafe {
        let hdc = windows::Win32::Graphics::Gdi::GetDC(None);
        let dpi = windows::Win32::Graphics::Gdi::GetDeviceCaps(
            Some(hdc),
            windows::Win32::Graphics::Gdi::LOGPIXELSX,
        );
        windows::Win32::Graphics::Gdi::ReleaseDC(None, hdc);
        dpi as f64 / 96.0
    }
}

#[cfg(windows)]
pub(super) fn get_desktop_dirs() -> Vec<PathBuf> {
    let mut dirs_list = Vec::new();
    if let Some(user_desktop) = dirs::desktop_dir() {
        dirs_list.push(user_desktop);
    }
    let public_desktop = PathBuf::from(r"C:\Users\Public\Desktop");
    if public_desktop.exists() {
        dirs_list.push(public_desktop);
    }
    dirs_list
}

#[cfg(windows)]
pub(super) fn scan_desktop_items(dirs: &[PathBuf]) -> Vec<PathBuf> {
    let mut items = Vec::new();
    for dir in dirs {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if name.starts_with('.') || name.eq_ignore_ascii_case("desktop.ini") {
                        continue;
                    }
                }
                items.push(path);
            }
        }
    }
    items
}

#[cfg(windows)]
pub(super) fn create_recycle_bin_icon(icon_size: i32) -> Option<DesktopIcon> {
    use windows::core::GUID;

    const CLSID_RECYCLE_BIN: GUID = GUID::from_u128(0x645FF040_5081_101B_9F08_00AA002F954E);

    unsafe {
        let _ = windows::Win32::System::Com::CoInitializeEx(
            None,
            windows::Win32::System::Com::COINIT_APARTMENTTHREADED,
        );

        let icon_base64 =
            extract_special_folder_icon(&CLSID_RECYCLE_BIN, icon_size).unwrap_or_default();

        Some(DesktopIcon {
            id: uuid::Uuid::new_v4().to_string(),
            name: "Recycle Bin".to_string(),
            path: "::{645FF040-5081-101B-9F08-00AA002F954E}".to_string(),
            target_path: "::{645FF040-5081-101B-9F08-00AA002F954E}".to_string(),
            icon_base64,
            item_type: "special".to_string(),
            source: ICON_SOURCE_DESKTOP.to_string(),
        })
    }
}

#[cfg(windows)]
unsafe fn extract_special_folder_icon(_clsid: &windows::core::GUID, size: i32) -> Option<String> {
    use windows::core::Interface;
    use windows::core::HSTRING;
    use windows::Win32::System::Com::*;
    use windows::Win32::UI::Shell::*;

    let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);

    let path = "::{645FF040-5081-101B-9F08-00AA002F954E}";
    let path_hstring = HSTRING::from(path);

    let shell_item: IShellItem = SHCreateItemFromParsingName(&path_hstring, None).ok()?;
    let factory: IShellItemImageFactory = shell_item.cast().ok()?;

    let icon_size = windows::Win32::Foundation::SIZE { cx: size, cy: size };
    let hbitmap = factory.GetImage(icon_size, SIIGBF_ICONONLY).ok()?;

    hbitmap_to_base64(hbitmap)
}

#[cfg(windows)]
pub(super) fn resolve_lnk(lnk_path: &PathBuf) -> Option<String> {
    use windows::core::Interface;
    use windows::core::PCWSTR;
    use windows::Win32::System::Com::*;
    use windows::Win32::UI::Shell::*;

    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);

        let shell_link: IShellLinkW =
            CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).ok()?;

        let persist_file: IPersistFile = shell_link.cast().ok()?;
        let wide_path: Vec<u16> = lnk_path
            .to_str()?
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();
        persist_file
            .Load(PCWSTR(wide_path.as_ptr()), Default::default())
            .ok()?;

        let mut target_buf = [0u16; 260];
        shell_link
            .GetPath(&mut target_buf, std::ptr::null_mut(), 0)
            .ok()?;

        let target = String::from_utf16_lossy(&target_buf);
        let target = target.trim_end_matches('\0').to_string();
        if target.is_empty() {
            None
        } else {
            Some(target)
        }
    }
}

#[cfg(windows)]
unsafe fn extract_high_res_icon(path: &str, size: i32) -> Option<String> {
    use windows::core::Interface;
    use windows::core::HSTRING;
    use windows::Win32::System::Com::*;
    use windows::Win32::UI::Shell::*;

    let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);

    let path_hstring = HSTRING::from(path);
    let shell_item: IShellItem = SHCreateItemFromParsingName(&path_hstring, None).ok()?;

    let factory: IShellItemImageFactory = shell_item.cast().ok()?;

    let icon_size = windows::Win32::Foundation::SIZE { cx: size, cy: size };
    let hbitmap = factory.GetImage(icon_size, SIIGBF_ICONONLY).ok()?;

    hbitmap_to_base64(hbitmap)
}

#[cfg(windows)]
unsafe fn hbitmap_to_base64(hbitmap: windows::Win32::Graphics::Gdi::HBITMAP) -> Option<String> {
    use windows::Win32::Graphics::Gdi::*;

    let mut bm = BITMAP::default();
    if GetObjectW(
        hbitmap.into(),
        std::mem::size_of::<BITMAP>() as i32,
        Some(&mut bm as *mut _ as *mut _),
    ) == 0
    {
        return None;
    }

    let width = bm.bmWidth as u32;
    let height = bm.bmHeight as u32;

    let hdc_screen = GetDC(None);
    let hdc_mem = CreateCompatibleDC(Some(hdc_screen));

    let bmi = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width as i32,
            biHeight: -(height as i32),
            biPlanes: 1,
            biBitCount: 32,
            biCompression: 0,
            ..Default::default()
        },
        ..Default::default()
    };

    let mut bits: *mut std::ffi::c_void = std::ptr::null_mut();
    let hbm_dib = CreateDIBSection(Some(hdc_mem), &bmi, DIB_RGB_COLORS, &mut bits, None, 0).ok()?;

    let old_bm = SelectObject(hdc_mem, hbm_dib.into());

    let hdc_src = CreateCompatibleDC(Some(hdc_screen));
    let old_src = SelectObject(hdc_src, hbitmap.into());

    let _ = BitBlt(
        hdc_mem,
        0,
        0,
        width as i32,
        height as i32,
        Some(hdc_src),
        0,
        0,
        SRCCOPY,
    );

    SelectObject(hdc_src, old_src);
    let _ = DeleteDC(hdc_src);

    let pixel_count = (width * height) as usize;
    let slice = std::slice::from_raw_parts(bits as *const u8, pixel_count * 4);

    let mut rgba = vec![0u8; pixel_count * 4];
    for i in 0..pixel_count {
        let o = i * 4;
        rgba[o] = slice[o + 2];
        rgba[o + 1] = slice[o + 1];
        rgba[o + 2] = slice[o];
        rgba[o + 3] = slice[o + 3];
    }

    if rgba.iter().skip(3).step_by(4).all(|&a| a == 0) {
        for i in 0..pixel_count {
            rgba[i * 4 + 3] = 255;
        }
    }

    SelectObject(hdc_mem, old_bm);
    let _ = DeleteObject(hbm_dib.into());
    let _ = DeleteDC(hdc_mem);
    ReleaseDC(None, hdc_screen);

    let mut png_buf = Vec::new();
    {
        use image::ImageEncoder;
        let encoder = image::codecs::png::PngEncoder::new(&mut png_buf);
        encoder
            .write_image(&rgba, width, height, image::ExtendedColorType::Rgba8)
            .ok()?;
    }

    let b64 = base64::engine::general_purpose::STANDARD.encode(&png_buf);
    Some(format!("data:image/png;base64,{}", b64))
}

#[cfg(windows)]
pub(super) fn extract_icon_for_item(
    item_path: &PathBuf,
    target_path: &str,
    item_type: &str,
    icon_size: i32,
) -> String {
    unsafe {
        let _ = windows::Win32::System::Com::CoInitializeEx(
            None,
            windows::Win32::System::Com::COINIT_APARTMENTTHREADED,
        );

        match item_type {
            "shortcut" => {
                if !target_path.is_empty() {
                    if let Some(b64) = extract_high_res_icon(target_path, icon_size) {
                        return b64;
                    }
                }
                if let Some(b64) = extract_high_res_icon(&item_path.to_string_lossy(), icon_size) {
                    return b64;
                }
            }
            "folder" => {
                if let Some(b64) = extract_high_res_icon(&item_path.to_string_lossy(), icon_size) {
                    return b64;
                }
            }
            "executable" | "file" => {
                if let Some(b64) = extract_high_res_icon(&item_path.to_string_lossy(), icon_size) {
                    return b64;
                }
            }
            _ => {}
        }

        String::new()
    }
}

#[cfg(windows)]
pub(super) fn launch_app_windows(path: &str) -> Result<(), String> {
    use std::os::windows::process::CommandExt;

    std::process::Command::new("cmd")
        .args(["/C", "start", "", path])
        .creation_flags(0x08000000)
        .spawn()
        .map_err(|e| format!("Failed to launch: {}", e))?;
    Ok(())
}
