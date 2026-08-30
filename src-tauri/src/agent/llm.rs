mod observation;
mod request;
mod stream;

use std::time::{Duration, Instant};

use serde::Serialize;
use tokio_util::sync::CancellationToken;

use crate::ai::{self, AiCompatibleProtocol, AiConfig, AiProvider, DEFAULT_REQUEST_TIMEOUT_SECS};

use observation::{
    emit_observed_error, emit_observed_request, emit_observed_response, LlmObservation,
};
use request::{
    build_anthropic_messages_request, build_chat_completions_request, build_responses_request,
};
use stream::{read_sse_stream, LlmUsage, StreamAccumulator};

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
    OpenAi,
    Anthropic,
}

impl LlmProvider {
    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::OpenAi => "openai",
            Self::Anthropic => "anthropic",
        }
    }
}

#[derive(Debug, Clone, Copy)]
enum ApiSurface {
    Responses,
    ChatCompletions,
    AnthropicMessages,
}

impl ApiSurface {
    fn label(self) -> &'static str {
        match self {
            Self::Responses => "responses",
            Self::ChatCompletions => "chat-completions",
            Self::AnthropicMessages => "anthropic-messages",
        }
    }

    fn endpoint(self, base_url: &str) -> Result<String, String> {
        match self {
            Self::Responses => ai::normalize_responses_url(base_url),
            Self::ChatCompletions => ai::normalize_chat_completions_url(base_url),
            Self::AnthropicMessages => ai::normalize_anthropic_messages_url(base_url),
        }
    }
}

pub(crate) struct LlmClient {
    provider: LlmProvider,
}

struct StreamingRequestInput<'a>(&'a AiConfig, &'a [LlmMessage], bool);

pub(crate) struct ObservedLlmRequest<'a> {
    messages: Vec<LlmMessage>,
    strict_json: bool,
    window: &'a tauri::Window,
    run_id: &'a str,
    attempt_label: &'a str,
    cancel: CancellationToken,
}

impl<'a> ObservedLlmRequest<'a> {
    pub(crate) fn new(
        messages: Vec<LlmMessage>,
        strict_json: bool,
        window: &'a tauri::Window,
        run_id: &'a str,
        attempt_label: &'a str,
    ) -> Self {
        Self {
            messages,
            strict_json,
            window,
            run_id,
            attempt_label,
            cancel: CancellationToken::new(),
        }
    }

    pub(crate) fn with_cancel(mut self, cancel: CancellationToken) -> Self {
        self.cancel = cancel;
        self
    }
}

struct StreamingAttempt<'a, 'b> {
    surface: ApiSurface,
    observation: Option<&'a LlmObservation<'b>>,
    started_at: Instant,
}

impl LlmClient {
    pub(crate) fn from_config(config: &AiConfig) -> Self {
        Self {
            provider: match config.provider {
                AiProvider::OpenAi => LlmProvider::OpenAi,
                AiProvider::Anthropic => LlmProvider::Anthropic,
            },
        }
    }

    pub(crate) fn provider(&self) -> LlmProvider {
        self.provider
    }

    pub(crate) async fn complete_json_observed(
        &self,
        config: &AiConfig,
        request: ObservedLlmRequest<'_>,
    ) -> Result<LlmResponse, String> {
        let observation =
            LlmObservation::new(request.window, request.run_id, request.attempt_label);
        self.complete_json_inner(config, &request, Some(observation))
            .await
    }

    async fn complete_json_inner(
        &self,
        config: &AiConfig,
        request: &ObservedLlmRequest<'_>,
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
        let surface = api_surface_for(self.provider, config.compatible_protocol);
        self.complete_streaming_request(
            &client,
            StreamingRequestInput(config, &request.messages, request.strict_json),
            StreamingAttempt {
                surface,
                observation: observation.as_ref(),
                started_at,
            },
            &request.cancel,
        )
        .await
    }

    async fn complete_streaming_request(
        &self,
        client: &reqwest::Client,
        input: StreamingRequestInput<'_>,
        attempt: StreamingAttempt<'_, '_>,
        cancel: &CancellationToken,
    ) -> Result<LlmResponse, String> {
        let StreamingRequestInput(config, messages, strict_json) = input;
        let StreamingAttempt {
            surface,
            observation,
            started_at,
        } = attempt;
        let endpoint = surface.endpoint(&config.base_url)?;
        let request_body = match surface {
            ApiSurface::Responses => build_responses_request(config, messages, strict_json),
            ApiSurface::ChatCompletions => {
                build_chat_completions_request(config, messages, strict_json)
            }
            ApiSurface::AnthropicMessages => build_anthropic_messages_request(config, messages),
        };

        emit_observed_request(observation, surface, strict_json, &endpoint);
        let request = client.post(&endpoint).json(&request_body);
        let request = match surface {
            ApiSurface::AnthropicMessages => request
                .header("x-api-key", config.api_key.trim())
                .header("anthropic-version", "2023-06-01"),
            ApiSurface::Responses | ApiSurface::ChatCompletions => {
                request.bearer_auth(config.api_key.trim())
            }
        };
        let response = request.send().await.map_err(|error| {
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
        // 取消令牌触发时立即放弃读取（丢弃响应流即中断连接），返回哨兵错误。
        let read_result = tokio::select! {
            _ = cancel.cancelled() => Err(ai::AI_RUN_CANCELLED_MESSAGE.to_string()),
            result = read_sse_stream(
                response,
                surface,
                observation,
                &started_at,
                &mut accumulator,
            ) => result,
        };
        read_result?;
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

fn api_surface_for(provider: LlmProvider, protocol: AiCompatibleProtocol) -> ApiSurface {
    match provider {
        LlmProvider::OpenAi => match protocol {
            AiCompatibleProtocol::Responses => ApiSurface::Responses,
            AiCompatibleProtocol::ChatCompletions => ApiSurface::ChatCompletions,
        },
        LlmProvider::Anthropic => ApiSurface::AnthropicMessages,
    }
}

#[derive(Debug, Clone)]
pub(crate) struct LlmResponse {
    pub(crate) content: String,
    pub(crate) adapter_label: String,
    pub(crate) latency_ms: u64,
    pub(crate) usage: Option<LlmUsage>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn openai_chat_completions_protocol_selects_chat_surface_for_agent() {
        let config: AiConfig = serde_json::from_value(serde_json::json!({
            "provider": "openai",
            "base_url": "https://gateway.example/v1",
            "api_key": "secret",
            "model": "gateway-model",
            "compatible_protocol": "chat-completions"
        }))
        .unwrap();
        let client = LlmClient::from_config(&config);

        assert_eq!(client.provider().label(), "openai");
        assert_eq!(
            api_surface_for(client.provider(), config.compatible_protocol).label(),
            "chat-completions"
        );
    }
}
