use serde::{Deserialize, Serialize};

/// 用户在设置页配置的 AI 接入信息。请求集中在 Rust 侧发出，
/// 这样既能绕过 webview 的 CORS 限制，也避免把 api_key 暴露在前端页面上下文里。
#[derive(Debug, Clone, Deserialize)]
pub struct AiConfig {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    #[serde(default)]
    pub custom_prompt: Option<String>,
    #[serde(default)]
    pub temperature: Option<f32>,
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

#[derive(Serialize)]
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
}

#[derive(Deserialize)]
pub(super) struct ChatResponseMessage {
    #[serde(default)]
    pub(super) content: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct ChatResponseChoice {
    #[serde(default)]
    pub(super) message: Option<ChatResponseMessage>,
}

#[derive(Deserialize)]
pub(super) struct ChatResponse {
    #[serde(default)]
    pub(super) choices: Vec<ChatResponseChoice>,
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
