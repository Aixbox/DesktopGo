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
    pub item_type: String, // "shortcut", "folder", "file", "executable", "special"
}

#[tauri::command]
fn toggle_window(window: tauri::Window) {
    let _ = window.hide();
}

#[tauri::command]
fn set_window_mode(window: tauri::Window, mode: String, width: Option<u32>, height: Option<u32>) {
    if mode == "fullscreen" {
        let _ = window.maximize();
    } else {
        let _ = window.unmaximize();
        if let (Some(w), Some(h)) = (width, height) {
            let _ = window.set_size(tauri::LogicalSize::new(w, h));
            let _ = window.center();
        }
    }
}

#[tauri::command]
fn get_desktop_icons(icon_size: i32) -> Vec<DesktopIcon> {
    #[cfg(windows)]
    { get_desktop_icons_windows(icon_size) }
    #[cfg(not(windows))]
    { let _ = icon_size; Vec::new() }
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
fn get_dpi_scale() -> f64 {
    unsafe {
        let hdc = windows::Win32::Graphics::Gdi::GetDC(None);
        let dpi = windows::Win32::Graphics::Gdi::GetDeviceCaps(Some(hdc), windows::Win32::Graphics::Gdi::LOGPIXELSX);
        windows::Win32::Graphics::Gdi::ReleaseDC(None, hdc);
        dpi as f64 / 96.0
    }
}

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
fn scan_desktop_items(dirs: &[PathBuf]) -> Vec<PathBuf> {
    let mut items = Vec::new();
    for dir in dirs {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                // 跳过隐藏文件和系统文件（如 desktop.ini）
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
fn create_recycle_bin_icon(icon_size: i32) -> Option<DesktopIcon> {
    use windows::core::GUID;

    // 回收站的 CLSID: {645FF040-5081-101B-9F08-00AA002F954E}
    const CLSID_RECYCLE_BIN: GUID = GUID::from_u128(0x645FF040_5081_101B_9F08_00AA002F954E);

    unsafe {
        let _ = windows::Win32::System::Com::CoInitializeEx(None, windows::Win32::System::Com::COINIT_APARTMENTTHREADED);

        let icon_base64 = extract_special_folder_icon(&CLSID_RECYCLE_BIN, icon_size).unwrap_or_default();

        Some(DesktopIcon {
            id: uuid::Uuid::new_v4().to_string(),
            name: "回收站".to_string(),
            path: "::{645FF040-5081-101B-9F08-00AA002F954E}".to_string(), // Shell 命名空间路径
            target_path: "::{645FF040-5081-101B-9F08-00AA002F954E}".to_string(),
            icon_base64,
            item_type: "special".to_string(),
        })
    }
}

#[cfg(windows)]
unsafe fn extract_special_folder_icon(_clsid: &windows::core::GUID, size: i32) -> Option<String> {
    use windows::core::HSTRING;
    use windows::Win32::UI::Shell::*;
    use windows::Win32::System::Com::*;
    use windows::core::Interface;

    let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);

    // 直接使用回收站的 Shell 命名空间路径
    let path = "::{645FF040-5081-101B-9F08-00AA002F954E}";
    let path_hstring = HSTRING::from(path);

    let shell_item: IShellItem = SHCreateItemFromParsingName(&path_hstring, None).ok()?;
    let factory: IShellItemImageFactory = shell_item.cast().ok()?;

    let icon_size = windows::Win32::Foundation::SIZE { cx: size, cy: size };
    let hbitmap = factory.GetImage(icon_size, SIIGBF_ICONONLY).ok()?;

    hbitmap_to_base64(hbitmap)
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
fn get_desktop_icons_windows(icon_size: i32) -> Vec<DesktopIcon> {
    let dirs = get_desktop_dirs();
    let items = scan_desktop_items(&dirs);
    let mut icons = Vec::new();

    // 计算实际请求尺寸：逻辑尺寸 × DPI 缩放
    let actual_size = (icon_size as f64 * get_dpi_scale()) as i32;

    // 添加回收站（特殊系统图标）
    if let Some(recycle_bin) = create_recycle_bin_icon(actual_size) {
        icons.push(recycle_bin);
    }

    for item_path in &items {
        let name = item_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Unknown")
            .to_string();

        let (target_path, item_type) = if item_path.extension().and_then(|e| e.to_str()) == Some("lnk") {
            // 快捷方式
            (resolve_lnk(item_path).unwrap_or_default(), "shortcut".to_string())
        } else if item_path.is_dir() {
            // 文件夹
            (item_path.to_string_lossy().to_string(), "folder".to_string())
        } else if item_path.extension().and_then(|e| e.to_str()) == Some("exe") {
            // 可执行文件
            (item_path.to_string_lossy().to_string(), "executable".to_string())
        } else {
            // 普通文件
            (item_path.to_string_lossy().to_string(), "file".to_string())
        };

        let icon_base64 = extract_icon_for_item(item_path, &target_path, &item_type, actual_size);

        icons.push(DesktopIcon {
            id: uuid::Uuid::new_v4().to_string(),
            name,
            path: item_path.to_string_lossy().to_string(),
            target_path,
            icon_base64,
            item_type,
        });
    }

    icons.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    icons
}

#[cfg(windows)]
fn extract_icon_for_item(item_path: &PathBuf, target_path: &str, item_type: &str, icon_size: i32) -> String {
    unsafe {
        let _ = windows::Win32::System::Com::CoInitializeEx(None, windows::Win32::System::Com::COINIT_APARTMENTTHREADED);

        match item_type {
            "shortcut" => {
                // 快捷方式：优先从目标提取图标
                if !target_path.is_empty() {
                    if let Some(b64) = extract_high_res_icon(target_path, icon_size) {
                        return b64;
                    }
                }
                // 回退到从 .lnk 文件提取
                if let Some(b64) = extract_high_res_icon(&item_path.to_string_lossy(), icon_size) {
                    return b64;
                }
            }
            "folder" => {
                // 文件夹：使用系统文件夹图标
                if let Some(b64) = extract_high_res_icon(&item_path.to_string_lossy(), icon_size) {
                    return b64;
                }
            }
            "executable" | "file" => {
                // 可执行文件或普通文件：从文件本身提取图标
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
fn launch_app_windows(path: &str) -> Result<(), String> {
    use std::os::windows::process::CommandExt;

    // 使用 Windows shell 打开文件/文件夹/快捷方式
    // start 命令可以处理所有类型：.lnk, .exe, 文件夹, 文件等
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
        .invoke_handler(tauri::generate_handler![toggle_window, get_desktop_icons, launch_app, set_window_mode])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
