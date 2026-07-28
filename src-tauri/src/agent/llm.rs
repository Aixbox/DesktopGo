use std::time::{Duration, Instant};

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::agent::event::{emit_agent_event, AgentEvent, AgentEventPhase, AgentUsage};
use crate::ai::{self, AiConfig, DEFAULT_REQUEST_TIMEOUT_SECS};

#[derive(Debug, Clone, Serialize)]
pub(crate) struct LlmMessage {
    role: String,
    content: String,
}

impl LlmMessage {
    pub(crate) fn new(role: impl Into<String>, content: impl Into<String>) -> Self {
        Self {
            role: role.into(),
            content: content.into(),
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub(crate) enum LlmProvider {
    OpenAiCompatible,
}

impl LlmProvider {
    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::OpenAiCompatible => "openai-compatible",
        }
    }
}

#[derive(Debug, Clone, Copy)]
enum ApiSurface {
    Responses,
    ChatCompletions,
}

impl ApiSurface {
    fn label(self) -> &'static str {
        match self {
            Self::Responses => "responses",
            Self::ChatCompletions => "chat-completions",
        }
    }

    fn endpoint(self, base_url: &str) -> Result<String, String> {
        match self {
            Self::Responses => ai::normalize_responses_url(base_url),
            Self::ChatCompletions => ai::normalize_chat_completions_url(base_url),
        }
    }
}

pub(crate) struct LlmClient {
    provider: LlmProvider,
}

struct LlmObservation<'a> {
    window: &'a tauri::Window,
    run_id: &'a str,
    attempt_label: &'a str,
}

struct StreamingRequestInput<'a>(&'a AiConfig, &'a [LlmMessage], bool);

struct StreamAccumulator {
    content: String,
    usage: Option<LlmUsage>,
}

impl StreamAccumulator {
    fn new() -> Self {
        Self {
            content: String::new(),
            usage: None,
        }
    }
}

impl LlmClient {
    pub(crate) fn from_config(_config: &AiConfig) -> Self {
        Self {
            provider: LlmProvider::OpenAiCompatible,
        }
    }

    pub(crate) fn provider(&self) -> LlmProvider {
        self.provider
    }

    pub(crate) async fn complete_json_observed(
        &self,
        config: &AiConfig,
        messages: Vec<LlmMessage>,
        strict_json: bool,
        window: &tauri::Window,
        run_id: &str,
        attempt_label: &str,
    ) -> Result<LlmResponse, String> {
        self.complete_json_inner(
            config,
            &messages,
            strict_json,
            Some(LlmObservation {
                window,
                run_id,
                attempt_label,
            }),
        )
        .await
    }

    async fn complete_json_inner(
        &self,
        config: &AiConfig,
        messages: &[LlmMessage],
        strict_json: bool,
        observation: Option<LlmObservation<'_>>,
    ) -> Result<LlmResponse, String> {
        let started_at = Instant::now();
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(DEFAULT_REQUEST_TIMEOUT_SECS))
            .build()
            .map_err(|error| {
                let message = format!("初始化模型客户端失败：{error}");
                emit_observed_error(observation.as_ref(), &started_at, &message);
                message
            })?;
        if !should_try_responses_first(&config.base_url) {
            return self
                .complete_streaming_request(
                    ApiSurface::ChatCompletions,
                    &client,
                    StreamingRequestInput(config, messages, strict_json),
                    observation.as_ref(),
                    started_at,
                )
                .await;
        }

        match self
            .complete_streaming_request(
                ApiSurface::Responses,
                &client,
                StreamingRequestInput(config, messages, strict_json),
                observation.as_ref(),
                started_at,
            )
            .await
        {
            Ok(response) => Ok(response),
            Err(responses_error) => {
                emit_observed_fallback(
                    observation.as_ref(),
                    "Responses API 流式请求失败，正在降级为 Chat Completions 流式请求。",
                    &responses_error,
                );

                self.complete_streaming_request(
                    ApiSurface::ChatCompletions,
                    &client,
                    StreamingRequestInput(config, messages, strict_json),
                    observation.as_ref(),
                    started_at,
                )
                .await
                .map_err(|chat_error| {
                    format!(
                        "Responses API 流式请求失败：{responses_error}；Chat Completions 流式请求失败：{chat_error}"
                    )
                })
            }
        }
    }

    async fn complete_streaming_request(
        &self,
        surface: ApiSurface,
        client: &reqwest::Client,
        input: StreamingRequestInput<'_>,
        observation: Option<&LlmObservation<'_>>,
        started_at: Instant,
    ) -> Result<LlmResponse, String> {
        let StreamingRequestInput(config, messages, strict_json) = input;
        let endpoint = surface.endpoint(&config.base_url)?;
        let request_body = match surface {
            ApiSurface::Responses => build_responses_request(config, messages, strict_json),
            ApiSurface::ChatCompletions => {
                build_chat_completions_request(config, messages, strict_json)
            }
        };

        emit_observed_request(observation, surface, strict_json, &endpoint);

        let response = client
            .post(&endpoint)
            .bearer_auth(config.api_key.trim())
            .json(&request_body)
            .send()
            .await
            .map_err(|error| {
                let message = format!("请求模型失败：{error}");
                emit_observed_error(observation, &started_at, &message);
                message
            })?;

        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            let snippet: String = body.chars().take(300).collect();
            let message = format!(
                "{} 接口返回错误状态 {}：{}",
                surface.label(),
                status.as_u16(),
                snippet
            );
            emit_observed_error(observation, &started_at, &message);
            return Err(message);
        }

        let mut accumulator = StreamAccumulator::new();
        read_sse_stream(
            response,
            surface,
            observation,
            &started_at,
            &mut accumulator,
        )
        .await?;

        if accumulator.content.trim().is_empty() {
            let message = format!("{} 流式响应未返回有效内容。", surface.label());
            emit_observed_error(observation, &started_at, &message);
            return Err(message);
        }

        let latency_ms = started_at.elapsed().as_millis() as u64;
        emit_observed_response(observation, surface, latency_ms, status.as_u16());

        Ok(LlmResponse {
            content: accumulator.content,
            adapter_label: format!("{}:{}", self.provider.label(), surface.label()),
            latency_ms,
            usage: accumulator.usage,
        })
    }
}

