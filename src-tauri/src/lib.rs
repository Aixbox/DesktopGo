use base64::Engine;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
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

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SnapshotIconPaths {
    small: String,
    medium: String,
    large: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SnapshotIconItem {
    id: String,
    key: String,
    name: String,
    path: String,
    target_path: String,
    item_type: String,
    #[serde(default)]
    hidden: bool,
    icons: SnapshotIconPaths,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct IconSnapshot {
    version: u32,
    icons: Vec<SnapshotIconItem>,
}

#[derive(Debug, Clone, Serialize)]
struct IconSyncResult {
    mode: String,
    scanned_count: usize,
    added_count: usize,
    total_count: usize,
}

#[derive(Debug, Clone)]
struct ScannedDesktopItem {
    name: String,
    path: String,
    target_path: String,
    item_type: String,
}

#[derive(Debug, Clone, Copy)]
enum IconBucket {
    Small,
    Medium,
    Large,
}

impl IconBucket {
    fn from_logical_size(icon_size: i32) -> Self {
        if icon_size <= 36 {
            Self::Small
        } else if icon_size <= 56 {
            Self::Medium
        } else {
            Self::Large
        }
    }

    fn folder_name(self) -> &'static str {
        match self {
            Self::Small => "small",
            Self::Medium => "medium",
            Self::Large => "large",
        }
    }

    fn logical_size(self) -> i32 {
        match self {
            Self::Small => 32,
            Self::Medium => 48,
            Self::Large => 72,
        }
    }
}

#[tauri::command]
fn toggle_window(window: tauri::Window) {
    let _ = window.hide();
}

#[tauri::command]
fn set_window_mode(app_handle: tauri::AppHandle, mode: String, width: Option<u32>, height: Option<u32>) {
    if let Some(window) = app_handle.get_webview_window("main") {
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
}

#[tauri::command]
fn get_desktop_icons(app_handle: tauri::AppHandle, icon_size: i32) -> Vec<DesktopIcon> {
    #[cfg(windows)]
    {
        match load_or_init_icons_snapshot_windows(&app_handle, icon_size) {
            Ok(icons) => icons,
            Err(e) => {
                eprintln!("Failed to load icon snapshot: {}", e);
                Vec::new()
            }
        }
    }
    #[cfg(not(windows))]
    {
        let _ = app_handle;
        let _ = icon_size;
        Vec::new()
    }
}

#[tauri::command]
fn sync_new_desktop_icons(app_handle: tauri::AppHandle) -> Result<IconSyncResult, String> {
    #[cfg(windows)]
    {
        sync_new_desktop_icons_windows(&app_handle)
    }
    #[cfg(not(windows))]
    {
        let _ = app_handle;
        Err("Not supported on this platform".to_string())
    }
}

#[tauri::command]
fn sync_full_desktop_icons(app_handle: tauri::AppHandle) -> Result<IconSyncResult, String> {
    #[cfg(windows)]
    {
        sync_full_desktop_icons_windows(&app_handle)
    }
    #[cfg(not(windows))]
    {
        let _ = app_handle;
        Err("Not supported on this platform".to_string())
    }
}

#[tauri::command]
fn hide_desktop_icons(app_handle: tauri::AppHandle, ids: Vec<String>) -> Result<usize, String> {
    #[cfg(windows)]
    {
        hide_desktop_icons_windows(&app_handle, &ids)
    }
    #[cfg(not(windows))]
    {
        let _ = app_handle;
        let _ = ids;
        Err("Not supported on this platform".to_string())
    }
}

#[tauri::command]
fn delete_desktop_icons(app_handle: tauri::AppHandle, ids: Vec<String>) -> Result<usize, String> {
    #[cfg(windows)]
    {
        delete_desktop_icons_windows(&app_handle, &ids)
    }
    #[cfg(not(windows))]
    {
        let _ = app_handle;
        let _ = ids;
        Err("Not supported on this platform".to_string())
    }
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
fn snapshot_base_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    app_handle
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Failed to resolve app local data directory: {}", e))
}

#[cfg(windows)]
fn snapshot_file_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(snapshot_base_dir(app_handle)?.join("icons_snapshot.json"))
}

#[cfg(windows)]
fn read_icon_snapshot(app_handle: &tauri::AppHandle) -> Result<Option<IconSnapshot>, String> {
    let path = snapshot_file_path(app_handle)?;
    if !path.exists() {
        return Ok(None);
    }

    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read icon snapshot file: {}", e))?;
    let snapshot: IconSnapshot = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse icon snapshot JSON: {}", e))?;
    Ok(Some(snapshot))
}

#[cfg(windows)]
fn write_icon_snapshot(app_handle: &tauri::AppHandle, snapshot: &IconSnapshot) -> Result<(), String> {
    let path = snapshot_file_path(app_handle)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create snapshot directory: {}", e))?;
    }

    let json = serde_json::to_string_pretty(snapshot)
        .map_err(|e| format!("Failed to serialize icon snapshot: {}", e))?;
    std::fs::write(path, json).map_err(|e| format!("Failed to write icon snapshot: {}", e))?;
    Ok(())
}

