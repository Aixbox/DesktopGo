use std::time::Duration;

use serde::{Deserialize, Serialize};

pub(crate) const DEFAULT_REQUEST_TIMEOUT_SECS: u64 = 45;
pub(crate) const CHAT_COMPLETIONS_PATH: &str = "chat/completions";
pub(crate) const RESPONSES_PATH: &str = "responses";

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
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "folderSize", alias = "size")]
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

// --- OpenAI 兼容请求/响应结构 ---

#[derive(Serialize)]
struct ChatMessage<'a> {
    role: &'a str,
    content: String,
}

#[derive(Serialize)]
struct ResponseFormat {
    #[serde(rename = "type")]
    kind: &'static str,
}

#[derive(Serialize)]
struct ChatRequest<'a> {
    model: &'a str,
    messages: Vec<ChatMessage<'a>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    response_format: Option<ResponseFormat>,
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

pub(crate) fn build_system_prompt(custom_prompt: Option<&str>) -> String {
    let base = "你是一个桌面图标整理助手。用户会给你一个图标清单（JSON 数组），每个元素有 key、name、target_leaf、item_type。\
请按照软件的用途/类别把这些图标分组（例如：浏览器、开发工具、办公、社交、游戏、媒体、系统工具等）。\
分组要求：\
1. 只能使用清单里出现过的 key，不要编造 key；\
2. 每个 key 最多只能出现在一个分组里；\
3. 每个分组至少包含 2 个图标，单独的图标不要建组；\
4. folderName 用简短的中文类别名；\
5. 每个分组必须给出 folderSize，只能是 \"1x1\"、\"1x2\"、\"2x1\"、\"2x2\"。请根据分组重要性、图标数量和用户要求选择视觉尺寸：小而确定的组用 1x1，纵向/流程类可用 1x2，横向常用组可用 2x1，大型或高优先级组用 2x2；\
6. 不确定归类的图标可以不放进任何分组。\
只输出 JSON 对象，格式为：{\"groups\":[{\"folderName\":\"类别名\",\"iconKeys\":[\"key1\",\"key2\"],\"folderSize\":\"1x1\"}]}，不要输出任何额外文字或解释。";

    match custom_prompt {
        Some(extra) if !extra.trim().is_empty() => {
            format!("{base}\n\n用户附加要求：{}", extra.trim())
        }
        _ => base.to_string(),
    }
}

fn normalize_endpoint_url(base_url: &str, endpoint_path: &str) -> Result<String, String> {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("AI 接口地址（Base URL）不能为空。".to_string());
    }
    if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
        return Err("AI 接口地址必须以 http:// 或 https:// 开头。".to_string());
    }
    if trimmed.ends_with(CHAT_COMPLETIONS_PATH) {
        Ok(format!(
            "{}{}",
            trimmed.trim_end_matches(CHAT_COMPLETIONS_PATH),
            endpoint_path
        ))
    } else if trimmed.ends_with(RESPONSES_PATH) {
        Ok(format!(
            "{}{}",
            trimmed.trim_end_matches(RESPONSES_PATH),
            endpoint_path
        ))
    } else {
        Ok(format!("{trimmed}/{endpoint_path}"))
    }
}

pub(crate) fn normalize_chat_completions_url(base_url: &str) -> Result<String, String> {
    normalize_endpoint_url(base_url, CHAT_COMPLETIONS_PATH)
}

pub(crate) fn normalize_responses_url(base_url: &str) -> Result<String, String> {
    normalize_endpoint_url(base_url, RESPONSES_PATH)
}

pub(crate) fn validate_base_url(base_url: &str) -> Result<(), String> {
    normalize_endpoint_url(base_url, RESPONSES_PATH).map(|_| ())
}

/// 从模型返回文本里提取 JSON。优先直接解析，失败再尝试截取首尾大括号之间的内容，
/// 兼容个别模型在 JSON 外面包了多余文字的情况。
pub(crate) fn parse_model_payload(content: &str) -> Result<ModelGroupsPayload, String> {
    let trimmed = content.trim();
    if let Ok(parsed) = serde_json::from_str::<ModelGroupsPayload>(trimmed) {
        return Ok(parsed);
    }

    let start = trimmed.find('{');
    let end = trimmed.rfind('}');
    if let (Some(start), Some(end)) = (start, end) {
        if end > start {
            if let Ok(parsed) = serde_json::from_str::<ModelGroupsPayload>(&trimmed[start..=end]) {
                return Ok(parsed);
            }
        }
    }

    Err("AI 返回的内容不是预期的 JSON 分组格式，请重试或更换模型。".to_string())
}

