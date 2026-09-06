use std::path::{Path, PathBuf};

use super::image_data::encode_bgra_png_data_uri_preserving_alpha;
use super::search_icon_plan::is_special_shell_path;
use super::shell_icon_windows::{
    owned_icon_to_data_uri, path_icon_to_data_uri, read_bitmap_pixels,
};

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
pub(super) fn extract_special_shell_icon(path: &str, icon_size: i32) -> Option<String> {
    unsafe { extract_shell_item_icon(path, icon_size) }
}

/// Thumbnail that Windows already holds in its thumbnail cache. `SIIGBF_INCACHEONLY`
/// is what keeps this usable while scrolling: the shell never reads or decodes the
/// file, it either has the picture ready or reports that it does not.
#[cfg(windows)]
pub(super) fn extract_cached_thumbnail(path: &str, icon_size: i32) -> Option<String> {
    use windows::Win32::UI::Shell::{SIIGBF_INCACHEONLY, SIIGBF_THUMBNAILONLY};

    unsafe { extract_shell_item_image(path, icon_size, SIIGBF_THUMBNAILONLY | SIIGBF_INCACHEONLY) }
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
    use windows::Win32::UI::Shell::{SIIGBF_ICONONLY, SIIGBF_SCALEUP};

    // Without SCALEUP, Shell centers an undersized ICO frame in the requested
    // square bitmap. Persisting that bitmap makes the artwork look shrunken in
    // the launchpad even though Windows can scale it to the desktop icon size.
    unsafe { extract_shell_item_image(path, size, SIIGBF_ICONONLY | SIIGBF_SCALEUP) }
        .or_else(|| path_icon_to_data_uri(path, false, size))
}

#[cfg(windows)]
unsafe fn extract_shell_item_image(
    path: &str,
    size: i32,
    flags: windows::Win32::UI::Shell::SIIGBF,
) -> Option<String> {
    use windows::core::Interface;
    use windows::Win32::UI::Shell::*;

    let shell_item = create_shell_item_from_path(path)?;
    let factory: IShellItemImageFactory = shell_item.cast().ok()?;

    let icon_size = windows::Win32::Foundation::SIZE { cx: size, cy: size };
    let hbitmap = factory.GetImage(icon_size, flags).ok()?;
    let data_uri = hbitmap_to_base64(hbitmap);
    let _ = windows::Win32::Graphics::Gdi::DeleteObject(hbitmap.into());
    data_uri
}

#[cfg(windows)]
pub(crate) fn resolve_lnk(lnk_path: &Path) -> Option<String> {
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
    shortcut_path: &Path,
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
    shortcut_path: &Path,
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
fn resolve_lnk_icon_location(lnk_path: &Path) -> Option<(String, i32)> {
    use windows::core::{Interface, PCWSTR};
    use windows::Win32::System::Com::*;
    use windows::Win32::UI::Shell::*;

    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let shell_link: IShellLinkW =
            CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).ok()?;
        let persist_file: IPersistFile = shell_link.cast().ok()?;
        let shortcut_wide: Vec<u16> = lnk_path
            .as_os_str()
            .to_string_lossy()
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();
        persist_file
            .Load(PCWSTR(shortcut_wide.as_ptr()), Default::default())
            .ok()?;

        let mut icon_path = vec![0u16; 32_768];
        let mut icon_index = 0;
        shell_link
            .GetIconLocation(&mut icon_path, &mut icon_index)
            .ok()?;
        let path = String::from_utf16_lossy(&icon_path)
            .trim_end_matches('\0')
            .trim()
            .to_string();
        (!path.is_empty()).then_some((path, icon_index))
    }
}

#[cfg(windows)]
unsafe fn extract_resource_icon(path: &str, icon_index: i32, size: i32) -> Option<String> {
    use windows::core::PCWSTR;
    use windows::Win32::UI::Shell::SHDefExtractIconW;
    use windows::Win32::UI::WindowsAndMessaging::HICON;

    let path_wide: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
    let mut icon = HICON::default();
    unsafe {
        SHDefExtractIconW(
            PCWSTR(path_wide.as_ptr()),
            icon_index,
            0,
            Some(&mut icon),
            None,
            size.max(1) as u32,
        )
    }
    .ok()
    .ok()?;
    unsafe { owned_icon_to_data_uri(icon) }
}

#[cfg(windows)]
fn resolve_url_icon_location(path: &Path) -> Option<(String, i32)> {
    if !crate::icons::url_shortcut::is_url_shortcut(path) {
        return None;
    }
    let info = crate::icons::url_shortcut::read_url_shortcut(path)?;
    let icon_file = info.icon_file.trim().to_string();
    (!icon_file.is_empty()).then_some((icon_file, info.icon_index))
}

