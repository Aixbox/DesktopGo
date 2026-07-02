use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Emitter;

pub(crate) const AI_ORGANIZE_AGENT_EVENT: &str = "ai-organize:agent-event";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum AgentEventPhase {
    Started,
    Context,
    Reasoning,
    Request,
    Model,
    Token,
    ToolCall,
    ToolResult,
    Usage,
    Draft,
    Saved,
    Fallback,
    Error,
    Failed,
    Done,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentEvent {
    pub run_id: String,
    pub phase: AgentEventPhase,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<AgentUsage>,
    pub at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentUsage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cached_tokens: u64,
    pub total_tokens: u64,
}

impl AgentEvent {
    pub(crate) fn new(
        run_id: impl Into<String>,
        phase: AgentEventPhase,
        message: impl Into<String>,
    ) -> Self {
        Self {
            run_id: run_id.into(),
            phase,
            message: message.into(),
            detail: None,
            token: None,
            tool_name: None,
            usage: None,
            at: unix_timestamp_secs(),
        }
    }

    pub(crate) fn detail(mut self, detail: impl Into<String>) -> Self {
        self.detail = Some(detail.into());
        self
    }

    pub(crate) fn token(mut self, token: impl Into<String>) -> Self {
        self.token = Some(token.into());
        self
    }

    pub(crate) fn tool_name(mut self, tool_name: impl Into<String>) -> Self {
        self.tool_name = Some(tool_name.into());
        self
    }

    pub(crate) fn usage(mut self, usage: AgentUsage) -> Self {
        self.usage = Some(usage);
        self
    }
}

pub(crate) fn emit_agent_event(window: &tauri::Window, event: AgentEvent) {
    let _ = window.emit(AI_ORGANIZE_AGENT_EVENT, event);
}

pub(crate) fn unix_timestamp_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or_default()
}