pub(crate) fn normalize_folder_size(value: Option<String>) -> Option<String> {
    let value = value?.trim().to_string();
    match value.as_str() {
        "1x1" | "1x2" | "2x1" | "2x2" => Some(value),
        _ => None,
    }
}

/// 校验并清洗模型返回的分组：去除非法 key、去重、过滤不足 2 项的分组，
/// 未被分组的 key 收集到 leftover。
pub(crate) fn sanitize_groups(
    payload: ModelGroupsPayload,
    icons: &[AiIconInput],
) -> AiClassifyResult {
    let valid_keys: std::collections::HashSet<&str> =
        icons.iter().map(|icon| icon.key.as_str()).collect();
    let mut consumed: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut groups: Vec<AiGroup> = Vec::new();

    for group in payload.groups {
        let mut icon_keys: Vec<String> = Vec::new();
        for key in group.icon_keys {
            if !valid_keys.contains(key.as_str()) {
                continue;
            }
            if consumed.contains(&key) {
                continue;
            }
            consumed.insert(key.clone());
            icon_keys.push(key);
        }

        if icon_keys.len() < 2 {
            // 不足 2 项的分组解散，成员退回 leftover。
            for key in icon_keys {
                consumed.remove(&key);
            }
            continue;
        }

        let folder_name = if group.folder_name.trim().is_empty() {
            "未命名分组".to_string()
        } else {
            group.folder_name.trim().to_string()
        };

        groups.push(AiGroup {
            folder_name,
            icon_keys,
            folder_size: normalize_folder_size(group.folder_size),
        });
    }

    let leftover: Vec<String> = icons
        .iter()
        .map(|icon| icon.key.clone())
        .filter(|key| !consumed.contains(key))
        .collect();

    AiClassifyResult { groups, leftover }
}

