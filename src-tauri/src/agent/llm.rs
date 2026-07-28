mod observation;
mod request;
mod stream;

use std::time::{Duration, Instant};

use serde::Serialize;

use crate::ai::{self, AiConfig, DEFAULT_REQUEST_TIMEOUT_SECS};

use observation::{
    emit_observed_error, emit_observed_fallback, emit_observed_request, emit_observed_response,
    LlmObservation,
};
use request::{build_chat_completions_request, build_responses_request};
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

struct StreamingRequestInput<'a>(&'a AiConfig, &'a [LlmMessage], bool);

pub(crate) struct ObservedLlmRequest<'a> {
    messages: Vec<LlmMessage>,
    strict_json: bool,
    window: &'a tauri::Window,
    run_id: &'a str,
    attempt_label: &'a str,
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
        }
    }
}

struct StreamingAttempt<'a, 'b> {
    surface: ApiSurface,
    observation: Option<&'a LlmObservation<'b>>,
    started_at: Instant,
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
        request: ObservedLlmRequest<'_>,
    ) -> Result<LlmResponse, String> {
        let observation =
            LlmObservation::new(request.window, request.run_id, request.attempt_label);
        self.complete_json_inner(
            config,
            &request.messages,
            request.strict_json,
            Some(observation),
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
                    &client,
                    StreamingRequestInput(config, messages, strict_json),
                    StreamingAttempt {
                        surface: ApiSurface::ChatCompletions,
                        observation: observation.as_ref(),
                        started_at,
                    },
                )
                .await;
        }

        match self
            .complete_streaming_request(
                &client,
                StreamingRequestInput(config, messages, strict_json),
                StreamingAttempt {
                    surface: ApiSurface::Responses,
                    observation: observation.as_ref(),
                    started_at,
                },
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
                    &client,
                    StreamingRequestInput(config, messages, strict_json),
                    StreamingAttempt {
                        surface: ApiSurface::ChatCompletions,
                        observation: observation.as_ref(),
                        started_at,
                    },
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
        client: &reqwest::Client,
        input: StreamingRequestInput<'_>,
        attempt: StreamingAttempt<'_, '_>,
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

#[derive(Debug, Clone)]
pub(crate) struct LlmResponse {
    pub(crate) content: String,
    pub(crate) adapter_label: String,
    pub(crate) latency_ms: u64,
    pub(crate) usage: Option<LlmUsage>,
}
