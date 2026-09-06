mod endpoint;
pub(crate) mod models;
mod operation;
mod policy;
mod stream;

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tokio_util::sync::CancellationToken;

/// 用户主动停止生成时返回给前端的哨兵错误信息。
pub(crate) const AI_RUN_CANCELLED_MESSAGE: &str = "已停止生成。";

/// 正在运行的 AI 请求注册表：命令开始时登记取消令牌，命令结束（含报错）时自动移除。
#[derive(Default)]
pub struct AiRunRegistry {
    inner: Arc<Mutex<HashMap<String, CancellationToken>>>,
}

impl AiRunRegistry {
    pub(crate) fn register(&self, request_id: String) -> AiRunGuard {
        let token = CancellationToken::new();
        self.inner
            .lock()
            .expect("AI 运行注册表锁中毒")
            .insert(request_id.clone(), token.clone());
        AiRunGuard {
            registry: Arc::clone(&self.inner),
            request_id,
            token,
        }
    }
}

/// 持有某个运行请求的取消令牌；Drop 时自动从注册表移除。
pub struct AiRunGuard {
    registry: Arc<Mutex<HashMap<String, CancellationToken>>>,
    request_id: String,
    token: CancellationToken,
}

impl AiRunGuard {
    pub(crate) fn token(&self) -> CancellationToken {
        self.token.clone()
    }
}

impl Drop for AiRunGuard {
    fn drop(&mut self) {
        if let Ok(mut registry) = self.registry.lock() {
            registry.remove(&self.request_id);
        }
    }
}

#[tauri::command]
pub fn ai_cancel(
    registry: tauri::State<'_, AiRunRegistry>,
    request_id: String,
) -> Result<(), String> {
    if let Ok(registry) = registry.inner.lock() {
        if let Some(token) = registry.get(&request_id) {
            token.cancel();
        }
    }
    Ok(())
}

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

#[derive(Debug, Clone, Serialize)]
pub struct AiIconCategoryList {
    pub entries: Vec<crate::agent::icon_categories::AiIconCategoryEntry>,
}

/// 内置的「应用 → 分类」参考表，供设置页展示；用户条目存放在布局 KV
/// 并在运行时覆盖同名内置项。
#[tauri::command]
pub fn get_builtin_icon_categories() -> AiIconCategoryList {
    AiIconCategoryList {
        entries: crate::agent::icon_categories::builtin_icon_categories(),
    }
}

#[tauri::command]
pub async fn ai_chat(
    window: tauri::Window,
    registry: tauri::State<'_, AiRunRegistry>,
    request_id: String,
    config: AiConfig,
    messages: Vec<AiChatMessageInput>,
) -> Result<AiChatResult, String> {
    let guard = registry.register(request_id);
    operation::chat(&window, guard.token(), config, messages).await
}
