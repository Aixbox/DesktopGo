use crate::agent::event::unix_timestamp_secs;
use crate::ai::{AiClassifyResult, AiGroup, AiIconInput};
use crate::layout_db;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

const MEMORY_KEY: &str = "desktopgo.ai.agent.memory.v1";
const MAX_MEMORY_RUNS: usize = 20;
const MAX_SUMMARY_RUNS: usize = 3;
const MAX_GROUPS_PER_SUMMARY_RUN: usize = 6;
const MAX_NAMES_PER_GROUP: usize = 6;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentMemory {
    #[serde(default)]
    pub runs: Vec<AgentRunRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) enum AgentRunStatus {
    Drafted,
    Applied,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentRunGroup {
    pub folder_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub folder_size: Option<String>,
    #[serde(default)]
    pub icon_keys: Vec<String>,
    #[serde(default)]
    pub icon_names: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentRunRecord {
    pub run_id: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub status: AgentRunStatus,
    pub model: String,
    pub icon_count: usize,
    #[serde(default)]
    pub custom_prompt: String,
    #[serde(default)]
    pub groups: Vec<AgentRunGroup>,
    pub leftover_count: usize,
}

pub(crate) fn load_memory(app_handle: &tauri::AppHandle) -> Result<AgentMemory, String> {
    let raw = layout_db::get_layout_payload(app_handle, MEMORY_KEY)?;
    let Some(raw) = raw else {
        return Ok(AgentMemory::default());
    };

    serde_json::from_str::<AgentMemory>(&raw).or_else(|_| Ok(AgentMemory::default()))
}

fn save_memory(app_handle: &tauri::AppHandle, memory: &AgentMemory) -> Result<(), String> {
    let payload = serde_json::to_string(memory)
        .map_err(|error| format!("序列化 AI Agent 记忆失败：{error}"))?;
    layout_db::set_layout_payload(app_handle, MEMORY_KEY, &payload)
}

pub(crate) fn save_draft(
    app_handle: &tauri::AppHandle,
    run_id: &str,
    model: &str,
    custom_prompt: Option<&str>,
    result: &AiClassifyResult,
    icons: &[AiIconInput],
) -> Result<(), String> {
    let mut memory = load_memory(app_handle)?;
    let now = unix_timestamp_secs();
    let icon_name_by_key: HashMap<&str, &str> = icons
        .iter()
        .map(|icon| (icon.key.as_str(), icon.name.as_str()))
        .collect();

    memory.runs.retain(|record| record.run_id != run_id);
    memory.runs.push(AgentRunRecord {
        run_id: run_id.to_string(),
        created_at: now,
        updated_at: now,
        status: AgentRunStatus::Drafted,
        model: model.trim().to_string(),
        icon_count: icons.len(),
        custom_prompt: custom_prompt.unwrap_or_default().trim().to_string(),
        groups: result
            .groups
            .iter()
            .map(|group| AgentRunGroup {
                folder_name: group.folder_name.clone(),
                folder_size: group.folder_size.clone(),
                icon_keys: group.icon_keys.clone(),
                icon_names: group
                    .icon_keys
                    .iter()
                    .filter_map(|key| icon_name_by_key.get(key.as_str()).copied())
                    .map(str::to_string)
                    .collect(),
            })
            .collect(),
        leftover_count: result.leftover.len(),
    });
    trim_memory(&mut memory);
    save_memory(app_handle, &memory)
}

pub(crate) fn mark_applied(
    app_handle: &tauri::AppHandle,
    run_id: &str,
    groups: Vec<AiGroup>,
) -> Result<(), String> {
    let mut memory = load_memory(app_handle)?;
    let Some(record) = memory
        .runs
        .iter_mut()
        .find(|record| record.run_id == run_id)
    else {
        return Err("未找到对应的 AI 整理记录。".to_string());
    };

    let previous_names: HashMap<String, String> = record
        .groups
        .iter()
        .flat_map(|group| {
            group
                .icon_keys
                .iter()
                .cloned()
                .zip(group.icon_names.iter().cloned())
        })
        .collect();

    record.status = AgentRunStatus::Applied;
    record.updated_at = unix_timestamp_secs();
    record.groups = groups
        .into_iter()
        .map(|group| AgentRunGroup {
            folder_name: group.folder_name,
            folder_size: group.folder_size,
            icon_names: group
                .icon_keys
                .iter()
                .filter_map(|key| previous_names.get(key).cloned())
                .collect(),
            icon_keys: group.icon_keys,
        })
        .collect();
    trim_memory(&mut memory);
    save_memory(app_handle, &memory)
}

pub(crate) fn build_preference_summary(memory: &AgentMemory) -> Option<String> {
    let mut lines = Vec::new();
    let applied_runs = memory
        .runs
        .iter()
        .rev()
        .filter(|record| record.status == AgentRunStatus::Applied)
        .take(MAX_SUMMARY_RUNS);

    for record in applied_runs {
        let groups: Vec<String> = record
            .groups
            .iter()
            .take(MAX_GROUPS_PER_SUMMARY_RUN)
            .map(|group| {
                let names = group
                    .icon_names
                    .iter()
                    .take(MAX_NAMES_PER_GROUP)
                    .cloned()
                    .collect::<Vec<_>>()
                    .join("、");
                if names.is_empty() {
                    format_group_summary_label(group)
                } else {
                    format!("{}：{}", format_group_summary_label(group), names)
                }
            })
            .collect();

        if !groups.is_empty() {
            lines.push(format!("- {}", groups.join("；")));
        }
    }

    if lines.is_empty() {
        None
    } else {
        let mut summary =
            "最近用户确认过的整理偏好（仅供参考，当前图标清单和用户提示优先）：".to_string();
        summary.push('\n');
        summary.push_str(&lines.join("\n"));
        Some(summary)
    }
}

fn format_group_summary_label(group: &AgentRunGroup) -> String {
    match group.folder_size.as_deref() {
        Some(size) => format!("{}({size})", group.folder_name),
        None => group.folder_name.clone(),
    }
}

pub(crate) fn trim_memory(memory: &mut AgentMemory) {
    memory.runs.sort_by_key(|record| record.updated_at);
    if memory.runs.len() > MAX_MEMORY_RUNS {
        let drain_count = memory.runs.len() - MAX_MEMORY_RUNS;
        memory.runs.drain(0..drain_count);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn group(name: &str, icon_names: &[&str]) -> AgentRunGroup {
        AgentRunGroup {
            folder_name: name.to_string(),
            folder_size: None,
            icon_keys: icon_names
                .iter()
                .map(|name| format!("desktop:{name}"))
                .collect(),
            icon_names: icon_names.iter().map(|name| name.to_string()).collect(),
        }
    }

    #[test]
    fn preference_summary_uses_applied_runs_only() {
        let memory = AgentMemory {
            runs: vec![
                AgentRunRecord {
                    run_id: "draft".to_string(),
                    created_at: 1,
                    updated_at: 1,
                    status: AgentRunStatus::Drafted,
                    model: "test".to_string(),
                    icon_count: 2,
                    custom_prompt: String::new(),
                    groups: vec![group("草稿", &["A", "B"])],
                    leftover_count: 0,
                },
                AgentRunRecord {
                    run_id: "applied".to_string(),
                    created_at: 2,
                    updated_at: 2,
                    status: AgentRunStatus::Applied,
                    model: "test".to_string(),
                    icon_count: 2,
                    custom_prompt: String::new(),
                    groups: vec![group("开发工具", &["VS Code", "RustRover"])],
                    leftover_count: 0,
                },
            ],
        };

        let summary = build_preference_summary(&memory).unwrap();
        assert!(summary.contains("开发工具"));
        assert!(!summary.contains("草稿"));
    }

    #[test]
    fn trim_memory_keeps_recent_records() {
        let mut memory = AgentMemory {
            runs: (0..25)
                .map(|index| AgentRunRecord {
                    run_id: format!("run-{index}"),
                    created_at: index,
                    updated_at: index,
                    status: AgentRunStatus::Drafted,
                    model: "test".to_string(),
                    icon_count: 0,
                    custom_prompt: String::new(),
                    groups: Vec::new(),
                    leftover_count: 0,
                })
                .collect(),
        };

        trim_memory(&mut memory);
        assert_eq!(memory.runs.len(), MAX_MEMORY_RUNS);
        assert_eq!(memory.runs[0].run_id, "run-5");
    }
}
