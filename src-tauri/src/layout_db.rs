use rusqlite::{params, Connection, OptionalExtension};
use std::path::PathBuf;
use tauri::Manager;

const DB_FILE_NAME: &str = "app_state.db";
const CREATE_KV_TABLE_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS kv_store (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
)
"#;

fn resolve_db_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base_dir = app_handle
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Failed to resolve app local data directory: {}", e))?;

    std::fs::create_dir_all(&base_dir).map_err(|e| {
        format!(
            "Failed to create app local data directory {:?}: {}",
            base_dir, e
        )
    })?;

    Ok(base_dir.join(DB_FILE_NAME))
}

fn open_db(app_handle: &tauri::AppHandle) -> Result<Connection, String> {
    let db_path = resolve_db_path(app_handle)?;
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Failed to open SQLite database {:?}: {}", db_path, e))?;
    conn.execute(CREATE_KV_TABLE_SQL, [])
        .map_err(|e| format!("Failed to initialize SQLite schema: {}", e))?;
    Ok(conn)
}

pub fn get_layout_payload(
    app_handle: &tauri::AppHandle,
    key: &str,
) -> Result<Option<String>, String> {
    let normalized_key = key.trim();
    if normalized_key.is_empty() {
        return Err("Layout key cannot be empty".to_string());
    }

    let conn = open_db(app_handle)?;
    conn.query_row(
        "SELECT value FROM kv_store WHERE key = ?1 LIMIT 1",
        [normalized_key],
        |row| row.get(0),
    )
    .optional()
    .map_err(|e| format!("Failed to read layout payload from SQLite: {}", e))
}

pub fn set_layout_payload(
    app_handle: &tauri::AppHandle,
    key: &str,
    payload: &str,
) -> Result<(), String> {
    let normalized_key = key.trim();
    if normalized_key.is_empty() {
        return Err("Layout key cannot be empty".to_string());
    }

    let conn = open_db(app_handle)?;
    conn.execute(
        r#"
INSERT INTO kv_store (key, value, updated_at)
VALUES (?1, ?2, strftime('%s', 'now'))
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at
"#,
        params![normalized_key, payload],
    )
    .map_err(|e| format!("Failed to write layout payload to SQLite: {}", e))?;

    Ok(())
}
