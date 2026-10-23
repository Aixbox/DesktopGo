//! 布局版本库：布局快照（历史）与用户命名保存的布局。
//!
//! 快照的 payload 与 `kv_store` 里的当前布局同构（`PersistedLayout` 的 version 9 JSON），
//! 恢复时直接写回 kv 即可，不需要另一套序列化格式。

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::layout_db;

pub(crate) const SCOPE_PAGED: &str = "paged";
pub(crate) const SCOPE_SCROLL: &str = "scroll";
pub(crate) const KIND_AUTO: &str = "auto";
pub(crate) const KIND_SAVED: &str = "saved";

/// 历史快照只留最近这么多条，否则每次拖拽都存一份会把库撑大。
const AUTO_SNAPSHOT_LIMIT: i64 = 50;
/// 用户手动保存的布局上限。
const SAVED_LAYOUT_LIMIT: i64 = 30;
const LAYOUT_NAME_MAX_CHARS: usize = 40;
/// 缩略图最多画几页，列表里再多的页也没有意义。
const THUMBNAIL_PAGE_LIMIT: usize = 3;
/// 缩略图的网格上限，防止畸形 payload 撑出上万个格子。
const THUMBNAIL_AXIS_LIMIT: i64 = 16;

const CREATE_TABLES_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS layout_versions (
  id TEXT PRIMARY KEY NOT NULL,
  scope TEXT NOT NULL,
  kind TEXT NOT NULL,
  name TEXT,
  payload TEXT NOT NULL,
  geometry_key TEXT,
  thumbnail TEXT,
  icon_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_layout_versions_scope
  ON layout_versions(scope, kind, created_at DESC);
"#;

const INSERT_SQL: &str = r#"
INSERT INTO layout_versions (id, scope, kind, name, payload, geometry_key, thumbnail, icon_count)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
"#;

/// 列表里画的缩略图：把布局的槽位摊成每页的占用格子。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutThumbnail {
    pub columns: i64,
    pub rows: i64,
    /// 每页一行 `columns * rows` 的 0/1，1 表示这个格子有图标。
    pub pages: Vec<Vec<u8>>,
    /// 没画出来的页数。
    pub more_pages: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutVersionMeta {
    pub id: String,
    pub scope: String,
    pub kind: String,
    pub name: Option<String>,
    pub icon_count: i64,
    pub geometry_key: Option<String>,
    pub thumbnail: Option<LayoutThumbnail>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutVersionDetail {
    #[serde(flatten)]
    pub meta: LayoutVersionMeta,
    pub payload: String,
}

pub(crate) fn ensure_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(CREATE_TABLES_SQL)
        .map_err(|e| format!("Failed to initialize layout version schema: {}", e))?;
    ensure_thumbnail_column(conn)
}

/// 缩略图是后加的列：老库里补上，不然读列表会整条报错。
fn ensure_thumbnail_column(conn: &Connection) -> Result<(), String> {
    let mut stmt = conn
        .prepare("PRAGMA table_info(layout_versions)")
        .map_err(|e| format!("Failed to inspect the layout version table: {}", e))?;
    let columns = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|e| format!("Failed to read the layout version columns: {}", e))?;
    let mut has_thumbnail = false;
    for column in columns {
        if column.map_err(|e| format!("Failed to read a layout version column: {}", e))?
            == "thumbnail"
        {
            has_thumbnail = true;
            break;
        }
    }
    if has_thumbnail {
        return Ok(());
    }
    conn.execute("ALTER TABLE layout_versions ADD COLUMN thumbnail TEXT", [])
        .map_err(|e| format!("Failed to add the layout version thumbnail column: {}", e))?;
    Ok(())
}

fn normalize_scope(scope: &str) -> Result<&'static str, String> {
    match scope.trim() {
        SCOPE_PAGED => Ok(SCOPE_PAGED),
        SCOPE_SCROLL => Ok(SCOPE_SCROLL),
        other => Err(format!("Unsupported layout scope: {}", other)),
    }
}

fn normalize_kind(kind: &str) -> Result<&'static str, String> {
    match kind.trim() {
        KIND_AUTO => Ok(KIND_AUTO),
        KIND_SAVED => Ok(KIND_SAVED),
        other => Err(format!("Unsupported layout version kind: {}", other)),
    }
}

fn normalize_layout_name(name: Option<&str>) -> Option<String> {
    let trimmed = name?.trim();
    if trimmed.is_empty() {
        return None;
    }
    Some(trimmed.chars().take(LAYOUT_NAME_MAX_CHARS).collect())
}

