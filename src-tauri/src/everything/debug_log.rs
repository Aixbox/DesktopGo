use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

const DEBUG_LOG_FILE_NAME: &str = "search-debug.log";
const DEBUG_LOG_MAX_BYTES: u64 = 512 * 1024;
const DEBUG_LOG_ROTATION_COUNT: usize = 3;

fn rotate(base_dir: &Path) {
    let log_path = base_dir.join(DEBUG_LOG_FILE_NAME);
    let Ok(metadata) = fs::metadata(&log_path) else {
        return;
    };
    if metadata.len() < DEBUG_LOG_MAX_BYTES {
        return;
    }

    let oldest_backup = base_dir.join(format!(
        "{}.{}",
        DEBUG_LOG_FILE_NAME, DEBUG_LOG_ROTATION_COUNT
    ));
    let _ = fs::remove_file(&oldest_backup);

    for index in (1..DEBUG_LOG_ROTATION_COUNT).rev() {
        let src = base_dir.join(format!("{}.{}", DEBUG_LOG_FILE_NAME, index));
        let dst = base_dir.join(format!("{}.{}", DEBUG_LOG_FILE_NAME, index + 1));
        if src.exists() {
            let _ = fs::remove_file(&dst);
            let _ = fs::rename(&src, &dst);
        }
    }

    let first_backup = base_dir.join(format!("{}.1", DEBUG_LOG_FILE_NAME));
    let _ = fs::remove_file(&first_backup);
    let _ = fs::rename(&log_path, first_backup);
}

pub(super) fn append(app_handle: &tauri::AppHandle, message: impl AsRef<str>) {
    let text = message.as_ref();
    eprintln!("[search-debug] {}", text);

    let base_dir = match crate::storage_profile::app_local_data_dir(app_handle) {
        Ok(path) => path,
        Err(_) => return,
    };
    if fs::create_dir_all(&base_dir).is_err() {
        return;
    }

    rotate(&base_dir);
    let log_path = base_dir.join(DEBUG_LOG_FILE_NAME);
    let Ok(mut file) = OpenOptions::new().create(true).append(true).open(log_path) else {
        return;
    };

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis())
        .unwrap_or_default();
    let _ = writeln!(file, "[{}] {}", timestamp, text);
}
