use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
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
const UPSERT_KV_SQL: &str = r#"
INSERT INTO kv_store (key, value, updated_at)
VALUES (?1, ?2, strftime('%s', 'now'))
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at
"#;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutPayloadEntry {
    pub key: String,
    pub payload: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutPayloadValue {
    pub key: String,
    pub payload: Option<String>,
}

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

pub fn get_layout_payloads(
    app_handle: &tauri::AppHandle,
    keys: &[String],
) -> Result<Vec<LayoutPayloadValue>, String> {
    if keys.is_empty() {
        return Ok(Vec::new());
    }

    let conn = open_db(app_handle)?;
    let mut stmt = conn
        .prepare("SELECT value FROM kv_store WHERE key = ?1 LIMIT 1")
        .map_err(|e| format!("Failed to prepare batched layout payload query: {}", e))?;
    let mut seen = HashSet::new();
    let mut values = Vec::with_capacity(keys.len());

    for key in keys {
        let normalized_key = key.trim();
        if normalized_key.is_empty() {
            return Err("Layout key cannot be empty".to_string());
        }
        if !seen.insert(normalized_key.to_string()) {
            continue;
        }

        let payload = stmt
            .query_row([normalized_key], |row| row.get(0))
            .optional()
            .map_err(|e| format!("Failed to read batched layout payload from SQLite: {}", e))?;
        values.push(LayoutPayloadValue {
            key: normalized_key.to_string(),
            payload,
        });
    }

    Ok(values)
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
    conn.execute(UPSERT_KV_SQL, params![normalized_key, payload])
        .map_err(|e| format!("Failed to write layout payload to SQLite: {}", e))?;

    Ok(())
}

pub fn set_layout_payloads(
    app_handle: &tauri::AppHandle,
    entries: &[LayoutPayloadEntry],
) -> Result<(), String> {
    if entries.is_empty() {
        return Ok(());
    }

    let mut conn = open_db(app_handle)?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to begin batched SQLite transaction: {}", e))?;
    {
        let mut stmt = tx
            .prepare(UPSERT_KV_SQL)
            .map_err(|e| format!("Failed to prepare batched SQLite write: {}", e))?;
        for entry in entries {
            let normalized_key = entry.key.trim();
            if normalized_key.is_empty() {
                return Err("Layout key cannot be empty".to_string());
            }
            stmt.execute(params![normalized_key, entry.payload.as_str()])
                .map_err(|e| format!("Failed to write batched layout payload to SQLite: {}", e))?;
        }
    }

    tx.commit()
        .map_err(|e| format!("Failed to commit batched SQLite transaction: {}", e))?;
    Ok(())
}
