use serde::{Deserialize, Serialize};

/// 用户在设置页配置的 AI 接入信息。请求集中在 Rust 侧发出，
/// 这样既能绕过 webview 的 CORS 限制，也避免把 api_key 暴露在前端页面上下文里。
#[derive(Debug, Clone, Deserialize)]
pub struct AiConfig {
    #[serde(default)]
    pub provider: AiProvider,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    #[serde(default)]
    pub custom_prompt: Option<String>,
    #[serde(default)]
    pub temperature: Option<f32>,
    #[serde(default)]
    pub compatible_protocol: AiCompatibleProtocol,
    #[serde(default)]
    pub reasoning_effort: AiReasoningEffort,
}

#[derive(Debug, Clone, Copy, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum AiProvider {
    #[serde(rename = "openai", alias = "openai-compatible")]
    #[default]
    OpenAi,
    Anthropic,
}

#[derive(Debug, Clone, Copy, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum AiCompatibleProtocol {
    #[default]
    Responses,
    ChatCompletions,
}

#[derive(Debug, Clone, Copy, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum AiReasoningEffort {
    #[default]
    None,
    Low,
    Medium,
    High,
}

impl AiReasoningEffort {
    pub(crate) fn as_openai_value(self) -> Option<&'static str> {
        match self {
            Self::None => None,
            Self::Low => Some("low"),
            Self::Medium => Some("medium"),
            Self::High => Some("high"),
        }
    }

    pub(crate) fn anthropic_thinking_budget(self) -> Option<u32> {
        match self {
            Self::None => None,
            Self::Low => Some(1024),
            Self::Medium => Some(4096),
            Self::High => Some(8192),
        }
    }
}

/// 传给模型的单个图标信息。只暴露名称、目标叶子名和类型，
/// 不外传完整磁盘路径，既控制 token 也减少敏感信息外泄。
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AiIconInput {
    pub key: String,
    pub name: String,
    #[serde(default)]
    pub target_leaf: String,
    #[serde(default)]
    pub item_type: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AiGroup {
    pub folder_name: String,
    pub icon_keys: Vec<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "folderSize",
        alias = "size"
    )]
    pub folder_size: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AiClassifyResult {
    pub groups: Vec<AiGroup>,
    pub leftover: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AiChatMessageInput {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct AiChatResult {
    pub content: String,
}

#[derive(Clone, Serialize)]
pub(super) struct ChatMessage<'a> {
    pub(super) role: &'a str,
    pub(super) content: String,
}

#[derive(Serialize)]
pub(super) struct ResponseFormat {
    #[serde(rename = "type")]
    pub(super) kind: &'static str,
}

#[derive(Serialize)]
pub(super) struct ChatRequest<'a> {
    pub(super) model: &'a str,
    pub(super) messages: Vec<ChatMessage<'a>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) response_format: Option<ResponseFormat>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) reasoning_effort: Option<&'static str>,
}

#[derive(Serialize)]
pub(super) struct ResponsesRequest<'a> {
    pub(super) model: &'a str,
    pub(super) input: Vec<ChatMessage<'a>>,
    pub(super) stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) reasoning: Option<ResponsesReasoning>,
}

#[derive(Serialize)]
pub(super) struct ResponsesReasoning {
    pub(super) effort: &'static str,
}

#[derive(Serialize)]
pub(super) struct AnthropicThinking {
    #[serde(rename = "type")]
    pub(super) kind: &'static str,
    pub(super) budget_tokens: u32,
}

#[derive(Serialize)]
pub(super) struct AnthropicRequest<'a> {
    pub(super) model: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) system: Option<String>,
    pub(super) messages: Vec<ChatMessage<'a>>,
    pub(super) max_tokens: u32,
    pub(super) stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) thinking: Option<AnthropicThinking>,
}

/// 模型按约定返回的 JSON 结构。
#[derive(Deserialize)]
pub(crate) struct ModelGroupsPayload {
    #[serde(default)]
    pub(crate) groups: Vec<ModelGroup>,
}

#[derive(Deserialize)]
pub(crate) struct ModelGroup {
    #[serde(default, alias = "folderName", alias = "name")]
    pub(crate) folder_name: String,
    #[serde(default, alias = "iconKeys", alias = "keys")]
    pub(crate) icon_keys: Vec<String>,
    #[serde(default, alias = "folderSize", alias = "size")]
    pub(crate) folder_size: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_openai_compatible_provider_deserializes_as_openai() {
        let config: AiConfig = serde_json::from_value(serde_json::json!({
            "provider": "openai-compatible",
            "base_url": "https://gateway.example/v1",
            "api_key": "secret",
            "model": "gateway-model",
            "compatible_protocol": "chat-completions"
        }))
        .unwrap();

        assert_eq!(config.provider, AiProvider::OpenAi);
        assert_eq!(
            config.compatible_protocol,
            AiCompatibleProtocol::ChatCompletions
        );
    }
}
