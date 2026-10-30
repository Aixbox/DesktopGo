use crate::layout_db;
use rusqlite::params;
use serde::Deserialize;
use serde_json::Value;
use std::collections::BTreeMap;
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_BATCH_SIZE: usize = 64;
const MAX_METADATA_BYTES: usize = 4096;
const MAX_RETAINED_SAMPLES: i64 = 2000;

const ALLOWED_PHASES: &[&str] = &[
    "hydrate",
    "measure",
    "normalize",
    "reorder-preview",
    "persist",
    "drag-frame",
];

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutPerformanceSampleInput {
    pub phase: String,
    pub duration_ms: f64,
    pub timestamp: i64,
    pub metadata: Option<Value>,
}

#[derive(Debug, Clone)]
struct NormalizedSample {
    phase: String,
    duration_ms: f64,
    timestamp: i64,
    metadata: Option<String>,
}

fn current_timestamp_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().min(i64::MAX as u128) as i64)
        .unwrap_or(0)
}

fn normalize_sample(sample: LayoutPerformanceSampleInput) -> Result<NormalizedSample, String> {
    let phase = sample.phase.trim().to_string();
    if !ALLOWED_PHASES.contains(&phase.as_str()) {
        return Err(format!("Unsupported layout performance phase: {phase}"));
    }
    if !sample.duration_ms.is_finite() || sample.duration_ms < 0.0 {
        return Err("Layout performance duration must be finite and non-negative".to_string());
    }

    let metadata = match sample.metadata {
        None | Some(Value::Null) => None,
        Some(value) if value.is_object() => {
            let serialized = serde_json::to_string(&value).map_err(|error| {
                format!("Failed to serialize layout performance metadata: {error}")
            })?;
            if serialized.len() > MAX_METADATA_BYTES {
                return Err("Layout performance metadata is too large".to_string());
            }
            Some(serialized)
        }
        Some(_) => return Err("Layout performance metadata must be a JSON object".to_string()),
    };

    Ok(NormalizedSample {
        phase,
        duration_ms: sample.duration_ms,
        timestamp: if sample.timestamp > 0 {
            sample.timestamp
        } else {
            current_timestamp_ms()
        },
        metadata,
    })
}

/// Store bounded layout samples locally. The frontend batches calls so a drag
/// frame never waits on SQLite and a temporary IPC failure only drops that
/// batch; in-memory diagnostics continue to work.
#[tauri::command]
pub fn record_layout_performance_samples(
    app_handle: tauri::AppHandle,
    samples: Vec<LayoutPerformanceSampleInput>,
) -> Result<usize, String> {
    if samples.is_empty() {
        return Ok(0);
    }
    if samples.len() > MAX_BATCH_SIZE {
        return Err(format!(
            "Layout performance batch exceeds {MAX_BATCH_SIZE} samples"
        ));
    }

    let normalized = samples
        .into_iter()
        .map(normalize_sample)
        .collect::<Result<Vec<_>, _>>()?;
    let mut conn = layout_db::open_db(&app_handle)?;
    let tx = conn
        .transaction()
        .map_err(|error| format!("Failed to begin layout telemetry transaction: {error}"))?;
    {
        let mut statement = tx
            .prepare(
                "INSERT INTO layout_performance
                    (phase, duration_ms, timestamp_ms, metadata)
                 VALUES (?1, ?2, ?3, ?4)",
            )
            .map_err(|error| format!("Failed to prepare layout telemetry insert: {error}"))?;
        for sample in &normalized {
            statement
                .execute(params![
                    sample.phase,
                    sample.duration_ms,
                    sample.timestamp,
                    sample.metadata,
                ])
                .map_err(|error| format!("Failed to store layout telemetry sample: {error}"))?;
        }
    }
    tx.commit()
        .map_err(|error| format!("Failed to commit layout telemetry transaction: {error}"))?;

    conn.execute(
        "DELETE FROM layout_performance
         WHERE id NOT IN (
           SELECT id FROM layout_performance ORDER BY id DESC LIMIT ?1
         )",
        params![MAX_RETAINED_SAMPLES],
    )
    .map_err(|error| format!("Failed to prune layout telemetry samples: {error}"))?;

    Ok(normalized.len())
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutPerformancePhaseSummary {
    pub phase: String,
    pub sample_count: usize,
    pub total_duration_ms: f64,
    pub average_duration_ms: f64,
    pub max_duration_ms: f64,
}

/// Return compact local diagnostics for the settings/diagnostic surfaces.
#[tauri::command]
pub fn get_layout_performance_summary(
    app_handle: tauri::AppHandle,
) -> Result<Vec<LayoutPerformancePhaseSummary>, String> {
    let conn = layout_db::open_db(&app_handle)?;
    let mut statement = conn
        .prepare(
            "SELECT phase, duration_ms
             FROM layout_performance
             ORDER BY id DESC
             LIMIT ?1",
        )
        .map_err(|error| format!("Failed to prepare layout telemetry summary: {error}"))?;
    let rows = statement
        .query_map(params![MAX_RETAINED_SAMPLES], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
        })
        .map_err(|error| format!("Failed to read layout telemetry summary: {error}"))?;
    let mut grouped: BTreeMap<String, Vec<f64>> = BTreeMap::new();
    for row in rows {
        let (phase, duration) =
            row.map_err(|error| format!("Failed to decode layout telemetry summary: {error}"))?;
        grouped.entry(phase).or_default().push(duration);
    }

    Ok(grouped
        .into_iter()
        .map(|(phase, durations)| {
            let total_duration_ms = durations.iter().sum::<f64>();
            let max_duration_ms = durations.iter().copied().fold(0.0, f64::max);
            LayoutPerformancePhaseSummary {
                phase,
                sample_count: durations.len(),
                total_duration_ms,
                average_duration_ms: total_duration_ms / durations.len() as f64,
                max_duration_ms,
            }
        })
        .collect())
}

#[tauri::command]
pub fn clear_layout_performance(app_handle: tauri::AppHandle) -> Result<(), String> {
    let conn = layout_db::open_db(&app_handle)?;
    conn.execute("DELETE FROM layout_performance", [])
        .map_err(|error| format!("Failed to clear layout telemetry: {error}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{normalize_sample, LayoutPerformanceSampleInput};
    use serde_json::json;

    #[test]
    fn normalizes_valid_sample_and_keeps_metadata() {
        let sample = normalize_sample(LayoutPerformanceSampleInput {
            phase: " drag-frame ".to_string(),
            duration_ms: 4.5,
            timestamp: 42,
            metadata: Some(json!({ "scope": "paged", "overBudget": false })),
        })
        .expect("valid sample");

        assert_eq!(sample.phase, "drag-frame");
        assert_eq!(sample.duration_ms, 4.5);
        assert_eq!(sample.timestamp, 42);
        assert!(sample.metadata.expect("metadata").contains("paged"));
    }

    #[test]
    fn rejects_unknown_phase_and_non_object_metadata() {
        let unknown_phase = normalize_sample(LayoutPerformanceSampleInput {
            phase: "unknown".to_string(),
            duration_ms: 1.0,
            timestamp: 1,
            metadata: None,
        });
        assert!(unknown_phase.is_err());

        let non_object_metadata = normalize_sample(LayoutPerformanceSampleInput {
            phase: "measure".to_string(),
            duration_ms: 1.0,
            timestamp: 1,
            metadata: Some(serde_json::json!([1, 2, 3])),
        });
        assert!(non_object_metadata.is_err());
    }
}
