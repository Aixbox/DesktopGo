//! 多轮对话 agent 循环。
//!
//! 与单次问答不同，这里模型可以在给出最终回答前调用工具：
//! 思考 → 输出工具请求 JSON → 后端执行并把结果喂回 → 继续思考 → …… → 最终回答。
//! 每一轮推理通过既有的事件通道流式推送；工具边界（toolCall/toolResult 事件）
//! 是前端切分思考分段（ChainOfThought）的依据。

use serde_json::{json, Value};
use tauri::Manager;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

use crate::agent::event::{emit_agent_event, AgentEvent, AgentEventPhase};
use crate::agent::llm::{LlmClient, LlmMessage, ObservedLlmRequest};
use crate::agent::memory;
use crate::ai::models::{AiChatMessageInput, AiClassifyResult, AiConfig, AiIconInput};
use crate::ai::parse_model_payload;
use crate::ai::sanitize_groups;
use crate::icons::get_icons;

pub(crate) const LIST_ICONS_TOOL: &str = "list_icons";
pub(crate) const ORGANIZE_ICONS_TOOL: &str = "organize_icons";
const MAX_AGENT_TURNS: usize = 4;
const MAX_LIST_ICONS: usize = 120;
const MAX_TOOL_RESULT_CHARS: usize = 4000;

pub(crate) struct ChatAgentOutcome {
    pub content: String,
    pub groups: Vec<crate::ai::models::AiGroup>,
    pub leftover: Vec<String>,
    /// 对话中通过 organize_icons 工具生成布局预览时，携带本次运行的 id。
    pub organize_run_id: Option<String>,
}

struct ToolRequest {
    name: String,
    args: Value,
}

/// 单次 agent 会话的共享上下文：窗口、配置、运行 ID 与图标清单。
struct ChatAgentContext<'a> {
    window: &'a tauri::Window,
    app_handle: &'a tauri::AppHandle,
    config: &'a AiConfig,
    run_id: &'a str,
    icons: &'a [AiIconInput],
}

impl ChatAgentContext<'_> {
    fn emit_tool_event(
        &self,
        phase: AgentEventPhase,
        tool_name: &str,
        message: &str,
        detail: &str,
    ) {
        let detail = if detail.chars().count() > MAX_TOOL_RESULT_CHARS {
            let truncated: String = detail.chars().take(MAX_TOOL_RESULT_CHARS).collect();
            format!("{truncated}…")
        } else {
            detail.to_string()
        };
        emit_agent_event(
            self.window,
            AgentEvent::new(self.run_id, phase, message)
                .detail(detail)
                .tool_name(tool_name),
        );
    }
}

/// 执行多轮对话 agent：每轮一次流式模型调用；模型输出工具请求 JSON 时
/// 执行工具并把结果回填，继续下一轮，直到给出最终回答或轮次耗尽。
pub(crate) async fn run_chat_agent(
    window: &tauri::Window,
    cancel: CancellationToken,
    config: &AiConfig,
    history: Vec<AiChatMessageInput>,
) -> Result<ChatAgentOutcome, String> {
    let run_id = format!("chat-{}", Uuid::new_v4());
    let app_handle = window.app_handle().clone();
    let client = LlmClient::from_config(config);
    let icons = load_agent_icons(&app_handle);
    let context = ChatAgentContext {
        window,
        app_handle: &app_handle,
        config,
        run_id: &run_id,
        icons: &icons,
    };

    let mut loop_messages = build_agent_messages(config, history);
    let mut pending_organize: Option<AiClassifyResult> = None;
    let mut last_content = String::new();

    for turn in 0..MAX_AGENT_TURNS {
        let response = client
            .complete_json_observed(
                config,
                ObservedLlmRequest::new(
                    loop_messages.clone(),
                    false,
                    window,
                    &run_id,
                    if turn == 0 {
                        "对话推理"
                    } else {
                        "对话推理（工具后续轮）"
                    },
                )
                .with_cancel(cancel.clone()),
            )
            .await?;
        let content = response.content.trim().to_string();

        let Some(tool_request) = parse_tool_request(&content) else {
            if content.is_empty() {
                return Err("AI 接口未返回有效内容。".to_string());
            }
            return Ok(build_outcome(content, pending_organize, &run_id));
        };
        last_content = content.clone();

        context.emit_tool_event(
            AgentEventPhase::ToolCall,
            &tool_request.name,
            "调用工具。",
            &tool_request.args.to_string(),
        );
        let tool_result = execute_tool(&context, &tool_request, &mut pending_organize);
        context.emit_tool_event(
            AgentEventPhase::ToolResult,
            &tool_request.name,
            "工具执行完成。",
            &tool_result,
        );

        loop_messages.push(LlmMessage::new("assistant", content));
        loop_messages.push(LlmMessage::new(
            "user",
            format!("工具 {} 执行结果：\n{}", tool_request.name, tool_result),
        ));
    }

    // 轮次耗尽仍以工具请求收尾时，不能把 JSON 当回答展示。
    if parse_tool_request(&last_content).is_some() {
        last_content = "本轮工具调用次数已达上限，请继续对话或换个说法。".to_string();
    }
    Ok(build_outcome(last_content, pending_organize, &run_id))
}

