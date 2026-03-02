use std::collections::HashSet;
use std::path::PathBuf;
use std::process::{Command, Stdio};

fn candidate_paths() -> Vec<PathBuf> {
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

    let mut seen = HashSet::new();
    candidates
        .into_iter()
        .filter(|path| path.exists() && seen.insert(path.clone()))
        .collect()
}

pub fn try_start_installed_everything() -> Result<bool, String> {
    for exe_path in candidate_paths() {
        let spawn_result = Command::new(&exe_path)
            .arg("-startup")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn();

        match spawn_result {
            Ok(_child) => return Ok(true),
            Err(_) => continue,
        }
    }

    Ok(false)
}
