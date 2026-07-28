#[cfg(windows)]
const WINDOWS_RUN_KEY_PATH: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";

#[cfg(all(windows, debug_assertions))]
fn has_debug_target_segment(value: &str) -> bool {
    let normalized = value.trim().to_ascii_lowercase().replace('/', "\\");
    normalized.contains("\\target\\debug\\")
}

#[cfg(windows)]
fn open_windows_run_key() -> Result<winreg::RegKey, String> {
    let hkcu = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER);
    hkcu.create_subkey(WINDOWS_RUN_KEY_PATH)
        .map(|(key, _)| key)
        .map_err(|error| format!("无法打开 Windows 开机启动注册表项：{}", error))
}

#[cfg(windows)]
pub(crate) fn current_launch_command() -> Result<String, String> {
    let executable_path =
        std::env::current_exe().map_err(|error| format!("无法获取当前程序路径：{}", error))?;
    Ok(format!("\"{}\"", executable_path.display()))
}

#[cfg(windows)]
pub fn get_registered_command(value_name: &str) -> Result<Option<String>, String> {
    let run_key = open_windows_run_key()?;
    match run_key.get_value::<String, _>(value_name) {
        Ok(value) => Ok(Some(value)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("无法读取 Windows 开机自启状态：{}", error)),
    }
}

#[cfg(all(windows, not(debug_assertions)))]
pub fn is_enabled(value_name: &str) -> Result<bool, String> {
    Ok(get_registered_command(value_name)?
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false))
}

#[cfg(windows)]
pub fn set_enabled(value_name: &str, enabled: bool) -> Result<(), String> {
    let run_key = open_windows_run_key()?;

    if enabled {
        let launch_command = current_launch_command()?;
        run_key
            .set_value(value_name, &launch_command)
            .map_err(|error| format!("无法写入 Windows 开机自启配置：{}", error))?;
        return Ok(());
    }

    match run_key.delete_value(value_name) {
        Ok(_) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("无法移除 Windows 开机自启配置：{}", error)),
    }
}

#[cfg(not(windows))]
pub fn get_registered_command(_value_name: &str) -> Result<Option<String>, String> {
    Ok(None)
}

#[cfg(not(windows))]
pub fn is_enabled(_value_name: &str) -> Result<bool, String> {
    Ok(false)
}

#[cfg(not(windows))]
pub fn set_enabled(_value_name: &str, _enabled: bool) -> Result<(), String> {
    Ok(())
}

#[cfg(all(windows, debug_assertions))]
pub fn is_debug_launch_command(value: &str) -> bool {
    has_debug_target_segment(value)
}
