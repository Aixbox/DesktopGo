//! 布局版本库：布局快照（历史）与用户命名保存的布局。
//!
//! 快照的 payload 与 `kv_store` 里的当前布局同构（`PersistedLayout` 的 version 9 JSON），
//! 恢复时直接写回 kv 即可，不需要另一套序列化格式。

use std::collections::HashMap;

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

/// 缩略图里的一个条目：锚点在哪一格、占几行几列。
///
/// 文件夹可以占 1x2 / 2x1 / 2x2，只按槽位顺序平铺会让后面的图标整体前移，
/// 跟网格里的实际摆放对不上，所以位置和跨度都要带着。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThumbnailEntry {
    /// `folder:<id>` 表示文件夹，其余是图标 id。
    pub key: String,
    pub col: i64,
    pub row: i64,
    pub cols: i64,
    pub rows: i64,
    /// 文件夹名；图标没有。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// 文件夹里前几个图标的 key，缩略图按它画内部预览；图标没有。
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<String>,
}

/// 第一页里的一块矩形区域，行列都是 0 基。
#[derive(Debug, Clone, Copy)]
struct GridArea {
    col: i64,
    row: i64,
    cols: i64,
    rows: i64,
}

/// 列表里画的缩略图：只存第一页，按锚点和跨度铺开。
///
/// 早先存的是 0/1 占用表，画出来一片灰格子；现在存的是每个 item 的位置和图标 id，
/// 前端按图标库里的真实图标、连文件夹面板一起画出来，看着才像截图。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutThumbnail {
    pub columns: i64,
    pub rows: i64,
    /// 第一页里所有锚点；`default` 是给旧库里其它版本的缩略图留的兼容。
    #[serde(default)]
    pub entries: Vec<ThumbnailEntry>,
    /// 总页数（不只是画出来的第一页）。
    #[serde(default)]
    pub page_total: i64,
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
    ensure_thumbnail_column(conn)?;
    backfill_thumbnails(conn)
}

/// 老记录的缩略图是 0/1 占用表或逐格列表，画不出文件夹和真实跨度。
/// 按 payload 重算一遍补上，没有 pageSize/columns 的重算不出来，保持原样。
/// 启动时跑一次，行数受上限约束。
fn backfill_thumbnails(conn: &Connection) -> Result<(), String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, payload FROM layout_versions
             WHERE thumbnail IS NULL OR thumbnail NOT LIKE '%\"entries\"%'",
        )
        .map_err(|e| format!("Failed to prepare the thumbnail backfill: {}", e))?;
    let pending = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| format!("Failed to read layouts for the thumbnail backfill: {}", e))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| format!("Failed to read a layout for the thumbnail backfill: {}", e))?;

    for (id, payload) in pending {
        // 重算不出来（老 payload 没带 pageSize/columns）就保持原样，别把缩略图写成 NULL。
        let Some(thumbnail) = serde_json::from_str::<serde_json::Value>(&payload)
            .ok()
            .and_then(|parsed| build_thumbnail(&parsed))
            .and_then(|thumbnail| serde_json::to_string(&thumbnail).ok())
        else {
            continue;
        };
        conn.execute(
            "UPDATE layout_versions SET thumbnail = ?1 WHERE id = ?2",
            params![thumbnail, id],
        )
        .map_err(|e| format!("Failed to rewrite a layout version thumbnail: {}", e))?;
    }
    Ok(())
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

/// 把布局摊成第一页的条目列表，带上每项的位置和跨度。
///
/// slots 为空说明布局是"只保顺序、按当前网格重排"存下来的（几何变更后的应用），
/// 这种情况按 items 顺序逐格找空位，和网格实际渲染的行为对齐。
fn build_thumbnail(payload: &serde_json::Value) -> Option<LayoutThumbnail> {
    let items = payload.get("items")?.as_array()?;
    let columns = payload.get("columns")?.as_i64()?;
    let page_size = payload.get("pageSize")?.as_i64()?;
    if !(1..=THUMBNAIL_AXIS_LIMIT).contains(&columns) || page_size < columns {
        return None;
    }
    let rows = page_size / columns;
    if !(1..=THUMBNAIL_AXIS_LIMIT).contains(&rows) {
        return None;
    }

    let slots = read_slots(payload);
    let entries = if slots.iter().any(Option::is_some) {
        place_slots(&slots, items, columns, rows)
    } else {
        place_items_in_order(items, columns, rows)
    };

    let cells_per_page = (columns * rows) as usize;
    let total_cells = slots.len().max(items.len()).max(1);
    Some(LayoutThumbnail {
        columns,
        rows,
        entries,
        page_total: total_cells.div_ceil(cells_per_page) as i64,
    })
}

