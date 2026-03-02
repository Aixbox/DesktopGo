use std::path::PathBuf;
use std::process::{Command, Stdio};

#[derive(Debug, Clone, Default)]
pub struct InstalledProbeResult {
    pub executable_paths: Vec<PathBuf>,
    pub lite_detected: bool,
    pub service_running: bool,
}

#[cfg(windows)]
mod windows_impl {
    use super::*;
    use std::collections::HashSet;
    use std::path::Path;
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    const UNINSTALL_REG_PATHS: &[&str] = &[
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
        r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
    ];

    fn push_existing_path(
        path: PathBuf,
        seen: &mut HashSet<String>,
        out: &mut Vec<PathBuf>,
    ) {
        if !path.exists() {
            return;
        }
        let key = path.to_string_lossy().to_lowercase();
        if seen.insert(key) {
            out.push(path);
        }
    }

    fn parse_candidate_from_value(raw: &str) -> Option<PathBuf> {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            return None;
        }

        let maybe_path = if let Some(rest) = trimmed.strip_prefix('"') {
            rest.split('"').next().unwrap_or("").to_string()
        } else {
            trimmed.split_whitespace().next().unwrap_or("").to_string()
        };

        let normalized = maybe_path.split(',').next().unwrap_or("").trim();
        if normalized.is_empty() {
            None
        } else {
            Some(PathBuf::from(normalized))
        }
    }

    fn collect_from_registry(
        root: &RegKey,
        reg_path: &str,
        seen: &mut HashSet<String>,
        paths: &mut Vec<PathBuf>,
        lite_detected: &mut bool,
    ) {
        let Ok(uninstall_root) = root.open_subkey(reg_path) else {
            return;
        };

        for subkey_name in uninstall_root.enum_keys().flatten() {
            let Ok(entry) = uninstall_root.open_subkey(&subkey_name) else {
                continue;
            };

            let display_name = entry
                .get_value::<String, _>("DisplayName")
                .unwrap_or_default();
            let display_name_lower = display_name.to_lowercase();
            if !display_name_lower.contains("everything") {
                continue;
            }
            if display_name_lower.contains("lite") {
                *lite_detected = true;
            }

            for field in ["InstallLocation", "InstallDir"] {
                if let Ok(value) = entry.get_value::<String, _>(field) {
                    let install_dir = PathBuf::from(value.trim());
                    push_existing_path(install_dir.join("Everything.exe"), seen, paths);
                }
            }

            for field in ["DisplayIcon", "UninstallString"] {
                if let Ok(value) = entry.get_value::<String, _>(field) {
                    if let Some(candidate) = parse_candidate_from_value(&value) {
                        if candidate
                            .file_name()
                            .and_then(|v| v.to_str())
                            .map(|v| v.eq_ignore_ascii_case("Everything.exe"))
                            .unwrap_or(false)
                        {
                            push_existing_path(candidate, seen, paths);
                        }
                    }
                }
            }
        }
    }

    fn push_common_paths(seen: &mut HashSet<String>, paths: &mut Vec<PathBuf>) {
        let mut candidates = Vec::new();

        if let Ok(program_files) = std::env::var("ProgramFiles") {
            candidates.push(
                PathBuf::from(program_files)
                    .join("Everything")
                    .join("Everything.exe"),
            );
        }

        if let Ok(program_files_x86) = std::env::var("ProgramFiles(x86)") {
            candidates.push(
                PathBuf::from(program_files_x86)
                    .join("Everything")
                    .join("Everything.exe"),
            );
        }

        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            candidates.push(
                PathBuf::from(local_app_data)
                    .join("Programs")
                    .join("Everything")
                    .join("Everything.exe"),
            );
        }

        candidates.push(
            PathBuf::from(r"C:\Program Files")
                .join("Everything")
                .join("Everything.exe"),
        );
        candidates.push(
            PathBuf::from(r"C:\Program Files (x86)")
                .join("Everything")
                .join("Everything.exe"),
        );

        for candidate in candidates {
            push_existing_path(candidate, seen, paths);
        }
    }

    fn is_service_running(service_name: &str) -> bool {
        let output = Command::new("sc")
            .args(["query", service_name])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .output();

        let Ok(output) = output else {
            return false;
        };
        if !output.status.success() {
            return false;
        }

        let text = String::from_utf8_lossy(&output.stdout).to_ascii_uppercase();
        text.contains("RUNNING")
    }

    pub(super) fn probe_installed_everything() -> Result<InstalledProbeResult, String> {
        let mut seen = HashSet::new();
        let mut executable_paths = Vec::new();
        let mut lite_detected = false;

        for hive in [RegKey::predef(HKEY_LOCAL_MACHINE), RegKey::predef(HKEY_CURRENT_USER)] {
            for reg_path in UNINSTALL_REG_PATHS {
                collect_from_registry(
                    &hive,
                    reg_path,
                    &mut seen,
                    &mut executable_paths,
                    &mut lite_detected,
                );
            }
        }

        push_common_paths(&mut seen, &mut executable_paths);

        let service_running = ["Everything", "Everything Service", "EverythingService"]
            .into_iter()
            .any(is_service_running);

        Ok(InstalledProbeResult {
            executable_paths,
            lite_detected,
            service_running,
        })
    }

    pub(super) fn try_start_installed_everything(exe_paths: &[PathBuf]) -> Result<bool, String> {
        for exe_path in exe_paths {
            let spawn_result = Command::new(exe_path)
                .arg("-startup")
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn();

            if spawn_result.is_ok() {
                return Ok(true);
            }
        }
        Ok(false)
    }

    pub(super) fn resolve_dll_path(exe_paths: &[PathBuf]) -> Option<PathBuf> {
        for exe_path in exe_paths {
            let Some(parent) = exe_path.parent() else {
                continue;
            };
            for dll_name in ["Everything64.dll", "Everything32.dll", "Everything.dll"] {
                let candidate = parent.join(dll_name);
                if candidate.exists() {
                    return Some(candidate);
                }
            }
        }
        None
    }

    pub(super) fn contains_full_install(exe_paths: &[PathBuf]) -> bool {
        exe_paths.iter().any(|path| {
            path.exists()
                && path
                    .file_name()
                    .and_then(|v| v.to_str())
                    .map(|v| v.eq_ignore_ascii_case("Everything.exe"))
                    .unwrap_or(false)
                && path
                    .parent()
                    .map(Path::to_path_buf)
                    .map(|parent| {
                        parent.join("Everything64.dll").exists()
                            || parent.join("Everything32.dll").exists()
                            || parent.join("Everything.dll").exists()
                    })
                    .unwrap_or(false)
        })
    }
}