/// 从布局 payload 里取列表要用的摘要：图标数、几何标识、缩略图。
/// payload 结构由前端保证，这里解析失败就退化成 0 个图标，不影响写入。
fn summarize_payload(payload: &str) -> (i64, Option<String>, Option<LayoutThumbnail>) {
    let parsed: serde_json::Value = serde_json::from_str(payload).unwrap_or_default();
    let icon_count = parsed
        .get("items")
        .and_then(|value| value.as_array())
        .map(|items| items.len() as i64)
        .unwrap_or(0);
    let geometry_key = parsed
        .get("geometryKey")
        .and_then(|value| value.as_str())
        .map(str::to_string);
    (icon_count, geometry_key, build_thumbnail(&parsed))
}

/// 把槽位摊成每页的占用格子。
///
/// slots 为空说明布局是"只保顺序、按当前网格重排"存下来的（几何变更后的应用），
/// 这种情况按 items 顺序铺满，和网格实际渲染的行为对齐。
fn build_thumbnail(payload: &serde_json::Value) -> Option<LayoutThumbnail> {
    let item_count = payload.get("items")?.as_array()?.len();
    let columns = payload.get("columns")?.as_i64()?;
    let page_size = payload.get("pageSize")?.as_i64()?;
    if !(1..=THUMBNAIL_AXIS_LIMIT).contains(&columns) || page_size < columns {
        return None;
    }
    let rows = page_size / columns;
    if !(1..=THUMBNAIL_AXIS_LIMIT).contains(&rows) {
        return None;
    }
    let cells_per_page = (rows * columns) as usize;
    let slot_filled: Vec<bool> = payload
        .get("slots")
        .and_then(|value| value.as_array())
        .map(|slots| slots.iter().map(|slot| slot.is_string()).collect())
        .unwrap_or_default();

    let occupied: Vec<bool> = if slot_filled.iter().any(|filled| *filled) {
        slot_filled
    } else {
        vec![true; item_count]
    };

    let total_cells = occupied.len().max(item_count).max(1);
    let page_total = total_cells.div_ceil(cells_per_page);
    let shown_pages = page_total.min(THUMBNAIL_PAGE_LIMIT);
    let pages = (0..shown_pages)
        .map(|page| {
            (0..cells_per_page)
                .map(|cell| {
                    u8::from(
                        occupied
                            .get(page * cells_per_page + cell)
                            .copied()
                            .unwrap_or(false),
                    )
                })
                .collect()
        })
        .collect();

    Some(LayoutThumbnail {
        columns,
        rows,
        pages,
        more_pages: (page_total - shown_pages) as i64,
    })
}

fn row_to_meta(row: &Row<'_>) -> rusqlite::Result<LayoutVersionMeta> {
    let thumbnail: Option<String> = row.get(6)?;
    Ok(LayoutVersionMeta {
        id: row.get(0)?,
        scope: row.get(1)?,
        kind: row.get(2)?,
        name: row.get(3)?,
        icon_count: row.get(4)?,
        geometry_key: row.get(5)?,
        thumbnail: thumbnail.and_then(|raw| serde_json::from_str::<LayoutThumbnail>(&raw).ok()),
        created_at: row.get(7)?,
    })
}

const META_COLUMNS: &str = "id, scope, kind, name, icon_count, geometry_key, thumbnail, created_at";

fn latest_auto_snapshot_id(
    conn: &Connection,
    scope: &str,
    payload: &str,
) -> Result<Option<LayoutVersionMeta>, String> {
    let query = format!(
        "SELECT {} FROM layout_versions
         WHERE scope = ?1 AND kind = ?2
         ORDER BY created_at DESC, rowid DESC LIMIT 1",
        META_COLUMNS
    );
    let mut stmt = conn
        .prepare(&query)
        .map_err(|e| format!("Failed to prepare layout snapshot lookup: {}", e))?;
    let latest = stmt
        .query_row(params![scope, KIND_AUTO], row_to_meta)
        .optional()
        .map_err(|e| format!("Failed to read the latest layout snapshot: {}", e))?;

    let Some(latest) = latest else {
        return Ok(None);
    };
    let existing_payload: Option<String> = conn
        .query_row(
            "SELECT payload FROM layout_versions WHERE id = ?1 LIMIT 1",
            [latest.id.as_str()],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| format!("Failed to read the latest layout snapshot payload: {}", e))?;

    Ok(match existing_payload {
        Some(existing) if existing == payload => Some(latest),
        _ => None,
    })
}