#[cfg(windows)]
fn ensure_icon_cache_dirs(app_handle: &tauri::AppHandle) -> Result<(), String> {
    let base_dir = snapshot_base_dir(app_handle)?;
    for bucket in [IconBucket::Small, IconBucket::Medium, IconBucket::Large] {
        let dir = base_dir.join("icons").join(bucket.folder_name());
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create icon cache directory {:?}: {}", dir, e))?;
    }
    Ok(())
}

#[cfg(windows)]
fn clear_icon_cache_dirs(app_handle: &tauri::AppHandle) -> Result<(), String> {
    let icon_root = snapshot_base_dir(app_handle)?.join("icons");
    if icon_root.exists() {
        std::fs::remove_dir_all(&icon_root)
            .map_err(|e| format!("Failed to clear icon cache directory {:?}: {}", icon_root, e))?;
    }
    ensure_icon_cache_dirs(app_handle)?;
    Ok(())
}

#[cfg(windows)]
fn remove_cached_icon_file(app_handle: &tauri::AppHandle, rel_path: &str) -> Result<(), String> {
    if rel_path.is_empty() {
        return Ok(());
    }

    let abs_path = snapshot_base_dir(app_handle)?.join(rel_path);
    if !abs_path.exists() {
        return Ok(());
    }

    std::fs::remove_file(&abs_path)
        .map_err(|e| format!("Failed to remove icon cache file {:?}: {}", abs_path, e))?;
    Ok(())
}

#[cfg(windows)]
fn icon_file_rel_path(id: &str, bucket: IconBucket) -> String {
    format!("icons/{}/{}.png", bucket.folder_name(), id)
}

#[cfg(windows)]
fn decode_data_uri_png(data_uri: &str) -> Result<Vec<u8>, String> {
    if data_uri.is_empty() {
        return Ok(Vec::new());
    }

    let (_, raw) = data_uri
        .split_once(',')
        .ok_or_else(|| "Invalid data URI for icon data".to_string())?;
    base64::engine::general_purpose::STANDARD
        .decode(raw)
        .map_err(|e| format!("Failed to decode icon base64 data: {}", e))
}

#[cfg(windows)]
fn read_icon_file_as_data_uri(path: &PathBuf) -> String {
    match std::fs::read(path) {
        Ok(data) => format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(data)
        ),
        Err(_) => String::new(),
    }
}

#[cfg(windows)]
fn stable_desktop_item_key(item: &ScannedDesktopItem) -> String {
    format!(
        "{}|{}|{}",
        item.item_type.to_lowercase(),
        item.path.to_lowercase(),
        item.target_path.to_lowercase()
    )
}

#[cfg(windows)]
fn collect_desktop_items() -> Vec<ScannedDesktopItem> {
    let mut items = Vec::new();

    items.push(ScannedDesktopItem {
        name: "回收站".to_string(),
        path: "::{645FF040-5081-101B-9F08-00AA002F954E}".to_string(),
        target_path: "::{645FF040-5081-101B-9F08-00AA002F954E}".to_string(),
        item_type: "special".to_string(),
    });

    let dirs = get_desktop_dirs();
    for item_path in scan_desktop_items(&dirs) {
        let name = item_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Unknown")
            .to_string();

        let (target_path, item_type) =
            if item_path.extension().and_then(|e| e.to_str()) == Some("lnk") {
                (resolve_lnk(&item_path).unwrap_or_default(), "shortcut".to_string())
            } else if item_path.is_dir() {
                (item_path.to_string_lossy().to_string(), "folder".to_string())
            } else if item_path.extension().and_then(|e| e.to_str()) == Some("exe") {
                (
                    item_path.to_string_lossy().to_string(),
                    "executable".to_string(),
                )
            } else {
                (item_path.to_string_lossy().to_string(), "file".to_string())
            };

        items.push(ScannedDesktopItem {
            name,
            path: item_path.to_string_lossy().to_string(),
            target_path,
            item_type,
        });
    }

    items.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    items
}

#[cfg(windows)]
fn extract_icon_for_scanned_item(item: &ScannedDesktopItem, icon_size: i32) -> String {
    if item.item_type == "special" {
        return create_recycle_bin_icon(icon_size)
            .map(|icon| icon.icon_base64)
            .unwrap_or_default();
    }

    let item_path = PathBuf::from(&item.path);
    extract_icon_for_item(&item_path, &item.target_path, &item.item_type, icon_size)
}

