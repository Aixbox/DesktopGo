use std::time::Duration;

use super::endpoint::{normalize_chat_completions_url, DEFAULT_REQUEST_TIMEOUT_SECS};
use super::models::{
    AiChatMessageInput, AiChatResult, AiClassifyResult, AiConfig, AiIconInput, ChatMessage,
    ChatRequest, ChatResponse, ResponseFormat,
};
use super::policy::{build_system_prompt, parse_model_payload, sanitize_groups};

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

    let endpoint = normalize_chat_completions_url(&config.base_url)?;
    let user_payload =
        serde_json::to_string(&icons).map_err(|error| format!("序列化图标清单失败：{error}"))?;
    let request_body = ChatRequest {
        model: config.model.trim(),
        messages: vec![
            ChatMessage {
                role: "system",
                content: build_system_prompt(config.custom_prompt.as_deref()),
            },
            ChatMessage {
                role: "user",
                content: format!("图标清单：\n{user_payload}"),
            },
        ],
        temperature: config.temperature,
        response_format: Some(ResponseFormat {
            kind: "json_object",
        }),
    };
    let client = build_client("初始化网络客户端失败")?;
    let content = execute_chat_request(&client, &endpoint, &config.api_key, &request_body).await?;
    let payload = parse_model_payload(&content)?;
    Ok(sanitize_groups(payload, &icons))
}

pub(super) async fn chat(
    config: AiConfig,
    messages: Vec<AiChatMessageInput>,
) -> Result<AiChatResult, String> {
    validate_config(&config)?;
    let endpoint = normalize_chat_completions_url(&config.base_url)?;
    let client = build_client("初始化 AI 客户端失败")?;
    let request_body = ChatRequest {
        model: config.model.trim(),
        messages: build_chat_messages(&config, messages),
        temperature: config.temperature,
        response_format: None,
    };
    let content = execute_chat_request(&client, &endpoint, &config.api_key, &request_body)
        .await?
        .trim()
        .to_string();
    if content.is_empty() {
        return Err("AI 接口未返回有效内容。".to_string());
    }
    Ok(AiChatResult { content })
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
) -> Vec<ChatMessage<'_>> {
    let mut request_messages = vec![ChatMessage {
        role: "system",
        content: "你是 DesktopGo 的桌面整理助手。默认进行自然、简洁的上下文对话；不要擅自生成图标布局或声称已经整理桌面。只有用户明确使用整理图标指令时，应用才会进入整理流程。"
            .to_string(),
    }];

    if let Some(extra) = config
        .custom_prompt
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        request_messages.push(ChatMessage {
            role: "system",
            content: format!("用户对助手的附加偏好：{}", extra.trim()),
        });
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
        request_messages.push(ChatMessage {
            role,
            content: message.content.trim().to_string(),
        });
    }

    request_messages
}

async fn execute_chat_request(
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
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| format!("读取 AI 接口响应失败：{error}"))?;

    if !status.is_success() {
        let snippet: String = body.chars().take(300).collect();
        return Err(format!(
            "AI 接口返回错误状态 {}：{}",
            status.as_u16(),
            snippet
        ));
    }

    let parsed: ChatResponse =
        serde_json::from_str(&body).map_err(|error| format!("解析 AI 接口响应失败：{error}"))?;
    parsed
        .choices
        .into_iter()
        .next()
        .and_then(|choice| choice.message)
        .and_then(|message| message.content)
        .ok_or_else(|| "AI 接口未返回有效内容。".to_string())
}
