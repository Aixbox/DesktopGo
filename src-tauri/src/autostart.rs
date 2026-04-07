#[cfg(windows)]
const WINDOWS_RUN_KEY_PATH: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";

#[cfg(windows)]
fn open_windows_run_key() -> Result<winreg::RegKey, String> {
    let hkcu = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER);
    hkcu.create_subkey(WINDOWS_RUN_KEY_PATH)
        .map(|(key, _)| key)
        .map_err(|error| format!("无法打开 Windows 开机启动注册表项：{}", error))
}

#[cfg(windows)]
fn current_launch_command() -> Result<String, String> {
    let executable_path =
        std::env::current_exe().map_err(|error| format!("无法获取当前程序路径：{}", error))?;
    Ok(format!("\"{}\"", executable_path.display()))
}

#[cfg(windows)]
pub fn is_enabled(value_name: &str) -> Result<bool, String> {
    let run_key = open_windows_run_key()?;
    match run_key.get_value::<String, _>(value_name) {
        Ok(value) => Ok(!value.trim().is_empty()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(format!("无法读取 Windows 开机自启状态：{}", error)),
    }
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
pub fn is_enabled(_value_name: &str) -> Result<bool, String> {
    Ok(false)
}

#[cfg(not(windows))]
pub fn set_enabled(_value_name: &str, _enabled: bool) -> Result<(), String> {
    Ok(())
}
