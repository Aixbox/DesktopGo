use base64::Engine;
use std::path::PathBuf;
use winreg::HKEY;
use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
use winreg::RegKey;

use super::models::ScannedDesktopItem;

#[derive(Clone, Copy)]
struct SpecialDesktopItemDescriptor {
    clsid: &'static str,
    fallback_name: &'static str,
    default_visible: bool,
}

const SPECIAL_DESKTOP_ITEMS: [SpecialDesktopItemDescriptor; 5] = [
    SpecialDesktopItemDescriptor {
        clsid: "645FF040-5081-101B-9F08-00AA002F954E",
        fallback_name: "Recycle Bin",
        default_visible: true,
    },
    SpecialDesktopItemDescriptor {
        clsid: "20D04FE0-3AEA-1069-A2D8-08002B30309D",
        fallback_name: "This PC",
        default_visible: false,
    },
    SpecialDesktopItemDescriptor {
        clsid: "59031A47-3F72-44A7-89C5-5595FE6B30EE",
        fallback_name: "User's Files",
        default_visible: false,
    },
    SpecialDesktopItemDescriptor {
        clsid: "F02C1A0D-BE21-4350-88B0-7367FC96EF3C",
        fallback_name: "Network",
        default_visible: false,
    },
    SpecialDesktopItemDescriptor {
        clsid: "5399E694-6CE5-4D6C-8FCE-1D8870FDCBA0",
        fallback_name: "Control Panel",
        default_visible: false,
    },
];

const DESKTOP_ICON_VISIBILITY_REGISTRY_PATHS: [(&str, HKEY); 4] = [
    (
        "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\HideDesktopIcons\\NewStartPanel",
        HKEY_CURRENT_USER,
    ),
    (
        "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\HideDesktopIcons\\ClassicStartMenu",
        HKEY_CURRENT_USER,
    ),
    (
        "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\HideDesktopIcons\\NewStartPanel",
        HKEY_LOCAL_MACHINE,
    ),
    (
        "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\HideDesktopIcons\\ClassicStartMenu",
        HKEY_LOCAL_MACHINE,
    ),
];

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
fn special_item_shell_path(clsid: &str) -> String {
    format!("::{{{clsid}}}")
}

#[cfg(windows)]
fn special_item_registry_name(clsid: &str) -> String {
    format!("{{{clsid}}}")
}

#[cfg(windows)]
fn special_desktop_item_is_visible(item: SpecialDesktopItemDescriptor) -> bool {
    let value_name = special_item_registry_name(item.clsid);

    for (subkey_path, hive) in DESKTOP_ICON_VISIBILITY_REGISTRY_PATHS {
        let root = RegKey::predef(hive);
        let Ok(subkey) = root.open_subkey(subkey_path) else {
            continue;
        };

        match subkey.get_value::<u32, _>(&value_name) {
            Ok(value) => return value == 0,
            Err(_) => continue,
        }
    }

    item.default_visible
}

#[cfg(windows)]
pub(super) fn is_special_shell_path(path: &str) -> bool {
    let trimmed = path.trim();
    trimmed.starts_with("::{") && trimmed.ends_with('}')
}

#[cfg(windows)]
pub(super) fn collect_special_desktop_items() -> Vec<ScannedDesktopItem> {
    SPECIAL_DESKTOP_ITEMS
        .iter()
        .copied()
        .filter(|item| special_desktop_item_is_visible(*item))
        .map(|item| {
            let shell_path = special_item_shell_path(item.clsid);
            let name = unsafe {
                resolve_special_item_display_name(&shell_path)
                    .unwrap_or_else(|| item.fallback_name.to_string())
            };

            ScannedDesktopItem {
                name,
                path: shell_path.clone(),
                target_path: shell_path,
                item_type: "special".to_string(),
            }
        })
        .collect()
}

#[cfg(windows)]
pub(super) fn extract_special_shell_icon(path: &str, icon_size: i32) -> Option<String> {
    unsafe { extract_shell_item_icon(path, icon_size) }
}

#[cfg(windows)]
pub(super) fn launch_special_shell_path(path: &str) -> Result<(), String> {
    use std::os::windows::process::CommandExt;

    std::process::Command::new("explorer.exe")
        .arg(format!("shell:{path}"))
        .creation_flags(0x08000000)
        .spawn()
        .map_err(|e| format!("Failed to launch special shell item `{path}`: {e}"))?;

    Ok(())
}

#[cfg(windows)]
unsafe fn resolve_special_item_display_name(path: &str) -> Option<String> {
    use windows::Win32::System::Com::CoTaskMemFree;
    use windows::Win32::UI::Shell::SIGDN_NORMALDISPLAY;

    let shell_item = create_shell_item_from_path(path)?;
    let display_name = shell_item.GetDisplayName(SIGDN_NORMALDISPLAY).ok()?;
    if display_name.0.is_null() {
        return None;
    }

    let mut len = 0usize;
    while *display_name.0.add(len) != 0 {
        len += 1;
    }

    let name = String::from_utf16_lossy(std::slice::from_raw_parts(display_name.0, len));
    CoTaskMemFree(Some(display_name.0 as *const _));

    if name.trim().is_empty() {
        None
    } else {
        Some(name)
    }
}

#[cfg(windows)]
unsafe fn create_shell_item_from_path(path: &str) -> Option<windows::Win32::UI::Shell::IShellItem> {
    use windows::core::HSTRING;
    use windows::Win32::System::Com::*;
    use windows::Win32::UI::Shell::*;

    let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
    let path_hstring = HSTRING::from(path);

    SHCreateItemFromParsingName(&path_hstring, None).ok()
}

#[cfg(windows)]
unsafe fn extract_shell_item_icon(path: &str, size: i32) -> Option<String> {
    use windows::core::Interface;
    use windows::Win32::UI::Shell::*;

    let shell_item = create_shell_item_from_path(path)?;
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
    extract_shell_item_icon(path, size)
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
            "special" => {
                if let Some(b64) = extract_special_shell_icon(target_path, icon_size) {
                    return b64;
                }
                if let Some(b64) =
                    extract_special_shell_icon(&item_path.to_string_lossy(), icon_size)
                {
                    return b64;
                }
            }
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

    if is_special_shell_path(path) {
        return launch_special_shell_path(path);
    }

    std::process::Command::new("cmd")
        .args(["/C", "start", "", path])
        .creation_flags(0x08000000)
        .spawn()
        .map_err(|e| format!("Failed to launch: {}", e))?;
    Ok(())
}
