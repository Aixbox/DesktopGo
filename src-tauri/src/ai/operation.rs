use std::time::Duration;

use tokio_util::sync::CancellationToken;
use uuid::Uuid;

use super::endpoint::{
    normalize_anthropic_messages_url, normalize_chat_completions_url, normalize_responses_url,
    DEFAULT_REQUEST_TIMEOUT_SECS,
};
use super::models::{
    AiChatMessageInput, AiChatResult, AiClassifyResult, AiCompatibleProtocol, AiConfig,
    AiIconInput, AiProvider, AnthropicRequest, AnthropicThinking, ChatMessage, ChatRequest,
    ResponseFormat, ResponsesReasoning, ResponsesRequest,
};
use super::policy::{build_system_prompt, parse_model_payload, sanitize_groups};
use super::stream::{read_anthropic_stream, read_chat_completions_stream, read_response_stream};
use crate::agent::llm::{LlmClient, LlmMessage, ObservedLlmRequest};

pub(super) async fn classify_icons(
    config: AiConfig,
    icons: Vec<AiIconInput>,
) -> Result<AiClassifyResult, String> {
    validate_config(&config)?;
    if icons.is_empty() {
        return Ok(AiClassifyResult {
            groups: Vec::new(),
            leftover: Vec::new(),
        });
    }

    let user_payload =
        serde_json::to_string(&icons).map_err(|error| format!("序列化图标清单失败：{error}"))?;
    let client = build_client("初始化网络客户端失败")?;
    let content = execute_streaming_request(
        &client,
        &config,
        vec![
            ChatMessage {
                role: "system",
                content: build_system_prompt(config.custom_prompt.as_deref()),
            },
            ChatMessage {
                role: "user",
                content: format!("图标清单：\n{user_payload}"),
            },
        ],
        true,
    )
    .await?;
    let payload = parse_model_payload(&content)?;
    Ok(sanitize_groups(payload, &icons))
}

pub(super) async fn chat(
    window: &tauri::Window,
    cancel: CancellationToken,
    config: AiConfig,
    messages: Vec<AiChatMessageInput>,
) -> Result<AiChatResult, String> {
    validate_config(&config)?;
    let request_messages = build_chat_messages(&config, messages);
    let client = LlmClient::from_config(&config);
    let run_id = format!("chat-{}", Uuid::new_v4());
    let observed =
        ObservedLlmRequest::new(request_messages, false, window, &run_id, "chat").with_cancel(cancel);
    let response = client.complete_json_observed(&config, observed).await?;
    let content = response.content.trim().to_string();
    if content.is_empty() {
        return Err("AI 接口未返回有效内容。".to_string());
    }
    Ok(AiChatResult { content })
}

fn build_responses_request<'a>(
    config: &'a AiConfig,
    messages: Vec<ChatMessage<'a>>,
) -> ResponsesRequest<'a> {
    ResponsesRequest {
        model: config.model.trim(),
        input: messages,
        stream: true,
        temperature: config.temperature,
        reasoning: config
            .reasoning_effort
            .as_openai_value()
            .map(|effort| ResponsesReasoning { effort }),
    }
}

fn build_chat_completions_request<'a>(
    config: &'a AiConfig,
    messages: Vec<ChatMessage<'a>>,
    strict_json: bool,
) -> ChatRequest<'a> {
    ChatRequest {
        model: config.model.trim(),
        messages,
        temperature: config.temperature,
        response_format: strict_json.then_some(ResponseFormat {
            kind: "json_object",
        }),
        reasoning_effort: config.reasoning_effort.as_openai_value(),
    }
}

fn build_anthropic_request<'a>(
    config: &'a AiConfig,
    messages: Vec<ChatMessage<'a>>,
) -> AnthropicRequest<'a> {
    let mut system = Vec::new();
    let mut anthropic_messages = Vec::new();
    for message in messages {
        if message.role == "system" {
            system.push(message.content);
        } else {
            anthropic_messages.push(message);
        }
    }
    let thinking_budget = config.reasoning_effort.anthropic_thinking_budget();
    AnthropicRequest {
        model: config.model.trim(),
        system: (!system.is_empty()).then(|| system.join("\n\n")),
        messages: anthropic_messages,
        max_tokens: thinking_budget.map_or(4096, |budget| budget + 4096),
        stream: true,
        thinking: thinking_budget.map(|budget_tokens| AnthropicThinking {
            kind: "enabled",
            budget_tokens,
        }),
    }
}

fn validate_config(config: &AiConfig) -> Result<(), String> {
    if config.api_key.trim().is_empty() {
        return Err("尚未配置 API Key，请先在设置页填写 AI 配置。".to_string());
    }
    if config.model.trim().is_empty() {
        return Err("尚未配置模型名称，请先在设置页填写 AI 配置。".to_string());
    }
    Ok(())
}

fn build_client(error_prefix: &str) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(DEFAULT_REQUEST_TIMEOUT_SECS))
        .build()
        .map_err(|error| format!("{error_prefix}：{error}"))
}

fn build_chat_messages(
    config: &AiConfig,
    messages: Vec<AiChatMessageInput>,
) -> Vec<LlmMessage> {
    let mut request_messages = vec![LlmMessage::new(
        "system",
        "你是 DesktopGo 的桌面整理助手。默认进行自然、简洁的上下文对话；不要擅自生成图标布局或声称已经整理桌面。只有用户明确使用整理图标指令时，应用才会进入整理流程。",
    )];

    if let Some(extra) = config
        .custom_prompt
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        request_messages.push(LlmMessage::new(
            "system",
            format!("用户对助手的附加偏好：{}", extra.trim()),
        ));
    }

    for message in messages
        .into_iter()
        .filter(|message| !message.content.trim().is_empty())
        .rev()
        .take(12)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
    {
        let role = if message.role == "assistant" {
            "assistant"
        } else {
            "user"
        };
        request_messages.push(LlmMessage::new(role, message.content.trim().to_string()));
    }

    request_messages
}