#[cfg(windows)]
pub fn probe_installed_everything() -> Result<InstalledProbeResult, String> {
    windows_impl::probe_installed_everything()
}

#[cfg(not(windows))]
pub fn probe_installed_everything() -> Result<InstalledProbeResult, String> {
    Ok(InstalledProbeResult::default())
}

#[cfg(windows)]
pub fn try_start_installed_everything(exe_paths: &[PathBuf]) -> Result<bool, String> {
    windows_impl::try_start_installed_everything(exe_paths)
}

#[cfg(not(windows))]
pub fn try_start_installed_everything(_exe_paths: &[PathBuf]) -> Result<bool, String> {
    Ok(false)
}

#[cfg(windows)]
pub fn resolve_dll_path(exe_paths: &[PathBuf]) -> Option<PathBuf> {
    windows_impl::resolve_dll_path(exe_paths)
}

#[cfg(not(windows))]
pub fn resolve_dll_path(_exe_paths: &[PathBuf]) -> Option<PathBuf> {
    None
}

#[cfg(windows)]
pub fn contains_full_install(exe_paths: &[PathBuf]) -> bool {
    windows_impl::contains_full_install(exe_paths)
}

#[cfg(not(windows))]
pub fn contains_full_install(_exe_paths: &[PathBuf]) -> bool {
    false
}
