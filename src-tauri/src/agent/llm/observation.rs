use std::time::Instant;

use crate::agent::event::{emit_agent_event, AgentEvent, AgentEventPhase};
use crate::ai::DEFAULT_REQUEST_TIMEOUT_SECS;

use super::ApiSurface;

pub(super) struct LlmObservation<'a> {
    window: &'a tauri::Window,
    run_id: &'a str,
    attempt_label: &'a str,
}

impl<'a> LlmObservation<'a> {
    pub(super) fn new(window: &'a tauri::Window, run_id: &'a str, attempt_label: &'a str) -> Self {
        Self {
            window,
            run_id,
            attempt_label,
        }
    }
}

pub(super) fn emit_stream_delta(delta: &str, observation: Option<&LlmObservation<'_>>) {
    if let Some(observation) = observation {
        emit_agent_event(
            observation.window,
            AgentEvent::new(observation.run_id, AgentEventPhase::Token, "模型输出片段。")
                .token(delta),
        );
    }
}

pub(super) fn emit_reasoning_delta(delta: &str, observation: Option<&LlmObservation<'_>>) {
    if delta.trim().is_empty() {
        return;
    }
    if let Some(observation) = observation {
        emit_agent_event(
            observation.window,
            AgentEvent::new(observation.run_id, AgentEventPhase::ReasoningToken, "模型正在推理。")
                .token(delta),
        );
    }
}

pub(super) fn emit_observed_request(
    observation: Option<&LlmObservation<'_>>,
    surface: ApiSurface,
    strict_json: bool,
    endpoint: &str,
) {
    if let Some(observation) = observation {
        emit_agent_event(
            observation.window,
            AgentEvent::new(
                observation.run_id,
                AgentEventPhase::Request,
                "正在发起模型请求。",
            )
            .detail(format!(
                "{}；api={}；stream=true；strict_json={}；timeout={}s；endpoint={}",
                observation.attempt_label,
                surface.label(),
                strict_json,
                DEFAULT_REQUEST_TIMEOUT_SECS,
                endpoint
            )),
        );
    }
}

pub(super) fn emit_observed_response(
    observation: Option<&LlmObservation<'_>>,
    surface: ApiSurface,
    latency_ms: u64,
    status: u16,
) {
    if let Some(observation) = observation {
        emit_agent_event(
            observation.window,
            AgentEvent::new(
                observation.run_id,
                AgentEventPhase::Model,
                "模型响应已返回。",
            )
            .detail(format!(
                "{}；api={}；latency={}ms；status={}",
                observation.attempt_label,
                surface.label(),
                latency_ms,
                status
            )),
        );
    }
}

pub(super) fn emit_observed_error(
    observation: Option<&LlmObservation<'_>>,
    started_at: &Instant,
    message: &str,
) {
    if let Some(observation) = observation {
        emit_agent_event(
            observation.window,
            AgentEvent::new(observation.run_id, AgentEventPhase::Error, "模型请求失败。").detail(
                format!(
                    "{}；elapsed={}ms；{}",
                    observation.attempt_label,
                    started_at.elapsed().as_millis(),
                    message
                ),
            ),
        );
    }
}
