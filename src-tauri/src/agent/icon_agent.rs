use crate::agent::event::{emit_agent_event, AgentEvent, AgentEventPhase};
use crate::agent::llm::{emit_content_as_tokens, LlmClient, LlmMessage};
use crate::agent::memory;
use crate::agent::tool::{AgentTool, ToolResponse};
use crate::ai::{self, AiConfig, AiGroup, AiIconInput};
use serde::Serialize;
use tauri::Manager;
use uuid::Uuid;

#[derive(Debug, Serialize)]
pub struct AiAgentRunResult {
    pub run_id: String,
    pub groups: Vec<AiGroup>,
    pub leftover: Vec<String>,
}

struct ValidateGroupsTool;

impl AgentTool for ValidateGroupsTool {
    fn name(&self) -> &'static str {
        "validate_icon_groups"
    }

    fn description(&self) -> &'static str {
        "校验模型返回的图标分组，过滤非法 key、重复项和单图标分组。"
    }
}

#[tauri::command]
pub async fn ai_organize_icons_agent(
    window: tauri::Window,
    config: AiConfig,
    icons: Vec<AiIconInput>,
) -> Result<AiAgentRunResult, String> {
    let run_id = format!("icon-agent-{}", Uuid::new_v4());
    let agent = IconOrganizerAgent::new(window, run_id);
    agent.run(config, icons).await
}

#[tauri::command]
pub fn ai_organize_record_apply(
    app_handle: tauri::AppHandle,
    run_id: String,
    groups: Vec<AiGroup>,
) -> Result<(), String> {
    memory::mark_applied(&app_handle, &run_id, groups)
}

struct IconOrganizerAgent {
    window: tauri::Window,
    run_id: String,
    validate_tool: ValidateGroupsTool,
}

impl IconOrganizerAgent {
    fn new(window: tauri::Window, run_id: String) -> Self {
        Self {
            window,
            run_id,
            validate_tool: ValidateGroupsTool,
        }
    }

    async fn run(
        self,
        config: AiConfig,
        icons: Vec<AiIconInput>,
    ) -> Result<AiAgentRunResult, String> {
        self.emit(AgentEventPhase::Started, "AI Agent 已开始整理图标。");
        self.validate_request(&config)?;

        if icons.is_empty() {
            self.emit(AgentEventPhase::Done, "没有可整理的图标。");
            return Ok(AiAgentRunResult {
                run_id: self.run_id,
                groups: Vec::new(),
                leftover: Vec::new(),
            });
        }

        let app_handle = self.window.app_handle().clone();
        let memory = memory::load_memory(&app_handle)?;
        let memory_summary = memory::build_preference_summary(&memory);
        self.emit_detail(
            AgentEventPhase::Context,
            "已读取历史整理偏好。",
            memory_summary.as_deref().unwrap_or("没有可用的历史偏好。"),
            None,
        );

        let model_client = LlmClient::from_config(&config);
        self.emit_detail(
            AgentEventPhase::Model,
            "已选择模型适配器。",
            format!(
                "adapter={} model={}",
                model_client.provider().label(),
                config.model.trim()
            ),
            None,
        );

        let messages = build_agent_messages(&config, &icons, memory_summary.as_deref())?;
        self.emit(AgentEventPhase::Reasoning, "正在规划整理策略。");
        self.emit(AgentEventPhase::Model, "正在请求模型生成整理草稿。");
        let mut streamed_tokens = true;
        let model_response = match model_client
            .complete_json_streaming(&config, messages.clone(), &self.window, &self.run_id)
            .await
        {
            Ok(response) => response,
            Err(stream_error) => {
                streamed_tokens = false;
                self.emit_detail(
                    AgentEventPhase::Fallback,
                    "流式请求失败，正在降级为普通严格 JSON 请求。",
                    &stream_error,
                    None,
                );
                match model_client
                    .complete_json(&config, messages.clone(), true)
                    .await
                {
                    Ok(response) => response,
                    Err(strict_error) => {
                        self.emit_detail(
                            AgentEventPhase::Fallback,
                            "普通严格 JSON 请求失败，正在去掉 response_format 重试。",
                            &strict_error,
                            None,
                        );
                        model_client
                            .complete_json(&config, messages, false)
                            .await
                            .map_err(|loose_error| {
                                format!(
                                    "{stream_error}；严格普通请求失败：{strict_error}；宽松普通请求也失败：{loose_error}"
                                )
                            })?
                    }
                }
            }
        };
        if !streamed_tokens {
            emit_content_as_tokens(&self.window, &self.run_id, &model_response.content);
        }
        self.emit_detail(
            AgentEventPhase::Model,
            "模型响应已返回。",
            format!(
                "adapter={} latency={}ms",
                model_response.adapter_label, model_response.latency_ms
            ),
            None,
        );
        if let Some(usage) = &model_response.usage {
            emit_agent_event(
                &self.window,
                AgentEvent::new(&self.run_id, AgentEventPhase::Usage, "模型用量已返回。")
                    .usage(usage.to_agent_usage()),
            );
        }

        self.emit_detail(
            AgentEventPhase::ToolCall,
            "正在校验模型返回的分组。",
            format!(
                "{}：{}",
                self.validate_tool.name(),
                self.validate_tool.description()
            ),
            Some(self.validate_tool.name()),
        );
        let payload = ai::parse_model_payload(&model_response.content)?;
        let result = ai::sanitize_groups(payload, &icons);
        let validation = ToolResponse::success(
            "已校验 AI 分组结果。",
            format!(
                "{} 个可用分组，{} 个未分组图标。",
                result.groups.len(),
                result.leftover.len()
            ),
        );
        self.emit_detail(
            AgentEventPhase::ToolResult,
            "分组校验完成。",
            &validation.message,
            Some(self.validate_tool.name()),
        );
        self.emit_detail(
            AgentEventPhase::Draft,
            "整理草稿已生成。",
            format!("{} 个分组可预览。", result.groups.len()),
            None,
        );

        match memory::save_draft(
            &app_handle,
            &self.run_id,
            &config.model,
            config.custom_prompt.as_deref(),
            &result,
            &icons,
        ) {
            Ok(()) => self.emit(AgentEventPhase::Saved, "整理草稿已保存到本地上下文。"),
            Err(error) => self.emit_detail(
                AgentEventPhase::Error,
                "整理草稿保存失败，但本次结果仍可预览。",
                &error,
                None,
            ),
        }

        self.emit(AgentEventPhase::Done, "AI Agent 已完成整理草稿。");
        Ok(AiAgentRunResult {
            run_id: self.run_id,
            groups: result.groups,
            leftover: result.leftover,
        })
    }