fn should_try_responses_first(base_url: &str) -> bool {
    base_url.to_ascii_lowercase().contains("api.openai.com")
}

fn build_responses_request(config: &AiConfig, messages: &[LlmMessage], strict_json: bool) -> Value {
    let input: Vec<Value> = messages
        .iter()
        .map(|message| {
            json!({
                "role": message.role,
                "content": message.content,
            })
        })
        .collect();

    let mut body = json!({
        "model": config.model.trim(),
        "input": input,
        "stream": true,
    });

    if let Some(temperature) = config.temperature {
        body["temperature"] = json!(temperature);
    }

    if strict_json {
        body["text"] = json!({
            "format": {
                "type": "json_schema",
                "name": "desktopgo_icon_groups",
                "strict": true,
                "schema": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["groups"],
                    "properties": {
                        "groups": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "additionalProperties": false,
                                "required": ["folderName", "iconKeys", "folderSize"],
                                "properties": {
                                    "folderName": { "type": "string" },
                                    "iconKeys": {
                                        "type": "array",
                                        "items": { "type": "string" }
                                    },
                                    "folderSize": {
                                        "type": "string",
                                        "enum": ["1x1", "1x2", "2x1", "2x2"]
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });
    }

    body
}

fn build_chat_completions_request(
    config: &AiConfig,
    messages: &[LlmMessage],
    strict_json: bool,
) -> Value {
    let mut body = json!({
        "model": config.model.trim(),
        "messages": messages,
        "stream": true,
        "stream_options": {
            "include_usage": true
        }
    });

    if let Some(temperature) = config.temperature {
        body["temperature"] = json!(temperature);
    }

    if strict_json {
        body["response_format"] = json!({ "type": "json_object" });
    }

    body
}

async fn read_sse_stream(
    response: reqwest::Response,
    surface: ApiSurface,
    observation: Option<&LlmObservation<'_>>,
    started_at: &Instant,
    accumulator: &mut StreamAccumulator,
) -> Result<(), String> {
    let mut stream = response.bytes_stream();
    let mut buffer = String::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| {
            let message = format!("读取 {} 流式响应失败：{error}", surface.label());
            emit_observed_error(observation, started_at, &message);
            message
        })?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some((frame_end, separator_len)) = find_sse_frame_end(&buffer) {
            let frame = buffer[..frame_end].to_string();
            buffer.drain(..frame_end + separator_len);
            handle_sse_frame(&frame, surface, observation, started_at, accumulator)?;
        }
    }

    if !buffer.trim().is_empty() {
        handle_sse_frame(&buffer, surface, observation, started_at, accumulator)?;
    }

    Ok(())
}

fn find_sse_frame_end(buffer: &str) -> Option<(usize, usize)> {
    let lf = buffer.find("\n\n").map(|index| (index, 2));
    let crlf = buffer.find("\r\n\r\n").map(|index| (index, 4));

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
    let mut event_name: Option<String> = None;
    let mut data_lines: Vec<String> = Vec::new();

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
    }
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
                .and_then(|delta| delta.get("reasoning_content"))
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
    if let Some(observation) = observation {
        emit_agent_event(
            observation.window,
            AgentEvent::new(observation.run_id, AgentEventPhase::Token, "模型输出片段。")
                .token(delta),
        );
    }
}

fn emit_reasoning_delta(delta: &str, observation: Option<&LlmObservation<'_>>) {
    if delta.trim().is_empty() {
        return;
    }
    if let Some(observation) = observation {
        emit_agent_event(
            observation.window,
            AgentEvent::new(
                observation.run_id,
                AgentEventPhase::Reasoning,
                "模型正在推理。",
            )
            .detail(delta.chars().take(160).collect::<String>()),
        );
    }
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

    if text.is_empty() {
        None
    } else {
        Some(text)
    }
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

fn emit_observed_request(
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

fn emit_observed_response(
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

fn emit_observed_fallback(observation: Option<&LlmObservation<'_>>, message: &str, detail: &str) {
    if let Some(observation) = observation {
        emit_agent_event(
            observation.window,
            AgentEvent::new(observation.run_id, AgentEventPhase::Fallback, message).detail(detail),
        );
    }
}

fn emit_observed_error(
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

#[derive(Debug, Clone)]
pub(crate) struct LlmResponse {
    pub(crate) content: String,
    pub(crate) adapter_label: String,
    pub(crate) latency_ms: u64,
    pub(crate) usage: Option<LlmUsage>,
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
