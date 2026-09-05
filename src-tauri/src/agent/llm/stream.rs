use std::time::Instant;

use futures_util::StreamExt;
use serde::Deserialize;
use serde_json::Value;

use crate::agent::event::AgentUsage;

use super::observation::{
    emit_observed_error, emit_reasoning_delta, emit_stream_delta, LlmObservation,
};
use super::ApiSurface;

pub(super) struct StreamAccumulator {
    pub(super) content: String,
    pub(super) usage: Option<LlmUsage>,
}

impl StreamAccumulator {
    pub(super) fn new() -> Self {
        Self {
            content: String::new(),
            usage: None,
        }
    }
}

pub(super) async fn read_sse_stream(
    response: reqwest::Response,
    surface: ApiSurface,
    observation: Option<&LlmObservation<'_>>,
    started_at: &Instant,
    accumulator: &mut StreamAccumulator,
) -> Result<(), String> {
    let mut stream = response.bytes_stream();
    let mut buffer = Vec::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| {
            let message = format!("读取 {} 流式响应失败：{error}", surface.label());
            emit_observed_error(observation, started_at, &message);
            message
        })?;
        buffer.extend_from_slice(&chunk);
        while let Some((frame_end, separator_len)) = find_sse_frame_end(&buffer) {
            let frame = String::from_utf8(buffer[..frame_end].to_vec()).map_err(|error| {
                let message = format!("解析 {} SSE UTF-8 响应失败：{error}", surface.label());
                emit_observed_error(observation, started_at, &message);
                message
            })?;
            buffer.drain(..frame_end + separator_len);
            handle_sse_frame(&frame, surface, observation, started_at, accumulator)?;
        }
    }

    if !buffer.is_empty() {
        let frame = String::from_utf8(buffer).map_err(|error| {
            let message = format!("解析 {} SSE UTF-8 响应失败：{error}", surface.label());
            emit_observed_error(observation, started_at, &message);
            message
        })?;
        handle_sse_frame(&frame, surface, observation, started_at, accumulator)?;
    }
    Ok(())
}

fn find_sse_frame_end(buffer: &[u8]) -> Option<(usize, usize)> {
    let lf = find_bytes(buffer, b"\n\n").map(|index| (index, 2));
    let crlf = find_bytes(buffer, b"\r\n\r\n").map(|index| (index, 4));
    match (lf, crlf) {
        (Some(left), Some(right)) => Some(if left.0 < right.0 { left } else { right }),
        (Some(index), None) | (None, Some(index)) => Some(index),
        (None, None) => None,
    }
}

fn handle_sse_frame(
    frame: &str,
    surface: ApiSurface,
    observation: Option<&LlmObservation<'_>>,
    started_at: &Instant,
    accumulator: &mut StreamAccumulator,
) -> Result<(), String> {
    let mut event_name = None;
    let mut data_lines = Vec::new();
    for line in frame.lines() {
        let line = line.trim_end_matches('\r');
        if line.is_empty() || line.starts_with(':') {
            continue;
        }
        if let Some(value) = line.strip_prefix("event:") {
            event_name = Some(value.trim().to_string());
        } else if let Some(value) = line.strip_prefix("data:") {
            data_lines.push(value.trim_start().to_string());
        }
    }
    if data_lines.is_empty() {
        return Ok(());
    }

    let data = data_lines.join("\n");
    if data.trim() == "[DONE]" {
        return Ok(());
    }
    let payload: Value = serde_json::from_str(&data).map_err(|error| {
        let message = format!("解析 {} SSE 事件失败：{error}", surface.label());
        emit_observed_error(observation, started_at, &message);
        message
    })?;
    let event_type = event_name
        .as_deref()
        .or_else(|| payload.get("type").and_then(Value::as_str))
        .unwrap_or_default();

    match surface {
        ApiSurface::Responses => {
            handle_responses_event(event_type, &payload, observation, started_at, accumulator)
        }
        ApiSurface::ChatCompletions => {
            handle_chat_completions_event(&payload, observation, started_at, accumulator)
        }
        ApiSurface::AnthropicMessages => handle_anthropic_messages_event(
            event_type,
            &payload,
            observation,
            started_at,
            accumulator,
        ),
    }
}

fn find_bytes(buffer: &[u8], needle: &[u8]) -> Option<usize> {
    buffer
        .windows(needle.len())
        .position(|window| window == needle)
}