fn prune_versions(conn: &Connection, scope: &str, kind: &str) -> Result<(), String> {
    let limit = if kind == KIND_SAVED {
        SAVED_LAYOUT_LIMIT
    } else {
        AUTO_SNAPSHOT_LIMIT
    };
    conn.execute(
        "DELETE FROM layout_versions
         WHERE scope = ?1 AND kind = ?2 AND id NOT IN (
           SELECT id FROM layout_versions
           WHERE scope = ?1 AND kind = ?2
           ORDER BY created_at DESC, rowid DESC LIMIT ?3
         )",
        params![scope, kind, limit],
    )
    .map_err(|e| format!("Failed to prune layout versions: {}", e))?;
    Ok(())
}

pub fn list_layout_versions(
    app_handle: &tauri::AppHandle,
    scope: &str,
) -> Result<Vec<LayoutVersionMeta>, String> {
    let scope = normalize_scope(scope)?;
    let conn = layout_db::open_db(app_handle)?;
    let query = format!(
        "SELECT {} FROM layout_versions WHERE scope = ?1
         ORDER BY created_at DESC, rowid DESC",
        META_COLUMNS
    );
    let mut stmt = conn
        .prepare(&query)
        .map_err(|e| format!("Failed to prepare layout version list: {}", e))?;
    let rows = stmt
        .query_map([scope], row_to_meta)
        .map_err(|e| format!("Failed to query layout versions: {}", e))?;

    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| format!("Failed to read layout versions: {}", e))
}

