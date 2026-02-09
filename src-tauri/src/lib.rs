use base64::Engine;
use serde::Serialize;
use std::path::PathBuf;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri::Manager;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

#[derive(Debug, Clone, Serialize)]
pub struct DesktopIcon {
    pub id: String,
    pub name: String,
    pub path: String,
    pub target_path: String,
    pub icon_base64: String,
}

#[tauri::command]
fn toggle_window(window: tauri::Window) {
    let _ = window.hide();
}

#[tauri::command]
fn get_desktop_icons() -> Vec<DesktopIcon> {
    #[cfg(windows)]
    { get_desktop_icons_windows() }
    #[cfg(not(windows))]
    { Vec::new() }
}

#[tauri::command]
fn launch_app(path: String) -> Result<(), String> {
    #[cfg(windows)]
    { launch_app_windows(&path) }
    #[cfg(not(windows))]
    { Err("Not supported on this platform".to_string()) }
}

// ===== Windows implementations =====

#[cfg(windows)]
fn get_desktop_dirs() -> Vec<PathBuf> {
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
fn scan_lnk_files(dirs: &[PathBuf]) -> Vec<PathBuf> {
    let mut lnk_files = Vec::new();
    for dir in dirs {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) == Some("lnk") {
                    lnk_files.push(path);
                }
            }
        }
    }
    lnk_files
}

#[cfg(windows)]
fn resolve_lnk(lnk_path: &PathBuf) -> Option<String> {
    use windows::core::PCWSTR;
    use windows::Win32::System::Com::*;
    use windows::Win32::UI::Shell::*;
    use windows::core::Interface;

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
        shell_link.GetPath(&mut target_buf, std::ptr::null_mut(), 0).ok()?;

        let target = String::from_utf16_lossy(&target_buf);
        let target = target.trim_end_matches('\0').to_string();
        if target.is_empty() { None } else { Some(target) }
    }
}

// PLACEHOLDER_EXTRACT

#[cfg(windows)]
fn extract_icon_base64(target_path: &str, lnk_path: &PathBuf) -> String {
    use windows::core::PCWSTR;
    use windows::Win32::UI::Shell::*;
    use windows::Win32::UI::WindowsAndMessaging::*;
    use windows::Win32::System::Com::*;

    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);

        // 根据 DPI 选择合适的图标尺寸
        // 基础显示尺寸 56px，考虑 2x DPI 场景，使用 128x128 是最佳平衡点
        // - 1x DPI: 128 缩放到 56，清晰
        // - 2x DPI: 128 对应 64 逻辑像素，显示 56px 时依然清晰
        // - 3x DPI: 可能略有损失，但 256x256 文件太大影响性能
        let icon_size = 128;

        let paths_to_try = [target_path.to_string(), lnk_path.to_string_lossy().to_string()];

        for path in &paths_to_try {
            if path.is_empty() {
                continue;
            }

            // 优先使用 IShellItemImageFactory 获取指定尺寸的高质量图标
            if let Some(b64) = extract_high_res_icon(path, icon_size) {
                return b64;
            }

            // 回退到 ExtractIconEx（通常只能获取 32x32）
            // 然后放大到目标尺寸
            let wide: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
            let mut large_icon = HICON::default();
            let result = ExtractIconExW(PCWSTR(wide.as_ptr()), 0, Some(&mut large_icon), None, 1);
            if result > 0 && !large_icon.is_invalid() {
                if let Some(b64) = hicon_to_base64(large_icon, icon_size) {
                    let _ = DestroyIcon(large_icon);
                    return b64;
                }
                let _ = DestroyIcon(large_icon);
            }
        }
        String::new()
    }
}

#[cfg(windows)]
unsafe fn extract_high_res_icon(path: &str, size: i32) -> Option<String> {
    use windows::core::HSTRING;
    use windows::Win32::UI::Shell::*;
    use windows::Win32::System::Com::*;
    use windows::core::Interface;

    let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);

    let path_hstring = HSTRING::from(path);
    let shell_item: IShellItem = SHCreateItemFromParsingName(&path_hstring, None).ok()?;

    let factory: IShellItemImageFactory = shell_item.cast().ok()?;

    // 使用传入的尺寸参数请求图标
    let icon_size = windows::Win32::Foundation::SIZE { cx: size, cy: size };
    let hbitmap = factory.GetImage(icon_size, SIIGBF_ICONONLY).ok()?;

    // 将 HBITMAP 转换为 Base64
    hbitmap_to_base64(hbitmap)
}