#[cfg(windows)]
fn shortcut_icon_lookup_paths(item_path: &Path, target_path: &str) -> Vec<String> {
    let shortcut_path = item_path.to_string_lossy().into_owned();
    let mut paths = vec![shortcut_path.clone()];
    let target_path = target_path.trim();
    if !target_path.is_empty() && !target_path.eq_ignore_ascii_case(&shortcut_path) {
        paths.push(target_path.to_string());
    }
    paths
}

#[cfg(windows)]
fn shortcut_icon_resource_candidates(
    explicit: Option<(String, i32)>,
    target_path: &str,
) -> Vec<(String, i32)> {
    let mut candidates = explicit.into_iter().collect::<Vec<_>>();
    let target_path = target_path.trim();
    let already_has_default_target = candidates
        .iter()
        .any(|(path, index)| *index == 0 && path.eq_ignore_ascii_case(target_path));
    if !target_path.is_empty() && !already_has_default_target {
        candidates.push((target_path.to_string(), 0));
    }
    candidates
}

#[cfg(windows)]
unsafe fn hbitmap_to_base64(hbitmap: windows::Win32::Graphics::Gdi::HBITMAP) -> Option<String> {
    use windows::Win32::Graphics::Gdi::{GetDC, ReleaseDC};

    let device_context = GetDC(None);
    let pixels = read_bitmap_pixels(device_context, hbitmap);
    ReleaseDC(None, device_context);
    let (width, height, bgra) = pixels?;
    encode_bgra_png_data_uri_preserving_alpha(&bgra, width, height)
}

#[cfg(windows)]
pub(super) fn extract_icon_for_item(
    item_path: &Path,
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
                for (path, index) in shortcut_icon_resource_candidates(
                    resolve_lnk_icon_location(item_path)
                        .or_else(|| resolve_url_icon_location(item_path))
                        .or_else(|| resolve_url_icon_location(Path::new(target_path))),
                    target_path,
                ) {
                    if let Some(b64) = extract_resource_icon(&path, index, icon_size) {
                        return b64;
                    }
                }
                let lookup_paths = shortcut_icon_lookup_paths(item_path, target_path);
                for path in lookup_paths {
                    if let Some(b64) = extract_high_res_icon(&path, icon_size) {
                        return b64;
                    }
                }
            }
            "folder" => {
                if let Some(b64) = extract_high_res_icon(&item_path.to_string_lossy(), icon_size) {
                    return b64;
                }
            }
            "executable" => {
                if let Some(b64) = extract_resource_icon(&item_path.to_string_lossy(), 0, icon_size)
                {
                    return b64;
                }
                if let Some(b64) = extract_high_res_icon(&item_path.to_string_lossy(), icon_size) {
                    return b64;
                }
            }
            "file" => {
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

#[cfg(all(test, windows))]
mod tests {
    use std::path::Path;

    use super::{shortcut_icon_lookup_paths, shortcut_icon_resource_candidates};

    #[test]
    fn shortcut_icon_lookup_prefers_the_shortcut_before_its_target() {
        assert_eq!(
            shortcut_icon_lookup_paths(
                Path::new(r"C:\Users\Demo\Desktop\Example.lnk"),
                r"C:\Apps\Example.exe",
            ),
            vec![
                r"C:\Users\Demo\Desktop\Example.lnk".to_string(),
                r"C:\Apps\Example.exe".to_string(),
            ]
        );
    }

    #[test]
    fn shortcut_icon_lookup_does_not_repeat_an_empty_or_identical_target() {
        let shortcut = Path::new(r"C:\Desktop\Example.lnk");
        assert_eq!(
            shortcut_icon_lookup_paths(shortcut, ""),
            vec![r"C:\Desktop\Example.lnk".to_string()]
        );
        assert_eq!(
            shortcut_icon_lookup_paths(shortcut, r"c:\desktop\example.lnk"),
            vec![r"C:\Desktop\Example.lnk".to_string()]
        );
    }

    #[test]
    fn shortcut_resource_lookup_prefers_explicit_icon_then_target_resource() {
        assert_eq!(
            shortcut_icon_resource_candidates(
                Some((r"C:\Icons\custom.ico".to_string(), 2)),
                r"C:\Apps\Example.exe",
            ),
            vec![
                (r"C:\Icons\custom.ico".to_string(), 2),
                (r"C:\Apps\Example.exe".to_string(), 0),
            ]
        );
        assert_eq!(
            shortcut_icon_resource_candidates(None, r"C:\Apps\Example.exe"),
            vec![(r"C:\Apps\Example.exe".to_string(), 0)]
        );
    }
}
