use std::path::PathBuf;
use std::process::{Command, Stdio};

#[derive(Debug, Clone)]
pub struct InstalledEverything {
    pub exe_path: PathBuf,
    pub version: Option<String>,
}

#[cfg(windows)]
mod windows_impl {
    use super::InstalledEverything;
    use std::path::PathBuf;

    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    const UNINSTALL_PATH: &str = "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall";
    const UNINSTALL_PATH_WOW64: &str =
        "SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall";

    fn parse_display_icon_path(value: &str) -> Option<PathBuf> {
        let trimmed = value.trim().trim_matches('"');
        let path_part = trimmed.split(',').next()?.trim().trim_matches('"');
        if path_part.is_empty() {
            None
        } else {
            Some(PathBuf::from(path_part))
        }
    }

    fn build_candidate_from_install_path(path: &str) -> Option<PathBuf> {
        let trimmed = path.trim().trim_matches('"');
        if trimmed.is_empty() {
            return None;
        }

        let install_path = PathBuf::from(trimmed);
        let exe_path = install_path.join("Everything.exe");
        if exe_path.exists() {
            Some(exe_path)
        } else {
            None
        }
    }

    fn is_everything_display_name(display_name: &str) -> bool {
        let normalized = display_name.trim().to_ascii_lowercase();
        normalized == "everything" || normalized.starts_with("everything ")
    }

    fn detect_from_uninstall_root(root: &RegKey) -> Option<InstalledEverything> {
        for subkey_name in root.enum_keys().flatten() {
            let subkey = match root.open_subkey(&subkey_name) {
                Ok(key) => key,
                Err(_) => continue,
            };

            let display_name = subkey
                .get_value::<String, _>("DisplayName")
                .unwrap_or_default();
            if !is_everything_display_name(&display_name) {
                continue;
            }

            let install_location = subkey
                .get_value::<String, _>("InstallLocation")
                .ok()
                .and_then(|value| build_candidate_from_install_path(&value));
            let display_icon = subkey
                .get_value::<String, _>("DisplayIcon")
                .ok()
                .and_then(|value| parse_display_icon_path(&value))
                .filter(|path| path.exists());

            let exe_path = install_location
                .or(display_icon)
                .or_else(|| standard_paths().into_iter().find(|path| path.exists()))?;
            let version = subkey.get_value::<String, _>("DisplayVersion").ok();

            return Some(InstalledEverything { exe_path, version });
        }

        None
    }

    fn standard_paths() -> Vec<PathBuf> {
        let mut paths = Vec::new();

        if let Ok(program_files) = std::env::var("ProgramFiles") {
            paths.push(
                PathBuf::from(program_files)
                    .join("Everything")
                    .join("Everything.exe"),
            );
        }
        if let Ok(program_files_x86) = std::env::var("ProgramFiles(x86)") {
            paths.push(
                PathBuf::from(program_files_x86)
                    .join("Everything")
                    .join("Everything.exe"),
            );
        }
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            paths.push(
                PathBuf::from(&local_app_data)
                    .join("Programs")
                    .join("Everything")
                    .join("Everything.exe"),
            );
            paths.push(
                PathBuf::from(local_app_data)
                    .join("Everything")
                    .join("Everything.exe"),
            );
        }

        paths
    }

    pub(super) fn detect_installed_everything() -> Option<InstalledEverything> {
        let registry_roots = [
            (HKEY_CURRENT_USER, UNINSTALL_PATH),
            (HKEY_LOCAL_MACHINE, UNINSTALL_PATH),
            (HKEY_LOCAL_MACHINE, UNINSTALL_PATH_WOW64),
        ];

        for (hkey, path) in registry_roots {
            let root = RegKey::predef(hkey);
            if let Ok(uninstall_key) = root.open_subkey(path) {
                if let Some(installation) = detect_from_uninstall_root(&uninstall_key) {
                    return Some(installation);
                }
            }
        }

        standard_paths()
            .into_iter()
            .find(|path| path.exists())
            .map(|exe_path| InstalledEverything {
                exe_path,
                version: None,
            })
    }
}

pub fn detect_installed_everything() -> Result<Option<InstalledEverything>, String> {
    #[cfg(windows)]
    {
        return Ok(windows_impl::detect_installed_everything());
    }

    #[cfg(not(windows))]
    {
        Ok(None)
    }
}

pub fn start_installed_everything(exe_path: &std::path::Path) -> Result<(), String> {
    if !exe_path.exists() {
        return Err(format!(
            "Installed Everything executable not found: {:?}",
            exe_path
        ));
    }

    let workdir = exe_path.parent().ok_or_else(|| {
        format!(
            "Failed to resolve Everything parent directory for {:?}",
            exe_path
        )
    })?;

    let startup_result = Command::new(exe_path)
        .arg("-startup")
        .current_dir(workdir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();

    if startup_result.is_ok() {
        return Ok(());
    }

    Command::new(exe_path)
        .current_dir(workdir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Failed to start installed Everything {:?}: {}", exe_path, e))
}