#[cfg(windows)]
unsafe fn hbitmap_to_base64(hbitmap: windows::Win32::Graphics::Gdi::HBITMAP) -> Option<String> {
    use windows::Win32::Graphics::Gdi::*;

    let mut bm = BITMAP::default();
    if GetObjectW(hbitmap.into(), std::mem::size_of::<BITMAP>() as i32, Some(&mut bm as *mut _ as *mut _)) == 0 {
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

    let _ = BitBlt(hdc_mem, 0, 0, width as i32, height as i32, Some(hdc_src), 0, 0, SRCCOPY);

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
        for i in 0..pixel_count { rgba[i * 4 + 3] = 255; }
    }

    SelectObject(hdc_mem, old_bm);
    let _ = DeleteObject(hbm_dib.into());
    let _ = DeleteDC(hdc_mem);
    ReleaseDC(None, hdc_screen);

    let mut png_buf = Vec::new();
    {
        use image::ImageEncoder;
        let encoder = image::codecs::png::PngEncoder::new(&mut png_buf);
        encoder.write_image(&rgba, width, height, image::ExtendedColorType::Rgba8).ok()?;
    }

    let b64 = base64::engine::general_purpose::STANDARD.encode(&png_buf);
    Some(format!("data:image/png;base64,{}", b64))
}

#[cfg(windows)]
unsafe fn hicon_to_base64(hicon: windows::Win32::UI::WindowsAndMessaging::HICON, size: i32) -> Option<String> {
    use windows::Win32::Graphics::Gdi::*;
    use windows::Win32::UI::WindowsAndMessaging::*;

    let mut icon_info = ICONINFO::default();
    if GetIconInfo(hicon, &mut icon_info).is_err() {
        return None;
    }

    let hdc_screen = GetDC(None);
    let hdc_mem = CreateCompatibleDC(Some(hdc_screen));

    let bmi = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: size,
            biHeight: -size,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: 0,
            ..Default::default()
        },
        ..Default::default()
    };

    let mut bits: *mut std::ffi::c_void = std::ptr::null_mut();
    let hbm_dib = CreateDIBSection(
        Some(hdc_mem), &bmi, DIB_RGB_COLORS, &mut bits, None, 0,
    ).ok()?;

    let old_bm = SelectObject(hdc_mem, hbm_dib.into());
    let _ = DrawIconEx(hdc_mem, 0, 0, hicon, size, size, 0, None, DI_NORMAL);

    let pixel_count = (size * size) as usize;
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
        for i in 0..pixel_count { rgba[i * 4 + 3] = 255; }
    }

    SelectObject(hdc_mem, old_bm);
    let _ = DeleteObject(hbm_dib.into());
    let _ = DeleteDC(hdc_mem);
    ReleaseDC(None, hdc_screen);

    if !icon_info.hbmColor.is_invalid() {
        let _ = DeleteObject(icon_info.hbmColor.into());
    }
    if !icon_info.hbmMask.is_invalid() {
        let _ = DeleteObject(icon_info.hbmMask.into());
    }

    let mut png_buf = Vec::new();
    {
        use image::ImageEncoder;
        let encoder = image::codecs::png::PngEncoder::new(&mut png_buf);
        encoder
            .write_image(&rgba, size as u32, size as u32, image::ExtendedColorType::Rgba8)
            .ok()?;
    }

    let b64 = base64::engine::general_purpose::STANDARD.encode(&png_buf);
    Some(format!("data:image/png;base64,{}", b64))
}

// PLACEHOLDER_MAIN_FUNCS

#[cfg(windows)]
fn get_desktop_icons_windows() -> Vec<DesktopIcon> {
    let dirs = get_desktop_dirs();
    let lnk_files = scan_lnk_files(&dirs);
    let mut icons = Vec::new();
    for lnk_path in &lnk_files {
        let name = lnk_path.file_stem().and_then(|s| s.to_str())
            .unwrap_or("Unknown").to_string();
        let target_path = resolve_lnk(lnk_path).unwrap_or_default();
        let icon_base64 = extract_icon_base64(&target_path, lnk_path);
        icons.push(DesktopIcon {
            id: uuid::Uuid::new_v4().to_string(),
            name, path: lnk_path.to_string_lossy().to_string(),
            target_path, icon_base64,
        });
    }
    icons.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    icons
}

#[cfg(windows)]
fn launch_app_windows(path: &str) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    std::process::Command::new("cmd")
        .args(["/C", "start", "", path])
        .creation_flags(0x08000000)
        .spawn()
        .map_err(|e| format!("Failed to launch: {}", e))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            let show_item = MenuItem::with_id(app, "show", "显示启动台", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left, ..
                    } = event {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            // 窗口失去焦点时自动隐藏
            if let Some(window) = app.get_webview_window("main") {
                let window_clone = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::Focused(false) = event {
                        let _ = window_clone.hide();
                    }
                });
            }

            let shortcut = Shortcut::new(Some(Modifiers::CONTROL), Code::Space);
            let handle = app.handle().clone();
            app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, _event| {
                if let Some(w) = handle.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            })?;
            if let Err(e) = app.global_shortcut().register(shortcut) {
                eprintln!("Warning: Failed to register Ctrl+Space: {}", e);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![toggle_window, get_desktop_icons, launch_app])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