fn read_slots(payload: &serde_json::Value) -> Vec<Option<String>> {
    payload
        .get("slots")
        .and_then(|value| value.as_array())
        .map(|slots| {
            slots
                .iter()
                .map(|slot| slot.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default()
}

/// 按 slots 的锚点位置铺第一页。文件夹跨过的格子标记为占用，
/// 免得同一页里另一个锚点落到它的 footprint 上重叠。
fn place_slots(
    slots: &[Option<String>],
    items: &[serde_json::Value],
    columns: i64,
    rows: i64,
) -> Vec<ThumbnailEntry> {
    let lookup = build_item_lookup(items);
    let page_cells = columns * rows;
    let mut occupied = vec![false; page_cells as usize];
    let mut entries = Vec::new();

    for (raw_index, slot) in slots.iter().enumerate() {
        let Ok(index) = i64::try_from(raw_index) else {
            continue;
        };
        if index >= page_cells {
            break;
        }
        let Some(key) = slot.as_ref() else {
            continue;
        };
        let Some(item) = lookup.get(key.as_str()) else {
            continue;
        };

        let col = index % columns;
        let row = index / columns;
        let (cols, area_rows) = clamp_span(item_span(item), columns - col, rows - row);
        let area = GridArea {
            col,
            row,
            cols,
            rows: area_rows,
        };
        if footprint_taken(&occupied, area, columns) {
            continue;
        }
        mark_footprint(&mut occupied, area, columns);
        entries.push(entry_from(item, key, area));
    }

    entries
}

/// slots 为空时的兜底：按 items 顺序在网格里找第一个放得下的空位。
fn place_items_in_order(
    items: &[serde_json::Value],
    columns: i64,
    rows: i64,
) -> Vec<ThumbnailEntry> {
    let mut occupied = vec![false; (columns * rows) as usize];
    let mut entries = Vec::new();

    for item in items {
        let Some(key) = item_cell_key(item) else {
            continue;
        };
        let (span_cols, span_rows) = clamp_span(item_span(item), columns, rows);
        let Some(area) = find_placement(&occupied, columns, rows, span_cols, span_rows) else {
            continue;
        };
        mark_footprint(&mut occupied, area, columns);
        entries.push(entry_from(item, &key, area));
    }

    entries
}

/// 先按原跨度找空位；大文件夹在剩下的空间里放不下时收成 1x1，
/// 别让整项从缩略图里消失。
fn find_placement(
    occupied: &[bool],
    columns: i64,
    rows: i64,
    span_cols: i64,
    span_rows: i64,
) -> Option<GridArea> {
    if let Some((col, row)) = find_free_anchor(occupied, columns, rows, span_cols, span_rows) {
        return Some(GridArea {
            col,
            row,
            cols: span_cols,
            rows: span_rows,
        });
    }
    find_free_anchor(occupied, columns, rows, 1, 1).map(|(col, row)| GridArea {
        col,
        row,
        cols: 1,
        rows: 1,
    })
}

fn build_item_lookup(items: &[serde_json::Value]) -> HashMap<String, &serde_json::Value> {
    items
        .iter()
        .filter_map(|item| item_cell_key(item).map(|key| (key, item)))
        .collect()
}

/// item 落进格子时用的键，要和前端 `getId` 一致：图标取 `key`，文件夹取 `folder:<id>`。
fn item_cell_key(item: &serde_json::Value) -> Option<String> {
    if let Some(key) = item.get("key").and_then(|value| value.as_str()) {
        return Some(key.to_string());
    }
    item.get("id")
        .and_then(|value| value.as_str())
        .map(|id| format!("folder:{id}"))
}

/// 文件夹的排版跨度和前端 `getGridItemSpan` 保持一致。
fn item_span(item: &serde_json::Value) -> (i64, i64) {
    if item.get("type").and_then(|value| value.as_str()) != Some("folder") {
        return (1, 1);
    }
    match item.get("size").and_then(|value| value.as_str()) {
        Some("1x2") => (1, 2),
        Some("2x1") => (2, 1),
        Some("2x2") => (2, 2),
        _ => (1, 1),
    }
}

fn clamp_span(span: (i64, i64), available_cols: i64, available_rows: i64) -> (i64, i64) {
    (
        span.0.clamp(1, available_cols.max(1)),
        span.1.clamp(1, available_rows.max(1)),
    )
}

fn footprint_taken(occupied: &[bool], area: GridArea, columns: i64) -> bool {
    (0..area.rows).any(|row_offset| {
        (0..area.cols).any(|col_offset| {
            let index = (area.row + row_offset) * columns + area.col + col_offset;
            usize::try_from(index)
                .ok()
                .and_then(|index| occupied.get(index))
                .copied()
                .unwrap_or(true)
        })
    })
}

fn mark_footprint(occupied: &mut [bool], area: GridArea, columns: i64) {
    for row_offset in 0..area.rows {
        for col_offset in 0..area.cols {
            let index = (area.row + row_offset) * columns + area.col + col_offset;
            if let Ok(index) = usize::try_from(index) {
                if let Some(cell) = occupied.get_mut(index) {
                    *cell = true;
                }
            }
        }
    }
}

fn find_free_anchor(
    occupied: &[bool],
    columns: i64,
    rows: i64,
    span_cols: i64,
    span_rows: i64,
) -> Option<(i64, i64)> {
    for row in 0..=(rows - span_rows) {
        for col in 0..=(columns - span_cols) {
            let area = GridArea {
                col,
                row,
                cols: span_cols,
                rows: span_rows,
            };
            if !footprint_taken(occupied, area, columns) {
                return Some((col, row));
            }
        }
    }
    None
}

fn entry_from(item: &serde_json::Value, key: &str, area: GridArea) -> ThumbnailEntry {
    ThumbnailEntry {
        key: key.to_string(),
        col: area.col,
        row: area.row,
        cols: area.cols,
        rows: area.rows,
        name: item
            .get("name")
            .and_then(|value| value.as_str())
            .map(str::to_string),
        children: folder_children(item),
    }
}

/// 文件夹里前 4 个图标的 key，缩略图按这个画内部的小预览。
fn folder_children(item: &serde_json::Value) -> Vec<String> {
    item.get("children")
        .and_then(|value| value.as_array())
        .map(|children| {
            children
                .iter()
                .filter_map(|child| child.as_str())
                .take(4)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
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
    fn thumbnail_keeps_folder_span_and_anchor() {
        let payload = serde_json::json!({
            "version": 9,
            "items": [
                { "type": "icon", "key": "a" },
                { "type": "folder", "id": "f1", "name": "工具", "size": "2x2",
                  "children": ["x", "y", "z", "w", "v"] },
                { "type": "icon", "key": "b" }
            ],
            "slots": ["a", "folder:f1", null, null, null, null, "b",
                      null, null, null, null, null],
            "pageSize": 12,
            "columns": 3,
        });
        let thumbnail = build_thumbnail(&payload).expect("thumbnail");
        assert_eq!(thumbnail.columns, 3);
        assert_eq!(thumbnail.rows, 4);
        assert_eq!(
            thumbnail.entries,
            vec![
                ThumbnailEntry {
                    key: "a".into(),
                    col: 0,
                    row: 0,
                    cols: 1,
                    rows: 1,
                    name: None,
                    children: Vec::new(),
                },
                ThumbnailEntry {
                    key: "folder:f1".into(),
                    col: 1,
                    row: 0,
                    cols: 2,
                    rows: 2,
                    name: Some("工具".into()),
                    // 缩略图只画前 4 个小预览。
                    children: vec!["x".into(), "y".into(), "z".into(), "w".into()],
                },
                // 第 7 个槽位落在第三行第一列，文件夹的 footprint 不影响它。
                ThumbnailEntry {
                    key: "b".into(),
                    col: 0,
                    row: 2,
                    cols: 1,
                    rows: 1,
                    name: None,
                    children: Vec::new(),
                },
            ]
        );
        assert_eq!(thumbnail.page_total, 1);
    }

    #[test]
    fn thumbnail_clamps_folder_span_at_the_page_edge() {
        let payload = serde_json::json!({
            "version": 9,
            "items": [{ "type": "folder", "id": "f1", "size": "2x2", "children": [] }],
            "slots": [null, null, null, "folder:f1"],
            "pageSize": 4,
            "columns": 2,
        });
        let thumbnail = build_thumbnail(&payload).expect("thumbnail");
        // 锚点落在右下角，2x2 只能收回一格，不能溢出到不存在的格子。
        assert_eq!(thumbnail.entries.len(), 1);
        assert_eq!((thumbnail.entries[0].col, thumbnail.entries[0].row), (1, 1));
        assert_eq!(
            (thumbnail.entries[0].cols, thumbnail.entries[0].rows),
            (1, 1)
        );
    }

    #[test]
    fn thumbnail_falls_back_to_items_order_when_slots_are_empty() {
        let payload = serde_json::json!({
            "version": 9,
            "items": [
                { "type": "icon", "key": "a" },
                { "type": "folder", "id": "f1", "size": "2x2", "children": [] },
                { "type": "icon", "key": "b" }
            ],
            "slots": [],
            "pageSize": 4,
            "columns": 2,
        });
        let thumbnail = build_thumbnail(&payload).expect("thumbnail");
        let placed = thumbnail
            .entries
            .iter()
            .map(|entry| {
                (
                    entry.key.as_str(),
                    entry.col,
                    entry.row,
                    entry.cols,
                    entry.rows,
                )
            })
            .collect::<Vec<_>>();
        assert_eq!(
            placed,
            vec![
                ("a", 0, 0, 1, 1),
                // 2x2 在剩下的 1 列里放不下，收成 1x1 而不是整项丢掉。
                ("folder:f1", 1, 0, 1, 1),
                ("b", 0, 1, 1, 1),
            ]
        );
        assert_eq!(thumbnail.page_total, 1);
    }

    #[test]
    fn thumbnail_counts_pages_beyond_the_first() {
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
        assert_eq!(thumbnail.entries.len(), 4);
        assert_eq!(thumbnail.entries[0].key, "k0");
        assert_eq!(thumbnail.page_total, 10);
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