fn handle_anthropic_messages_event(
    event_type: &str,
    payload: &Value,
    observation: Option<&LlmObservation<'_>>,
    started_at: &Instant,
    accumulator: &mut StreamAccumulator,
) -> Result<(), String> {
    match event_type {
        "content_block_delta" => {
            if let Some(delta) = payload.pointer("/delta/text").and_then(Value::as_str) {
                push_stream_delta(delta, observation, accumulator);
            }
            if payload.pointer("/delta/type").and_then(Value::as_str) == Some("thinking_delta") {
                if let Some(delta) = payload.pointer("/delta/thinking").and_then(Value::as_str) {
                    emit_reasoning_delta(delta, observation);
                }
            }
        }
        "error" => {
            let message = extract_error_message(payload)
                .unwrap_or_else(|| "Anthropic Messages 返回失败事件。".to_string());
            emit_observed_error(observation, started_at, &message);
            return Err(message);
        }
        _ => {}
    }
    Ok(())
}

fn handle_responses_event(
    event_type: &str,
    payload: &Value,
    observation: Option<&LlmObservation<'_>>,
    started_at: &Instant,
    accumulator: &mut StreamAccumulator,
) -> Result<(), String> {
    match event_type {
        "response.output_text.delta" => {
            if let Some(delta) = payload.get("delta").and_then(Value::as_str) {
                push_stream_delta(delta, observation, accumulator);
            }
        }
        "response.output_text.done" => {
            if accumulator.content.is_empty() {
                if let Some(text) = payload.get("text").and_then(Value::as_str) {
                    accumulator.content.push_str(text);
                }
            }
        }
        "response.completed" => {
            if accumulator.content.is_empty() {
                if let Some(text) = extract_responses_completed_text(payload) {
                    accumulator.content.push_str(&text);
                }
            }
            accumulator.usage = parse_responses_usage(payload);
        }
        "response.failed" | "error" => {
            let message = extract_error_message(payload)
                .unwrap_or_else(|| "Responses API 返回失败事件。".to_string());
            emit_observed_error(observation, started_at, &message);
            return Err(message);
        }
        "response.reasoning_summary_text.delta" | "response.reasoning_text.delta" => {
            if let Some(delta) = payload.get("delta").and_then(Value::as_str) {
                emit_reasoning_delta(delta, observation);
            }
        }
        _ => {}
    }
    Ok(())
}

fn handle_chat_completions_event(
    payload: &Value,
    observation: Option<&LlmObservation<'_>>,
    started_at: &Instant,
    accumulator: &mut StreamAccumulator,
) -> Result<(), String> {
    if let Some(error) = payload.get("error") {
        let message = extract_error_message(error)
            .unwrap_or_else(|| "Chat Completions 返回错误事件。".to_string());
        emit_observed_error(observation, started_at, &message);
        return Err(message);
    }
    if let Some(usage) = parse_chat_usage(payload) {
        accumulator.usage = Some(usage);
    }
    if let Some(choices) = payload.get("choices").and_then(Value::as_array) {
        for choice in choices {
            if let Some(delta) = choice
                .get("delta")
                .and_then(|delta| delta.get("content"))
                .and_then(Value::as_str)
            {
                push_stream_delta(delta, observation, accumulator);
            }
            if let Some(reasoning_delta) = choice
                .get("delta")
                .and_then(|delta| {
                    delta
                        .get("reasoning_content")
                        .or_else(|| delta.get("reasoning"))
                })
                .and_then(Value::as_str)
            {
                emit_reasoning_delta(reasoning_delta, observation);
            }
        }
    }
    Ok(())
}

fn push_stream_delta(
    delta: &str,
    observation: Option<&LlmObservation<'_>>,
    accumulator: &mut StreamAccumulator,
) {
    if delta.is_empty() {
        return;
    }
    accumulator.content.push_str(delta);
    emit_stream_delta(delta, observation);
}

fn extract_responses_completed_text(payload: &Value) -> Option<String> {
    let output = payload
        .get("response")
        .and_then(|response| response.get("output"))
        .and_then(Value::as_array)?;
    let mut text = String::new();
    for item in output {
        let Some(content) = item.get("content").and_then(Value::as_array) else {
            continue;
        };
        for part in content {
            if let Some(part_text) = part.get("text").and_then(Value::as_str) {
                text.push_str(part_text);
            }
        }
    }
    (!text.is_empty()).then_some(text)
}

fn extract_error_message(payload: &Value) -> Option<String> {
    payload
        .pointer("/error/message")
        .or_else(|| payload.pointer("/response/error/message"))
        .or_else(|| payload.get("message"))
        .and_then(Value::as_str)
        .map(ToString::to_string)
}

fn parse_chat_usage(payload: &Value) -> Option<LlmUsage> {
    payload
        .get("usage")
        .cloned()
        .and_then(|usage| serde_json::from_value::<ChatUsage>(usage).ok())
        .map(LlmUsage::from)
}

fn parse_responses_usage(payload: &Value) -> Option<LlmUsage> {
    payload
        .pointer("/response/usage")
        .or_else(|| payload.get("usage"))
        .cloned()
        .and_then(|usage| serde_json::from_value::<ResponsesUsage>(usage).ok())
        .map(LlmUsage::from)
}

