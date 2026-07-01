use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

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

pub(crate) struct LlmClient {
    provider: LlmProvider,
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

    pub(crate) async fn complete_json_streaming(
        &self,
        config: &AiConfig,
        messages: Vec<LlmMessage>,
        window: &tauri::Window,
        run_id: &str,
    ) -> Result<LlmResponse, String> {
        let response = self.complete_json(config, messages, true).await?;
        emit_content_as_tokens(window, run_id, &response.content);
        Ok(response)
    }

    pub(crate) async fn complete_json(
        &self,
        config: &AiConfig,
        messages: Vec<LlmMessage>,
        strict_json: bool,
    ) -> Result<LlmResponse, String> {
        let endpoint = ai::normalize_base_url(&config.base_url)?;
        let request_body = ChatRequest {
            model: config.model.trim(),
            messages,
            temperature: config.temperature,
            response_format: strict_json.then_some(ResponseFormat {
                kind: "json_object",
            }),
        };

        let started_at = Instant::now();
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(DEFAULT_REQUEST_TIMEOUT_SECS))
            .build()
            .map_err(|error| format!("初始化模型客户端失败：{error}"))?;

        let response = client
            .post(&endpoint)
            .bearer_auth(config.api_key.trim())
            .json(&request_body)
            .send()
            .await
            .map_err(|error| format!("请求模型失败：{error}"))?;

        let status = response.status();
        let body = response
            .text()
            .await
            .map_err(|error| format!("读取模型响应失败：{error}"))?;

        if !status.is_success() {
            let snippet: String = body.chars().take(300).collect();
            return Err(format!(
                "模型接口返回错误状态 {}：{}",
                status.as_u16(),
                snippet
            ));
        }

        let parsed: ChatResponse = serde_json::from_str(&body)
            .map_err(|error| format!("解析模型响应失败：{error}"))?;
        let content = parsed
            .choices
            .into_iter()
            .next()
            .and_then(|choice| choice.message)
            .and_then(|message| message.content)
            .ok_or_else(|| "模型接口未返回有效内容。".to_string())?;

        Ok(LlmResponse {
            content,
            adapter_label: self.provider.label().to_string(),
            latency_ms: started_at.elapsed().as_millis() as u64,
            usage: parsed.usage.map(LlmUsage::from),
        })
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

#[derive(Serialize)]
struct ChatRequest<'a> {
    model: &'a str,
    messages: Vec<LlmMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    response_format: Option<ResponseFormat>,
}

#[derive(Serialize)]
struct ResponseFormat {
    #[serde(rename = "type")]
    kind: &'static str,
}

#[derive(Deserialize)]
struct ChatResponseMessage {
    #[serde(default)]
    content: Option<String>,
}

#[derive(Deserialize)]
struct ChatResponseChoice {
    #[serde(default)]
    message: Option<ChatResponseMessage>,
}

#[derive(Deserialize)]
struct ChatResponse {
    #[serde(default)]
    choices: Vec<ChatResponseChoice>,
    #[serde(default)]
    usage: Option<ChatUsage>,
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
struct PromptTokensDetails {
    #[serde(default)]
    cached_tokens: Option<u64>,
}

pub(crate) fn emit_content_as_tokens(window: &tauri::Window, run_id: &str, content: &str) {
    for token in chunk_text(content, 32) {
        emit_agent_event(
            window,
            AgentEvent::new(run_id, AgentEventPhase::Token, "模型输出片段。").token(token),
        );
    }
}

fn chunk_text(content: &str, chunk_chars: usize) -> Vec<String> {
    if content.is_empty() {
        return Vec::new();
    }

    let mut chunks = Vec::new();
    let mut chunk = String::new();
    for ch in content.chars() {
        chunk.push(ch);
        if chunk.chars().count() >= chunk_chars {
            chunks.push(std::mem::take(&mut chunk));
        }
    }
    if !chunk.is_empty() {
        chunks.push(chunk);
    }
    chunks
}