fn build_outcome(
    content: String,
    pending_organize: Option<AiClassifyResult>,
    run_id: &str,
) -> ChatAgentOutcome {
    let organize_run_id = pending_organize.as_ref().map(|_| run_id.to_string());
    let (groups, leftover) = pending_organize
        .map(|result| (result.groups, result.leftover))
        .unwrap_or_default();
    ChatAgentOutcome {
        content,
        groups,
        leftover,
        organize_run_id,
    }
}

fn parse_tool_request(content: &str) -> Option<ToolRequest> {
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return None;
    }
    let mut candidates = vec![strip_code_fence(trimmed).to_string()];
    if let Some(extracted) = extract_json_object(trimmed) {
        candidates.push(extracted);
    }
    for candidate in candidates {
        let Ok(value) = serde_json::from_str::<Value>(&candidate) else {
            continue;
        };
        let Some(name) = value.get("tool").and_then(Value::as_str) else {
            continue;
        };
        let name = name.trim().to_string();
        if name.is_empty() {
            continue;
        }
        return Some(ToolRequest {
            name,
            args: value.get("args").cloned().unwrap_or(Value::Null),
        });
    }
    None
}

fn strip_code_fence(content: &str) -> &str {
    let trimmed = content.trim();
    let Some(rest) = trimmed.strip_prefix("```") else {
        return trimmed;
    };
    let rest = rest.trim_start_matches(|c: char| c.is_ascii_alphanumeric());
    let rest = rest.trim_start_matches(['\r', '\n']);
    let Some(end) = rest.rfind("```") else {
        return rest.trim_end();
    };
    rest[..end].trim()
}

/// 从混有其他文字的内容中框出最外层的 JSON 对象，容忍模型在 JSON 前后附带说明。
fn extract_json_object(content: &str) -> Option<String> {
    let start = content.find('{')?;
    let end = content.rfind('}')?;
    if end < start {
        return None;
    }
    Some(content[start..=end].to_string())
}

fn execute_tool(
    context: &ChatAgentContext<'_>,
    request: &ToolRequest,
    pending_organize: &mut Option<AiClassifyResult>,
) -> String {
    match request.name.as_str() {
        LIST_ICONS_TOOL => tool_list_icons(context, request),
        ORGANIZE_ICONS_TOOL => tool_organize_icons(context, request, pending_organize),
        other => tool_error_json(&format!("未知工具：{other}")),
    }
}

fn tool_list_icons(context: &ChatAgentContext<'_>, request: &ToolRequest) -> String {
    let keyword = request
        .args
        .get("keyword")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_lowercase);
    let all_icons = get_icons(context.app_handle.clone(), 32);
    let matched: Vec<&_> = all_icons
        .iter()
        .filter(|icon| {
            keyword.as_ref().is_none_or(|keyword| {
                icon.name.to_lowercase().contains(keyword)
                    || icon.path.to_lowercase().contains(keyword)
            })
        })
        .collect();
    let total = matched.len();
    let items: Vec<Value> = matched
        .iter()
        .take(MAX_LIST_ICONS)
        .map(|icon| {
            json!({
                "id": icon.id,
                "name": icon.name,
                "type": icon.item_type,
                "path": icon.path,
            })
        })
        .collect();
    json!({
        "total": total,
        "truncated": total > items.len(),
        "icons": items,
    })
    .to_string()
}

fn tool_organize_icons(
    context: &ChatAgentContext<'_>,
    request: &ToolRequest,
    pending_organize: &mut Option<AiClassifyResult>,
) -> String {
    let Some(groups_value) = request.args.get("groups").cloned() else {
        return tool_error_json("缺少 groups 参数。");
    };
    let payload_text = match serde_json::to_string(&json!({ "groups": groups_value })) {
        Ok(text) => text,
        Err(error) => return tool_error_json(&format!("groups 参数无法解析：{error}")),
    };
    let payload = match parse_model_payload(&payload_text) {
        Ok(payload) => payload,
        Err(error) => return tool_error_json(&format!("分组格式不合法：{error}")),
    };
    let result = sanitize_groups(payload, context.icons);
    if result.groups.is_empty() {
        return tool_error_json(
            "没有得到有效分组：每组至少需要 2 个有效图标 ID，请先用 list_icons 确认。",
        );
    }

    let grouped_count: usize = result
        .groups
        .iter()
        .map(|group| group.icon_keys.len())
        .sum();
    let config = context.config;
    memory::save_draft(
        context.app_handle,
        memory::DraftRecordInput {
            run_id: context.run_id,
            model: &config.model,
            custom_prompt: config.custom_prompt.as_deref(),
            result: &result,
            icons: context.icons,
        },
    )
    .unwrap_or_else(|error| {
        use tauri::Emitter;
        let _ = context.app_handle.emit(
            crate::agent::event::AI_ORGANIZE_AGENT_EVENT,
            AgentEvent::new(
                context.run_id,
                AgentEventPhase::Error,
                "整理草稿保存失败，但本次结果仍可预览。",
            )
            .detail(error),
        );
    });
    {
        use tauri::Emitter;
        let _ = context.app_handle.emit(
            crate::agent::event::AI_ORGANIZE_AGENT_EVENT,
            AgentEvent::new(
                context.run_id,
                AgentEventPhase::Draft,
                format!("整理草稿已生成：{} 个分组。", result.groups.len()),
            ),
        );
    }

    let summary = json!({
        "ok": true,
        "message": format!(
            "布局预览已生成：{} 个分组，{} 个图标已分组，{} 个保持未分组。",
            result.groups.len(),
            grouped_count,
            result.leftover.len()
        ),
        "groups": result
            .groups
            .iter()
            .map(|group| json!({
                "folder_name": group.folder_name,
                "icon_count": group.icon_keys.len(),
            }))
            .collect::<Vec<_>>(),
    });
    *pending_organize = Some(result);
    summary.to_string()
}

