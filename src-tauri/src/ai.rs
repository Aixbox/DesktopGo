mod endpoint;
pub(crate) mod models;
mod operation;
mod policy;
mod stream;

pub use models::{
    AiChatMessageInput, AiChatResult, AiClassifyResult, AiCompatibleProtocol, AiConfig, AiGroup,
    AiIconInput, AiProvider,
};

pub(crate) use endpoint::{
    normalize_anthropic_messages_url, normalize_chat_completions_url, normalize_responses_url,
    validate_base_url, DEFAULT_REQUEST_TIMEOUT_SECS,
};
pub(crate) use policy::{build_system_prompt, parse_model_payload, sanitize_groups};

#[tauri::command]
pub async fn ai_classify_icons(
    config: AiConfig,
    icons: Vec<AiIconInput>,
) -> Result<AiClassifyResult, String> {
    operation::classify_icons(config, icons).await
}

#[tauri::command]
pub async fn ai_chat(
    config: AiConfig,
    messages: Vec<AiChatMessageInput>,
) -> Result<AiChatResult, String> {
    operation::chat(config, messages).await
}