#[cfg(windows)]
fn bucket_actual_size(bucket: IconBucket) -> i32 {
    let scaled = (bucket.logical_size() as f64 * get_dpi_scale()).round() as i32;
    scaled.max(bucket.logical_size())
}

#[cfg(windows)]
fn save_scanned_icon_for_bucket(
    app_handle: &tauri::AppHandle,
    item: &ScannedDesktopItem,
    id: &str,
    bucket: IconBucket,
) -> Result<String, String> {
    let icon_data_uri = extract_icon_for_scanned_item(item, bucket_actual_size(bucket));
    if icon_data_uri.is_empty() {
        return Ok(String::new());
    }

    let icon_data = match decode_data_uri_png(&icon_data_uri) {
        Ok(data) => data,
        Err(_) => return Ok(String::new()),
    };

    let rel_path = icon_file_rel_path(id, bucket);
    let abs_path = snapshot_base_dir(app_handle)?.join(&rel_path);
    if let Some(parent) = abs_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create icon cache directory {:?}: {}", parent, e))?;
    }
    std::fs::write(&abs_path, icon_data)
        .map_err(|e| format!("Failed to write icon file {:?}: {}", abs_path, e))?;
    Ok(rel_path)
}

#[cfg(windows)]
fn build_snapshot_item(
    app_handle: &tauri::AppHandle,
    item: &ScannedDesktopItem,
) -> Result<SnapshotIconItem, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let key = stable_desktop_item_key(item);
    let icons = SnapshotIconPaths {
        small: save_scanned_icon_for_bucket(app_handle, item, &id, IconBucket::Small)?,
        medium: save_scanned_icon_for_bucket(app_handle, item, &id, IconBucket::Medium)?,
        large: save_scanned_icon_for_bucket(app_handle, item, &id, IconBucket::Large)?,
    };

    Ok(SnapshotIconItem {
        id,
        key,
        name: item.name.clone(),
        path: item.path.clone(),
        target_path: item.target_path.clone(),
        item_type: item.item_type.clone(),
        hidden: false,
        icons,
    })
}

#[cfg(windows)]
fn snapshot_to_desktop_icons(
    app_handle: &tauri::AppHandle,
    snapshot: &IconSnapshot,
    icon_size: i32,
) -> Vec<DesktopIcon> {
    let bucket = IconBucket::from_logical_size(icon_size);
    let base_dir = match snapshot_base_dir(app_handle) {
        Ok(dir) => dir,
        Err(e) => {
            eprintln!("Failed to resolve icon snapshot directory: {}", e);
            return Vec::new();
        }
    };

    snapshot
        .icons
        .iter()
        .filter(|item| !item.hidden)
        .map(|item| {
            let rel_path = match bucket {
                IconBucket::Small => &item.icons.small,
                IconBucket::Medium => &item.icons.medium,
                IconBucket::Large => &item.icons.large,
            };
            let icon_base64 = if rel_path.is_empty() {
                String::new()
            } else {
                read_icon_file_as_data_uri(&base_dir.join(rel_path))
            };

            DesktopIcon {
                id: item.id.clone(),
                name: item.name.clone(),
                path: item.path.clone(),
                target_path: item.target_path.clone(),
                icon_base64,
                item_type: item.item_type.clone(),
            }
        })
        .collect()
}

#[cfg(windows)]
fn build_full_snapshot(
    app_handle: &tauri::AppHandle,
    scanned_items: &[ScannedDesktopItem],
) -> Result<IconSnapshot, String> {
    ensure_icon_cache_dirs(app_handle)?;
    let mut seen_keys = HashSet::new();
    let mut icons = Vec::new();

    for item in scanned_items {
        let key = stable_desktop_item_key(item);
        if !seen_keys.insert(key) {
            continue;
        }
        icons.push(build_snapshot_item(app_handle, item)?);
    }

    Ok(IconSnapshot { version: 1, icons })
}

#[cfg(windows)]
fn load_or_init_icons_snapshot_windows(
    app_handle: &tauri::AppHandle,
    icon_size: i32,
) -> Result<Vec<DesktopIcon>, String> {
    let snapshot = match read_icon_snapshot(app_handle)? {
        Some(snapshot) => snapshot,
        None => {
            let scanned_items = collect_desktop_items();
            let snapshot = build_full_snapshot(app_handle, &scanned_items)?;
            write_icon_snapshot(app_handle, &snapshot)?;
            snapshot
        }
    };

    Ok(snapshot_to_desktop_icons(app_handle, &snapshot, icon_size))
}