fn tool_error_json(message: &str) -> String {
    json!({ "ok": false, "error": message }).to_string()
}

/// 图标库快照转成工具与校验使用的紧凑输入（key 即布局体系的图标 ID）。
fn load_agent_icons(app_handle: &tauri::AppHandle) -> Vec<AiIconInput> {
    get_icons(app_handle.clone(), 32)
        .into_iter()
        .map(|icon| AiIconInput {
            key: icon.id,
            name: icon.name,
            target_leaf: std::path::Path::new(&icon.target_path)
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default()
                .to_string(),
            item_type: icon.item_type,
        })
        .collect()
}

fn build_agent_messages(config: &AiConfig, history: Vec<AiChatMessageInput>) -> Vec<LlmMessage> {
    let mut messages = vec![LlmMessage::new(
        "system",
        r#"你是 DesktopGo 的桌面整理助手，可以在回答前调用工具获取真实数据。
可用工具：
1. list_icons - 查看当前图标库（名称/类型/路径）。参数：{"keyword": "可选，按名称或路径过滤"}
2. organize_icons - 生成图标分组布局预览。参数：{"groups": [{"folder_name": "分组名", "icon_keys": ["图标ID"]}]}
   icon_keys 必须来自 list_icons 返回的 id 字段；每组至少 2 个图标；不确定归属的图标不要放进任何组。

需要调用工具时，只输出一个如下形式的 JSON 对象，不要附加任何其他文字或代码块：
{"tool": "工具名", "args": { ... }}

规则：
- 收到「工具执行结果」后继续思考；整理成功后用一两句话总结分组结果。
- 不需要工具时，用简洁自然的中文直接回答，不要输出 JSON。
- 只在用户明确想整理/分组图标时才调用 organize_icons；日常问答直接回答。"#
            .to_string(),
    )];

    if let Some(extra) = config
        .custom_prompt
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        messages.push(LlmMessage::new(
            "system",
            format!("用户对助手的附加偏好：{}", extra.trim()),
        ));
    }

    for message in history
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
        messages.push(LlmMessage::new(role, message.content.trim().to_string()));
    }

    messages
}

#[cfg(test)]
mod tests {
    use super::{build_outcome, extract_json_object, parse_tool_request, strip_code_fence};
    use crate::ai::models::AiClassifyResult;

    #[test]
    fn parses_plain_tool_request_json() {
        let request = parse_tool_request(r#"{"tool": "list_icons", "args": {"keyword": "steam"}}"#)
            .expect("tool request should parse");
        assert_eq!(request.name, "list_icons");
        assert_eq!(request.args["keyword"], "steam");
    }

    #[test]
    fn parses_tool_request_inside_code_fence_and_surrounding_prose() {
        let content = "好的，我先查看图标库。\n```json\n{\"tool\": \"organize_icons\", \"args\": {\"groups\": []}}\n```\n";
        let request = parse_tool_request(content).expect("fenced tool request should parse");
        assert_eq!(request.name, "organize_icons");
    }

    #[test]
    fn treats_plain_answers_as_final_content() {
        assert!(parse_tool_request("你好，我是桌面整理助手。").is_none());
        assert!(parse_tool_request("{\"name\": \"不是工具调用\"}").is_none());
    }

    #[test]
    fn strips_code_fences_and_extracts_outermost_object() {
        assert_eq!(strip_code_fence("```json\n{\"a\": 1}\n```"), "{\"a\": 1}");
        assert_eq!(
            extract_json_object("前缀 {\"tool\": \"x\"} 后缀"),
            Some("{\"tool\": \"x\"}".to_string())
        );
    }

    #[test]
    fn build_outcome_carries_pending_organize_result() {
        let outcome = build_outcome(
            "已整理完成。".to_string(),
            Some(AiClassifyResult {
                groups: vec![],
                leftover: vec![],
            }),
            "chat-1",
        );
        assert_eq!(outcome.organize_run_id.as_deref(), Some("chat-1"));

        let plain = build_outcome("普通回答".to_string(), None, "chat-2");
        assert!(plain.organize_run_id.is_none());
        assert!(plain.groups.is_empty());
    }
}
