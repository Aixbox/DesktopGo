use std::collections::HashSet;

use super::models::{AiClassifyResult, AiGroup, AiIconInput, ModelGroupsPayload};

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

fn normalize_folder_size(value: Option<String>) -> Option<String> {
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
    let valid_keys: HashSet<&str> = icons.iter().map(|icon| icon.key.as_str()).collect();
    let mut consumed = HashSet::new();
    let mut groups = Vec::new();

    for group in payload.groups {
        let mut icon_keys = Vec::new();
        for key in group.icon_keys {
            if !valid_keys.contains(key.as_str()) || consumed.contains(&key) {
                continue;
            }
            consumed.insert(key.clone());
            icon_keys.push(key);
        }

        if icon_keys.len() < 2 {
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

    let leftover = icons
        .iter()
        .map(|icon| icon.key.clone())
        .filter(|key| !consumed.contains(key))
        .collect();

    AiClassifyResult { groups, leftover }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::models::{ModelGroup, ModelGroupsPayload};

    fn icon(key: &str) -> AiIconInput {
        AiIconInput {
            key: key.to_string(),
            name: key.to_string(),
            target_leaf: String::new(),
            item_type: String::new(),
        }
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
                    icon_keys: vec!["c".to_string()],
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
