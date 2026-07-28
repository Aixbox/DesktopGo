mod endpoint;
mod models;
mod operation;
mod policy;

pub use models::{
    AiChatMessageInput, AiChatResult, AiClassifyResult, AiConfig, AiGroup, AiIconInput,
};

pub(crate) use endpoint::{
    normalize_chat_completions_url, normalize_responses_url, validate_base_url,
    DEFAULT_REQUEST_TIMEOUT_SECS,
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