#[derive(Debug, Clone)]
pub(crate) struct LlmUsage {
    input_tokens: u64,
    output_tokens: u64,
    cached_tokens: u64,
    total_tokens: u64,
}

impl LlmUsage {
    pub(crate) fn to_agent_usage(&self) -> AgentUsage {
        AgentUsage {
            input_tokens: self.input_tokens,
            output_tokens: self.output_tokens,
            cached_tokens: self.cached_tokens,
            total_tokens: self.total_tokens,
        }
    }
}

impl From<ChatUsage> for LlmUsage {
    fn from(usage: ChatUsage) -> Self {
        let input_tokens = usage.prompt_tokens.unwrap_or_default();
        let output_tokens = usage.completion_tokens.unwrap_or_default();
        let total_tokens = usage
            .total_tokens
            .unwrap_or(input_tokens.saturating_add(output_tokens));
        let cached_tokens = usage
            .prompt_tokens_details
            .and_then(|details| details.cached_tokens)
            .unwrap_or_default();
        Self {
            input_tokens,
            output_tokens,
            cached_tokens,
            total_tokens,
        }
    }
}

impl From<ResponsesUsage> for LlmUsage {
    fn from(usage: ResponsesUsage) -> Self {
        let input_tokens = usage.input_tokens.unwrap_or_default();
        let output_tokens = usage.output_tokens.unwrap_or_default();
        let total_tokens = usage
            .total_tokens
            .unwrap_or(input_tokens.saturating_add(output_tokens));
        let cached_tokens = usage
            .input_tokens_details
            .and_then(|details| details.cached_tokens)
            .unwrap_or_default();
        Self {
            input_tokens,
            output_tokens,
            cached_tokens,
            total_tokens,
        }
    }
}

#[derive(Deserialize)]
struct ChatUsage {
    #[serde(default)]
    prompt_tokens: Option<u64>,
    #[serde(default)]
    completion_tokens: Option<u64>,
    #[serde(default)]
    total_tokens: Option<u64>,
    #[serde(default)]
    prompt_tokens_details: Option<PromptTokensDetails>,
}

#[derive(Deserialize)]
struct ResponsesUsage {
    #[serde(default)]
    input_tokens: Option<u64>,
    #[serde(default)]
    output_tokens: Option<u64>,
    #[serde(default)]
    total_tokens: Option<u64>,
    #[serde(default)]
    input_tokens_details: Option<ResponseInputTokensDetails>,
}

#[derive(Deserialize)]
struct PromptTokensDetails {
    #[serde(default)]
    cached_tokens: Option<u64>,
}

#[derive(Deserialize)]
struct ResponseInputTokensDetails {
    #[serde(default)]
    cached_tokens: Option<u64>,
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn finds_lf_and_crlf_frame_boundaries() {
        assert_eq!(find_sse_frame_end(b"data: a\n\ndata: b"), Some((7, 2)));
        assert_eq!(find_sse_frame_end(b"data: a\r\n\r\ndata: b"), Some((7, 4)));
    }

    #[test]
    fn parses_chat_usage_with_cached_tokens() {
        let usage = parse_chat_usage(&json!({
            "usage": {
                "prompt_tokens": 12,
                "completion_tokens": 5,
                "total_tokens": 17,
                "prompt_tokens_details": { "cached_tokens": 4 }
            }
        }))
        .unwrap();
        let agent_usage = usage.to_agent_usage();
        assert_eq!(agent_usage.input_tokens, 12);
        assert_eq!(agent_usage.output_tokens, 5);
        assert_eq!(agent_usage.cached_tokens, 4);
        assert_eq!(agent_usage.total_tokens, 17);
    }

    #[test]
    fn extracts_completed_responses_text() {
        let payload = json!({
            "response": {
                "output": [{
                    "content": [{ "text": "hello" }, { "text": " world" }]
                }]
            }
        });
        assert_eq!(
            extract_responses_completed_text(&payload).as_deref(),
            Some("hello world")
        );
    }

    #[test]
    fn extracts_anthropic_text_delta() {
        let mut accumulator = StreamAccumulator::new();
        handle_anthropic_messages_event(
            "content_block_delta",
            &json!({ "delta": { "text": "你好" } }),
            None,
            &Instant::now(),
            &mut accumulator,
        )
        .unwrap();
        assert_eq!(accumulator.content, "你好");
    }

    #[test]
    fn anthropic_thinking_delta_does_not_pollute_content() {
        let mut accumulator = StreamAccumulator::new();
        handle_anthropic_messages_event(
            "content_block_delta",
            &json!({ "delta": { "type": "thinking_delta", "thinking": "先想一下" } }),
            None,
            &Instant::now(),
            &mut accumulator,
        )
        .unwrap();
        assert!(accumulator.content.is_empty());
    }
}