    fn validate_request(&self, config: &AiConfig) -> Result<(), String> {
        if config.api_key.trim().is_empty() {
            return Err("尚未配置 API Key，请先在设置页填写 AI 配置。".to_string());
        }
        if config.model.trim().is_empty() {
            return Err("尚未配置模型名称，请先在设置页填写 AI 配置。".to_string());
        }
        Ok(())
    }

    fn emit(&self, phase: AgentEventPhase, message: impl Into<String>) {
        emit_agent_event(
            &self.window,
            AgentEvent::new(&self.run_id, phase, message.into()),
        );
    }

    fn emit_detail(
        &self,
        phase: AgentEventPhase,
        message: impl Into<String>,
        detail: impl Into<String>,
        tool_name: Option<&str>,
    ) {
        let mut event = AgentEvent::new(&self.run_id, phase, message.into()).detail(detail.into());
        if let Some(tool_name) = tool_name {
            event = event.tool_name(tool_name);
        }
        emit_agent_event(&self.window, event);
    }
}

fn build_agent_messages(
    config: &AiConfig,
    icons: &[AiIconInput],
    memory_summary: Option<&str>,
) -> Result<Vec<LlmMessage>, String> {
    let mut system_prompt = ai::build_system_prompt(config.custom_prompt.as_deref());
    system_prompt.push_str(
        "\n\n你现在是 DesktopGo 的 IconOrganizerAgent。请把输出视为“整理草稿”，用户会在应用前预览并可修改。\
优先保持分组稳定、命名简短，并尊重历史确认偏好。",
    );
    if let Some(summary) = memory_summary {
        system_prompt.push_str("\n\n");
        system_prompt.push_str(summary);
    }

    let user_payload =
        serde_json::to_string(icons).map_err(|error| format!("序列化图标清单失败：{error}"))?;

    Ok(vec![
        LlmMessage::new("system", system_prompt),
        LlmMessage::new(
            "user",
            format!("请基于当前图标清单生成整理草稿。仅返回 JSON。\n图标清单：\n{user_payload}"),
        ),
    ])
}