#[tauri::command]
pub async fn ai_classify_icons(
    config: AiConfig,
    icons: Vec<AiIconInput>,
) -> Result<AiClassifyResult, String> {
    if config.api_key.trim().is_empty() {
        return Err("尚未配置 API Key，请先在设置页填写 AI 配置。".to_string());
    }
    if config.model.trim().is_empty() {
        return Err("尚未配置模型名称，请先在设置页填写 AI 配置。".to_string());
    }
    if icons.is_empty() {
        return Ok(AiClassifyResult {
            groups: Vec::new(),
            leftover: Vec::new(),
        });
    }

    let endpoint = normalize_chat_completions_url(&config.base_url)?;
    let system_prompt = build_system_prompt(config.custom_prompt.as_deref());
    let user_payload =
        serde_json::to_string(&icons).map_err(|error| format!("序列化图标清单失败：{error}"))?;

    let request_body = ChatRequest {
        model: config.model.trim(),
        messages: vec![
            ChatMessage {
                role: "system",
                content: system_prompt,
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

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(DEFAULT_REQUEST_TIMEOUT_SECS))
        .build()
        .map_err(|error| format!("初始化网络客户端失败：{error}"))?;

    let response = client
        .post(&endpoint)
        .bearer_auth(config.api_key.trim())
        .json(&request_body)
        .send()
        .await
        .map_err(|error| format!("请求 AI 接口失败：{error}"))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| format!("读取 AI 接口响应失败：{error}"))?;

    if !status.is_success() {
        // 不回显完整 body 里可能包含的敏感细节，仅给出状态码与截断信息。
        let snippet: String = body.chars().take(300).collect();
        return Err(format!(
            "AI 接口返回错误状态 {}：{}",
            status.as_u16(),
            snippet
        ));
    }

    let parsed: ChatResponse =
        serde_json::from_str(&body).map_err(|error| format!("解析 AI 接口响应失败：{error}"))?;

    let content = parsed
        .choices
        .into_iter()
        .next()
        .and_then(|choice| choice.message)
        .and_then(|message| message.content)
        .ok_or_else(|| "AI 接口未返回有效内容。".to_string())?;

    let payload = parse_model_payload(&content)?;
    Ok(sanitize_groups(payload, &icons))
}

#[tauri::command]
pub async fn ai_chat(
    config: AiConfig,
    messages: Vec<AiChatMessageInput>,
) -> Result<AiChatResult, String> {
    if config.api_key.trim().is_empty() {
        return Err("尚未配置 API Key，请先在设置页填写 AI 配置。".to_string());
    }
    if config.model.trim().is_empty() {
        return Err("尚未配置模型名称，请先在设置页填写 AI 配置。".to_string());
    }

    let endpoint = normalize_chat_completions_url(&config.base_url)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(DEFAULT_REQUEST_TIMEOUT_SECS))
        .build()
        .map_err(|error| format!("初始化 AI 客户端失败：{error}"))?;

    let mut request_messages = vec![ChatMessage {
        role: "system",
        content: "你是 DesktopGo 的桌面整理助手。默认进行自然、简洁的上下文对话；不要擅自生成图标布局或声称已经整理桌面。只有用户明确使用整理图标指令时，应用才会进入整理流程。"
            .to_string(),
    }];

    if let Some(extra) = config.custom_prompt.as_deref().filter(|value| !value.trim().is_empty()) {
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

    let request_body = ChatRequest {
        model: config.model.trim(),
        messages: request_messages,
        temperature: config.temperature,
        response_format: None,
    };

    let response = client
        .post(&endpoint)
        .bearer_auth(config.api_key.trim())
        .json(&request_body)
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
    let content = parsed
        .choices
        .into_iter()
        .next()
        .and_then(|choice| choice.message)
        .and_then(|message| message.content)
        .map(|content| content.trim().to_string())
        .filter(|content| !content.is_empty())
        .ok_or_else(|| "AI 接口未返回有效内容。".to_string())?;

    Ok(AiChatResult { content })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn icon(key: &str) -> AiIconInput {
        AiIconInput {
            key: key.to_string(),
            name: key.to_string(),
            target_leaf: String::new(),
            item_type: String::new(),
        }
    }

    #[test]
    fn normalize_chat_url_appends_path() {
        assert_eq!(
            normalize_chat_completions_url("https://api.openai.com/v1/").unwrap(),
            "https://api.openai.com/v1/chat/completions"
        );
    }

    #[test]
    fn normalize_chat_url_accepts_full_chat_endpoint() {
        assert_eq!(
            normalize_chat_completions_url("https://gateway.example.com/v1/chat/completions")
                .unwrap(),
            "https://gateway.example.com/v1/chat/completions"
        );
    }

    #[test]
    fn normalize_responses_url_rewrites_full_chat_endpoint() {
        assert_eq!(
            normalize_responses_url("https://gateway.example.com/v1/chat/completions").unwrap(),
            "https://gateway.example.com/v1/responses"
        );
    }

    #[test]
    fn normalize_endpoint_url_rejects_non_http() {
        assert!(normalize_chat_completions_url("ftp://example.com").is_err());
        assert!(normalize_responses_url("  ").is_err());
    }

    #[test]
    fn parse_model_payload_handles_wrapped_text() {
        let content =
            "好的，结果如下：{\"groups\":[{\"folderName\":\"浏览器\",\"iconKeys\":[\"a\",\"b\"]}]}";
        let payload = parse_model_payload(content).unwrap();
        assert_eq!(payload.groups.len(), 1);
        assert_eq!(payload.groups[0].folder_name, "浏览器");
        assert_eq!(payload.groups[0].folder_size, None);
    }

    #[test]
    fn parse_model_payload_accepts_folder_size() {
        let content = "{\"groups\":[{\"folderName\":\"开发工具\",\"iconKeys\":[\"a\",\"b\"],\"folderSize\":\"2x1\"}]}";
        let payload = parse_model_payload(content).unwrap();
        assert_eq!(payload.groups[0].folder_size, Some("2x1".to_string()));
    }

    #[test]
    fn sanitize_drops_invalid_keys_and_small_groups() {
        let icons = vec![icon("a"), icon("b"), icon("c"), icon("d")];
        let payload = ModelGroupsPayload {
            groups: vec![
                ModelGroup {
                    folder_name: "组1".to_string(),
                    icon_keys: vec![
                        "a".to_string(),
                        "b".to_string(),
                        "ghost".to_string(),
                        "a".to_string(),
                    ],
                    folder_size: Some("2x1".to_string()),
                },
                ModelGroup {
                    folder_name: "组2".to_string(),
                    icon_keys: vec!["c".to_string()], // 不足 2 项，应解散
                    folder_size: Some("2x2".to_string()),
                },
            ],
        };

        let result = sanitize_groups(payload, &icons);
        assert_eq!(result.groups.len(), 1);
        assert_eq!(result.groups[0].icon_keys, vec!["a", "b"]);
        assert_eq!(result.groups[0].folder_size, Some("2x1".to_string()));
        let mut leftover = result.leftover.clone();
        leftover.sort();
        assert_eq!(leftover, vec!["c".to_string(), "d".to_string()]);
    }

    #[test]
    fn sanitize_uses_fallback_folder_name() {
        let icons = vec![icon("a"), icon("b")];
        let payload = ModelGroupsPayload {
            groups: vec![ModelGroup {
                folder_name: "   ".to_string(),
                icon_keys: vec!["a".to_string(), "b".to_string()],
                folder_size: Some("huge".to_string()),
            }],
        };
        let result = sanitize_groups(payload, &icons);
        assert_eq!(result.groups[0].folder_name, "未命名分组");
        assert_eq!(result.groups[0].folder_size, None);
    }
}