async fn execute_streaming_request(
    client: &reqwest::Client,
    config: &AiConfig,
    messages: Vec<ChatMessage<'_>>,
    strict_json: bool,
) -> Result<String, String> {
    match config.provider {
        AiProvider::OpenAi => match openai_stream_surface(config) {
            AiCompatibleProtocol::Responses => {
                let endpoint = normalize_responses_url(&config.base_url)?;
                let request_body = build_responses_request(config, messages);
                execute_response_stream_request(client, &endpoint, &config.api_key, &request_body)
                    .await
            }
            AiCompatibleProtocol::ChatCompletions => {
                let endpoint = normalize_chat_completions_url(&config.base_url)?;
                let request_body = build_chat_completions_request(config, messages, strict_json);
                execute_chat_completions_stream_request(
                    client,
                    &endpoint,
                    &config.api_key,
                    &request_body,
                )
                .await
            }
        },
        AiProvider::Anthropic => {
            let endpoint = normalize_anthropic_messages_url(&config.base_url)?;
            let request_body = build_anthropic_request(config, messages);
            execute_anthropic_stream_request(client, &endpoint, &config.api_key, &request_body)
                .await
        }
    }
}

fn openai_stream_surface(config: &AiConfig) -> AiCompatibleProtocol {
    config.compatible_protocol
}

async fn execute_response_stream_request(
    client: &reqwest::Client,
    endpoint: &str,
    api_key: &str,
    request_body: &ResponsesRequest<'_>,
) -> Result<String, String> {
    let response = client
        .post(endpoint)
        .bearer_auth(api_key.trim())
        .json(request_body)
        .send()
        .await
        .map_err(|error| format!("请求 AI 接口失败：{error}"))?;
    let status = response.status();
    if !status.is_success() {
        let body = response
            .text()
            .await
            .map_err(|error| format!("读取 AI 接口响应失败：{error}"))?;
        let snippet: String = body.chars().take(300).collect();
        return Err(format!(
            "AI 接口返回错误状态 {}：{}",
            status.as_u16(),
            snippet
        ));
    }
    read_response_stream(response).await
}

async fn execute_chat_completions_stream_request(
    client: &reqwest::Client,
    endpoint: &str,
    api_key: &str,
    request_body: &ChatRequest<'_>,
) -> Result<String, String> {
    let response = client
        .post(endpoint)
        .bearer_auth(api_key.trim())
        .json(request_body)
        .send()
        .await
        .map_err(|error| format!("请求 AI 接口失败：{error}"))?;
    let response = ensure_success(response).await?;
    read_chat_completions_stream(response).await
}

async fn execute_anthropic_stream_request(
    client: &reqwest::Client,
    endpoint: &str,
    api_key: &str,
    request_body: &AnthropicRequest<'_>,
) -> Result<String, String> {
    let response = client
        .post(endpoint)
        .header("x-api-key", api_key.trim())
        .header("anthropic-version", "2023-06-01")
        .json(request_body)
        .send()
        .await
        .map_err(|error| format!("请求 Anthropic 接口失败：{error}"))?;
    let response = ensure_success(response).await?;
    read_anthropic_stream(response).await
}

async fn ensure_success(response: reqwest::Response) -> Result<reqwest::Response, String> {
    let status = response.status();
    if status.is_success() {
        return Ok(response);
    }
    let body = response
        .text()
        .await
        .map_err(|error| format!("读取 AI 接口响应失败：{error}"))?;
    let snippet: String = body.chars().take(300).collect();
    Err(format!(
        "AI 接口返回错误状态 {}：{}",
        status.as_u16(),
        snippet
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config() -> AiConfig {
        AiConfig {
            provider: AiProvider::OpenAi,
            base_url: "https://api.openai.com/v1".to_string(),
            api_key: "secret".to_string(),
            model: "test-model".to_string(),
            custom_prompt: None,
            temperature: Some(0.25),
            compatible_protocol: AiCompatibleProtocol::Responses,
            reasoning_effort: super::super::models::AiReasoningEffort::Medium,
        }
    }

    #[test]
    fn responses_chat_request_uses_input_stream_and_no_chat_fields() {
        let body = serde_json::to_value(build_responses_request(
            &config(),
            vec![ChatMessage {
                role: "user",
                content: "hello".to_string(),
            }],
        ))
        .unwrap();
        assert_eq!(body["model"], "test-model");
        assert_eq!(body["stream"], true);
        assert_eq!(body["input"][0]["role"], "user");
        assert_eq!(body["input"][0]["content"], "hello");
        assert_eq!(body["reasoning"]["effort"], "medium");
        assert!(body.get("messages").is_none());
        assert!(body.get("response_format").is_none());
    }

    #[test]
    fn openai_chat_completions_protocol_selects_chat_surface() {
        let mut config = config();
        config.compatible_protocol = AiCompatibleProtocol::ChatCompletions;

        assert_eq!(
            openai_stream_surface(&config),
            AiCompatibleProtocol::ChatCompletions
        );
        assert_eq!(
            normalize_chat_completions_url(&config.base_url).unwrap(),
            "https://api.openai.com/v1/chat/completions"
        );
    }
}
