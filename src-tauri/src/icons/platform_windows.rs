use base64::Engine;
use std::path::PathBuf;

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
pub(super) fn is_special_shell_path(path: &str) -> bool {
    let trimmed = path.trim();
    trimmed.starts_with("::{") && trimmed.ends_with('}')
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
pub(super) fn create_shortcut_windows(
    shortcut_path: &PathBuf,
    target_path: &str,
    launch_arguments: &str,
    working_directory: &str,
) -> Result<(), String> {
    use windows::core::Interface;
    use windows::core::PCWSTR;
    use windows::Win32::System::Com::*;
    use windows::Win32::UI::Shell::*;

    let target_trimmed = target_path.trim();
    if target_trimmed.is_empty() {
        return Err("Shortcut target path is empty".to_string());
    }

    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);

        let shell_link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)
            .map_err(|error| format!("Failed to create ShellLink instance: {error}"))?;

        let target_wide: Vec<u16> = target_trimmed
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();
        shell_link
            .SetPath(PCWSTR(target_wide.as_ptr()))
            .map_err(|error| format!("Failed to set shortcut target path: {error}"))?;

        let arguments_trimmed = launch_arguments.trim();
        if !arguments_trimmed.is_empty() {
            let arguments_wide: Vec<u16> = arguments_trimmed
                .encode_utf16()
                .chain(std::iter::once(0))
                .collect();
            shell_link
                .SetArguments(PCWSTR(arguments_wide.as_ptr()))
                .map_err(|error| format!("Failed to set shortcut arguments: {error}"))?;
        }

        let resolved_working_directory = if working_directory.trim().is_empty() {
            PathBuf::from(target_trimmed)
                .parent()
                .and_then(|path| path.to_str())
                .unwrap_or_default()
                .to_string()
        } else {
            working_directory.trim().to_string()
        };
        if !resolved_working_directory.is_empty() {
            let working_dir_wide: Vec<u16> = resolved_working_directory
                .encode_utf16()
                .chain(std::iter::once(0))
                .collect();
            shell_link
                .SetWorkingDirectory(PCWSTR(working_dir_wide.as_ptr()))
                .map_err(|error| format!("Failed to set shortcut working directory: {error}"))?;
        }

        let persist_file: IPersistFile = shell_link
            .cast()
            .map_err(|error| format!("Failed to cast ShellLink to IPersistFile: {error}"))?;
        let shortcut_wide: Vec<u16> = shortcut_path
            .as_os_str()
            .to_string_lossy()
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();
        persist_file
            .Save(PCWSTR(shortcut_wide.as_ptr()), true)
            .map_err(|error| format!("Failed to save shortcut file {:?}: {error}", shortcut_path))
    }
}

#[cfg(windows)]
pub(super) fn update_shortcut_launch_options_windows(
    shortcut_path: &PathBuf,
    launch_arguments: &str,
    working_directory: &str,
) -> Result<(), String> {
    use windows::core::Interface;
    use windows::core::PCWSTR;
    use windows::Win32::System::Com::*;
    use windows::Win32::UI::Shell::*;

    if launch_arguments.trim().is_empty() && working_directory.trim().is_empty() {
        return Ok(());
    }

    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);

        let shell_link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)
            .map_err(|error| format!("Failed to create ShellLink instance: {error}"))?;
        let persist_file: IPersistFile = shell_link
            .cast()
            .map_err(|error| format!("Failed to cast ShellLink to IPersistFile: {error}"))?;
        let shortcut_wide: Vec<u16> = shortcut_path
            .as_os_str()
            .to_string_lossy()
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();
        persist_file
            .Load(PCWSTR(shortcut_wide.as_ptr()), Default::default())
            .map_err(|error| format!("Failed to load shortcut {:?}: {error}", shortcut_path))?;

        let arguments_trimmed = launch_arguments.trim();
        if !arguments_trimmed.is_empty() {
            let arguments_wide: Vec<u16> = arguments_trimmed
                .encode_utf16()
                .chain(std::iter::once(0))
                .collect();
            shell_link
                .SetArguments(PCWSTR(arguments_wide.as_ptr()))
                .map_err(|error| format!("Failed to set shortcut arguments: {error}"))?;
        }

        let working_directory_trimmed = working_directory.trim();
        if !working_directory_trimmed.is_empty() {
            let working_dir_wide: Vec<u16> = working_directory_trimmed
                .encode_utf16()
                .chain(std::iter::once(0))
                .collect();
            shell_link
                .SetWorkingDirectory(PCWSTR(working_dir_wide.as_ptr()))
                .map_err(|error| format!("Failed to set shortcut working directory: {error}"))?;
        }

        persist_file
            .Save(PCWSTR(shortcut_wide.as_ptr()), true)
            .map_err(|error| format!("Failed to update shortcut {:?}: {error}", shortcut_path))
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