pub fn get_layout_version(
    app_handle: &tauri::AppHandle,
    id: &str,
) -> Result<Option<LayoutVersionDetail>, String> {
    let conn = layout_db::open_db(app_handle)?;
    let query = format!(
        "SELECT {} FROM layout_versions WHERE id = ?1 LIMIT 1",
        META_COLUMNS
    );
    let mut stmt = conn
        .prepare(&query)
        .map_err(|e| format!("Failed to prepare layout version lookup: {}", e))?;
    let meta = stmt
        .query_row([id], row_to_meta)
        .optional()
        .map_err(|e| format!("Failed to read layout version: {}", e))?;
    let Some(meta) = meta else {
        return Ok(None);
    };

    let payload: String = conn
        .query_row(
            "SELECT payload FROM layout_versions WHERE id = ?1 LIMIT 1",
            [id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to read layout version payload: {}", e))?;

    Ok(Some(LayoutVersionDetail { meta, payload }))
}

pub fn save_layout_version(
    app_handle: &tauri::AppHandle,
    scope: &str,
    kind: &str,
    name: Option<&str>,
    payload: &str,
) -> Result<LayoutVersionMeta, String> {
    let scope = normalize_scope(scope)?;
    let kind = normalize_kind(kind)?;
    let payload = payload.trim();
    if payload.is_empty() {
        return Err("Layout payload cannot be empty".to_string());
    }
    let conn = layout_db::open_db(app_handle)?;

    // 快照只关心"布局变没变"：连续写入相同内容不该堆出一串一模一样的版本。
    if kind == KIND_AUTO {
        if let Some(existing) = latest_auto_snapshot_id(&conn, scope, payload)? {
            return Ok(existing);
        }
    }

    let (icon_count, geometry_key, thumbnail) = summarize_payload(payload);
    let thumbnail_json = thumbnail
        .as_ref()
        .map(serde_json::to_string)
        .transpose()
        .map_err(|e| format!("Failed to serialize the layout thumbnail: {}", e))?;
    let id = Uuid::new_v4().to_string();
    let name = normalize_layout_name(name);
    conn.execute(
        INSERT_SQL,
        params![
            id,
            scope,
            kind,
            name,
            payload,
            geometry_key,
            thumbnail_json,
            icon_count
        ],
    )
    .map_err(|e| format!("Failed to save layout version: {}", e))?;
    prune_versions(&conn, scope, kind)?;

    conn.query_row(
        &format!("SELECT {} FROM layout_versions WHERE id = ?1", META_COLUMNS),
        [id.as_str()],
        row_to_meta,
    )
    .map_err(|e| format!("Failed to read the saved layout version: {}", e))
}

pub fn rename_layout_version(
    app_handle: &tauri::AppHandle,
    id: &str,
    name: &str,
) -> Result<(), String> {
    let Some(name) = normalize_layout_name(Some(name)) else {
        return Err("Layout name cannot be empty".to_string());
    };
    let conn = layout_db::open_db(app_handle)?;
    let affected = conn
        .execute(
            "UPDATE layout_versions SET name = ?1 WHERE id = ?2 AND kind = ?3",
            params![name, id, KIND_SAVED],
        )
        .map_err(|e| format!("Failed to rename layout version: {}", e))?;
    if affected == 0 {
        return Err("Saved layout not found".to_string());
    }
    Ok(())
}

pub fn delete_layout_version(app_handle: &tauri::AppHandle, id: &str) -> Result<(), String> {
    let conn = layout_db::open_db(app_handle)?;
    conn.execute("DELETE FROM layout_versions WHERE id = ?1", [id])
        .map_err(|e| format!("Failed to delete layout version: {}", e))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn payload_summary_counts_items_and_reads_geometry() {
        let payload = r#"{"version":9,"items":[{"type":"icon","key":"a"},{"type":"folder","id":"f1"}],"geometryKey":"medium:medium:true"}"#;
        let (icon_count, geometry_key, thumbnail) = summarize_payload(payload);
        assert_eq!(icon_count, 2);
        assert_eq!(geometry_key, Some("medium:medium:true".to_string()));
        // 没带 pageSize/columns 的 payload 画不出网格，缩略图留空。
        assert_eq!(thumbnail, None);
    }

    #[test]
    fn payload_summary_falls_back_on_broken_payload() {
        assert_eq!(summarize_payload("not json"), (0, None, None));
    }

    #[test]
    fn thumbnail_maps_slots_onto_pages() {
        let payload = serde_json::json!({
            "version": 9,
            "items": [{ "type": "icon", "key": "a" }, { "type": "icon", "key": "b" },
                      { "type": "icon", "key": "c" }, { "type": "icon", "key": "d" }],
            "slots": ["a", null, "b", "c", "d", null, null, null],
            "pageSize": 6,
            "columns": 3,
        });
        let thumbnail = build_thumbnail(&payload).expect("thumbnail");
        assert_eq!(thumbnail.columns, 3);
        assert_eq!(thumbnail.rows, 2);
        assert_eq!(
            thumbnail.pages,
            vec![vec![1, 0, 1, 1, 1, 0], vec![0, 0, 0, 0, 0, 0]]
        );
        assert_eq!(thumbnail.more_pages, 0);
    }

    #[test]
    fn thumbnail_falls_back_to_items_order_when_slots_are_empty() {
        let payload = serde_json::json!({
            "version": 9,
            "items": [{ "type": "icon", "key": "a" }, { "type": "icon", "key": "b" }],
            "slots": [],
            "pageSize": 4,
            "columns": 2,
        });
        let thumbnail = build_thumbnail(&payload).expect("thumbnail");
        assert_eq!(thumbnail.pages, vec![vec![1, 1, 0, 0]]);
    }

    #[test]
    fn thumbnail_stops_at_the_page_limit() {
        let items = (0..40)
            .map(|index| serde_json::json!({ "type": "icon", "key": format!("k{index}") }))
            .collect::<Vec<_>>();
        let payload = serde_json::json!({
            "version": 9,
            "items": items,
            "slots": [],
            "pageSize": 4,
            "columns": 2,
        });
        let thumbnail = build_thumbnail(&payload).expect("thumbnail");
        assert_eq!(thumbnail.pages.len(), THUMBNAIL_PAGE_LIMIT);
        assert_eq!(thumbnail.more_pages, 7);
    }

    #[test]
    fn thumbnail_is_rejected_without_grid_metrics() {
        assert_eq!(
            build_thumbnail(&serde_json::json!({"items": [], "slots": []})),
            None
        );
        assert_eq!(
            build_thumbnail(&serde_json::json!({
                "items": [], "slots": [], "pageSize": 0, "columns": 0
            })),
            None
        );
    }

    #[test]
    fn layout_names_are_trimmed_and_capped() {
        assert_eq!(
            normalize_layout_name(Some("  我的布局  ")),
            Some("我的布局".into())
        );
        assert_eq!(normalize_layout_name(Some("   ")), None);
        assert_eq!(normalize_layout_name(None), None);

        let long_name = "布".repeat(80);
        let normalized = normalize_layout_name(Some(&long_name)).unwrap();
        assert_eq!(normalized.chars().count(), LAYOUT_NAME_MAX_CHARS);
    }

    #[test]
    fn unknown_scopes_and_kinds_are_rejected() {
        assert!(normalize_scope("both").is_err());
        assert!(normalize_kind("manual").is_err());
        assert_eq!(normalize_scope(" paged ").unwrap(), SCOPE_PAGED);
    }
}