#[cfg(windows)]
fn sync_new_desktop_icons_windows(app_handle: &tauri::AppHandle) -> Result<IconSyncResult, String> {
    ensure_icon_cache_dirs(app_handle)?;
    let mut snapshot = read_icon_snapshot(app_handle)?.unwrap_or(IconSnapshot {
        version: 1,
        icons: Vec::new(),
    });

    let scanned_items = collect_desktop_items();
    let mut known_keys = snapshot
        .icons
        .iter()
        .map(|item| item.key.clone())
        .collect::<HashSet<_>>();

    let mut added_count = 0usize;
    for item in &scanned_items {
        let key = stable_desktop_item_key(item);
        if known_keys.contains(&key) {
            continue;
        }

        let snapshot_item = build_snapshot_item(app_handle, item)?;
        known_keys.insert(snapshot_item.key.clone());
        snapshot.icons.push(snapshot_item);
        added_count += 1;
    }

    write_icon_snapshot(app_handle, &snapshot)?;

    Ok(IconSyncResult {
        mode: "incremental".to_string(),
        scanned_count: scanned_items.len(),
        added_count,
        total_count: snapshot.icons.len(),
    })
}

#[cfg(windows)]
fn sync_full_desktop_icons_windows(app_handle: &tauri::AppHandle) -> Result<IconSyncResult, String> {
    clear_icon_cache_dirs(app_handle)?;
    let scanned_items = collect_desktop_items();
    let snapshot = build_full_snapshot(app_handle, &scanned_items)?;
    let total_count = snapshot.icons.len();
    write_icon_snapshot(app_handle, &snapshot)?;

    Ok(IconSyncResult {
        mode: "full".to_string(),
        scanned_count: scanned_items.len(),
        added_count: total_count,
        total_count,
    })
}

#[cfg(windows)]
fn hide_desktop_icons_windows(app_handle: &tauri::AppHandle, ids: &[String]) -> Result<usize, String> {
    if ids.is_empty() {
        return Ok(0);
    }

    let id_set = ids.iter().cloned().collect::<HashSet<_>>();
    let mut snapshot = match read_icon_snapshot(app_handle)? {
        Some(snapshot) => snapshot,
        None => return Ok(0),
    };

    let mut hidden_count = 0usize;
    for item in &mut snapshot.icons {
        if id_set.contains(&item.id) && !item.hidden {
            item.hidden = true;
            hidden_count += 1;
        }
    }

    write_icon_snapshot(app_handle, &snapshot)?;
    Ok(hidden_count)
}

#[cfg(windows)]
fn delete_desktop_icons_windows(app_handle: &tauri::AppHandle, ids: &[String]) -> Result<usize, String> {
    if ids.is_empty() {
        return Ok(0);
    }

    let id_set = ids.iter().cloned().collect::<HashSet<_>>();
    let mut snapshot = match read_icon_snapshot(app_handle)? {
        Some(snapshot) => snapshot,
        None => return Ok(0),
    };

    let mut removed_items = Vec::new();
    snapshot.icons.retain(|item| {
        if id_set.contains(&item.id) {
            removed_items.push(item.clone());
            false
        } else {
            true
        }
    });

    for item in &removed_items {
        remove_cached_icon_file(app_handle, &item.icons.small)?;
        remove_cached_icon_file(app_handle, &item.icons.medium)?;
        remove_cached_icon_file(app_handle, &item.icons.large)?;
    }

    write_icon_snapshot(app_handle, &snapshot)?;
    Ok(removed_items.len())
}

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
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            let show_item = MenuItem::with_id(app, "show", "显示启动台", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        show_or_create_main_window(app);
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left, ..
                    } = event {
                        let app = tray.app_handle();
                        show_or_create_main_window(app);
                    }
                })
                .build(app)?;

            // 初始窗口绑定失去焦点自动隐藏
            attach_blur_handler(app.handle());

            let shortcut = Shortcut::new(Some(Modifiers::CONTROL), Code::Space);
            let handle = app.handle().clone();
            app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, _event| {
                show_or_create_main_window(&handle);
            })?;
            if let Err(e) = app.global_shortcut().register(shortcut) {
                eprintln!("Warning: Failed to register Ctrl+Space: {}", e);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            toggle_window,
            get_desktop_icons,
            launch_app,
            set_window_mode,
            sync_new_desktop_icons,
            sync_full_desktop_icons,
            hide_desktop_icons,
            delete_desktop_icons
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn show_or_create_main_window(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    } else {
        // 主窗口已关闭，重新创建
        let builder = tauri::WebviewWindowBuilder::new(
            app,
            "main",
            tauri::WebviewUrl::App("index.html".into()),
        )
        .title("DesktopGo")
        .inner_size(1920.0, 1080.0)
        .fullscreen(false)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(true)
        .center();

        match builder.build() {
            Ok(_) => {
                attach_blur_handler(app);
            }
            Err(e) => {
                eprintln!("Failed to create main window: {}", e);
            }
        }
    }
}

fn attach_blur_handler(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let window_clone = window.clone();
        window.on_window_event(move |event| {
            if let tauri::WindowEvent::Focused(false) = event {
                let _ = window_clone.hide();
            }
        });
    }
}
