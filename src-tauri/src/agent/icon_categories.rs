//! 图标分类知识库：内置的「应用 → 分类」参考表 + 用户自定义条目。
//!
//! 内置表随应用发布；用户在设置页维护的条目存放在布局 KV
//! （`desktopgo.ai.icon-categories.v1`），按名称（忽略大小写）覆盖内置项。
//! 对话 agent 的工具从合并后的知识库取数，让模型整理图标时有据可依。

use serde::Serialize;
use serde_json::Value;
use tauri::AppHandle;

use crate::layout_db::get_layout_payload;

pub(crate) const ICON_CATEGORIES_KEY: &str = "desktopgo.ai.icon-categories.v1";
/// 子串匹配时内置条目名至少需要这么长，避免过短的名称误命中。
const MIN_SUBSTRING_MATCH_CHARS: usize = 3;
const MAX_ENTRIES: usize = 300;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiIconCategoryEntry {
    pub name: String,
    pub category: String,
}

/// 内置分类参考表（常用应用与网站的约定分类）。类别名同时是建议的文件夹名。
const BUILTIN_ICON_CATEGORIES: &[(&str, &str)] = &[
    // 浏览器
    ("Chrome", "浏览器"),
    ("Google Chrome", "浏览器"),
    ("Edge", "浏览器"),
    ("Microsoft Edge", "浏览器"),
    ("Firefox", "浏览器"),
    ("Brave", "浏览器"),
    ("Opera", "浏览器"),
    ("Vivaldi", "浏览器"),
    ("Arc", "浏览器"),
    ("360安全浏览器", "浏览器"),
    ("360极速浏览器", "浏览器"),
    ("QQ浏览器", "浏览器"),
    ("搜狗浏览器", "浏览器"),
    // 开发工具
    ("Visual Studio Code", "开发工具"),
    ("VS Code", "开发工具"),
    ("IntelliJ IDEA", "开发工具"),
    ("WebStorm", "开发工具"),
    ("PyCharm", "开发工具"),
    ("CLion", "开发工具"),
    ("GoLand", "开发工具"),
    ("Rider", "开发工具"),
    ("DataGrip", "开发工具"),
    ("Android Studio", "开发工具"),
    ("Visual Studio", "开发工具"),
    ("Cursor", "开发工具"),
    ("Windsurf", "开发工具"),
    ("Zed", "开发工具"),
    ("Sublime Text", "开发工具"),
    ("HBuilderX", "开发工具"),
    ("GitHub Desktop", "开发工具"),
    ("GitKraken", "开发工具"),
    ("Fork", "开发工具"),
    ("Docker Desktop", "开发工具"),
    ("Postman", "开发工具"),
    ("Apifox", "开发工具"),
    ("Insomnia", "开发工具"),
    ("Navicat Premium", "开发工具"),
    ("Navicat", "开发工具"),
    ("DBeaver", "开发工具"),
    ("Another Redis Desktop Manager", "开发工具"),
    ("Unity Hub", "开发工具"),
    ("Unity", "开发工具"),
    ("Go", "开发工具"),
    ("Windows Terminal", "开发工具"),
    ("PowerShell", "开发工具"),
    ("Tabby Terminal", "开发工具"),
    ("Tabby", "开发工具"),
    ("Warp", "开发工具"),
    ("Xshell", "开发工具"),
    ("MobaXterm", "开发工具"),
    ("FinalShell", "开发工具"),
    ("PuTTY", "开发工具"),
    ("Termius", "开发工具"),
    // 办公文档
    ("Word", "办公文档"),
    ("Excel", "办公文档"),
    ("PowerPoint", "办公文档"),
    ("OneNote", "办公文档"),
    ("Outlook", "办公文档"),
    ("WPS Office", "办公文档"),
    ("WPS", "办公文档"),
    ("LibreOffice", "办公文档"),
    ("Notion", "办公文档"),
    ("Obsidian", "办公文档"),
    ("Typora", "办公文档"),
    ("Logseq", "办公文档"),
    ("XMind", "办公文档"),
    ("幕布", "办公文档"),
    ("SumatraPDF", "办公文档"),
    ("Calibre", "办公文档"),
    ("福昕阅读器", "办公文档"),
    ("Notepad++", "办公文档"),
    // 社交通讯
    ("WeChat", "社交通讯"),
    ("微信", "社交通讯"),
    ("企业微信", "社交通讯"),
    ("WeCom", "社交通讯"),
    ("QQ", "社交通讯"),
    ("TIM", "社交通讯"),
    ("DingTalk", "社交通讯"),
    ("钉钉", "社交通讯"),
    ("Feishu", "社交通讯"),
    ("飞书", "社交通讯"),
    ("Lark", "社交通讯"),
    ("Telegram", "社交通讯"),
    ("Discord", "社交通讯"),
    ("Slack", "社交通讯"),
    ("Microsoft Teams", "社交通讯"),
    ("Teams", "社交通讯"),
    ("腾讯会议", "社交通讯"),
    ("Tencent Meeting", "社交通讯"),
    ("Zoom", "社交通讯"),
    // 影音媒体
    ("Spotify", "影音媒体"),
    ("网易云音乐", "影音媒体"),
    ("CloudMusic", "影音媒体"),
    ("酷狗音乐", "影音媒体"),
    ("酷我音乐", "影音媒体"),
    ("汽水音乐", "影音媒体"),
    ("foobar2000", "影音媒体"),
    ("Lyricify", "影音媒体"),
    ("PotPlayer", "影音媒体"),
    ("VLC", "影音媒体"),
    ("OBS Studio", "影音媒体"),
    ("Bandicam", "影音媒体"),
    ("剪映", "影音媒体"),
    ("Premiere Pro", "影音媒体"),
    ("After Effects", "影音媒体"),
    ("DaVinci Resolve", "影音媒体"),
    ("Audacity", "影音媒体"),
    // 游戏娱乐
    ("Steam", "游戏娱乐"),
    ("Epic Games", "游戏娱乐"),
    ("Ubisoft Connect", "游戏娱乐"),
    ("Uplay", "游戏娱乐"),
    ("EA app", "游戏娱乐"),
    ("Origin", "游戏娱乐"),
    ("Battle.net", "游戏娱乐"),
    ("暴雪战网", "游戏娱乐"),
    ("WeGame", "游戏娱乐"),
    ("Minecraft", "游戏娱乐"),
    ("Prism Launcher", "游戏娱乐"),
    // 设计创作
    ("Photoshop", "设计创作"),
    ("Illustrator", "设计创作"),
    ("Figma", "设计创作"),
    ("GIMP", "设计创作"),
    ("Krita", "设计创作"),
    ("Inkscape", "设计创作"),
    ("Affinity Designer", "设计创作"),
    ("Affinity Photo", "设计创作"),
    ("Adobe XD", "设计创作"),
    ("Blender", "设计创作"),
    ("Cinema 4D", "设计创作"),
    ("AutoCAD", "设计创作"),
    ("SketchUp", "设计创作"),
    // 系统工具
    ("Everything", "系统工具"),
    ("Listary", "系统工具"),
    ("uTools", "系统工具"),
    ("Quicker", "系统工具"),
    ("PowerToys", "系统工具"),
    ("Geek Uninstaller", "系统工具"),
    ("Revo Uninstaller", "系统工具"),
    ("Dism++", "系统工具"),
    ("WizTree", "系统工具"),
    ("SpaceSniffer", "系统工具"),
    ("CrystalDiskInfo", "系统工具"),
    ("CPU-Z", "系统工具"),
    ("GPU-Z", "系统工具"),
    ("AIDA64", "系统工具"),
    ("HWiNFO", "系统工具"),
    ("火绒安全", "系统工具"),
    ("腾讯电脑管家", "系统工具"),
    // 实用工具
    ("7-Zip", "实用工具"),
    ("Bandizip", "实用工具"),
    ("WinRAR", "实用工具"),
    ("PeaZip", "实用工具"),
    ("Internet Download Manager", "实用工具"),
    ("IDM", "实用工具"),
    ("迅雷", "实用工具"),
    ("Free Download Manager", "实用工具"),
    ("Motrix", "实用工具"),
    ("PixPin", "实用工具"),
    ("Snipaste", "实用工具"),
    ("ShareX", "实用工具"),
    ("PicGo", "实用工具"),
    ("KOOK", "社交通讯"),
    ("Oopz", "社交通讯"),
];

pub(crate) fn builtin_icon_categories() -> Vec<AiIconCategoryEntry> {
    BUILTIN_ICON_CATEGORIES
        .iter()
        .map(|(name, category)| AiIconCategoryEntry {
            name: (*name).to_string(),
            category: (*category).to_string(),
        })
        .collect()
}

/// 合并后的知识库：内置表 + 用户条目（同名覆盖，用户条目排在内置之后）。
pub(crate) fn load_effective_icon_categories(app_handle: &AppHandle) -> Vec<AiIconCategoryEntry> {
    let mut entries = builtin_icon_categories();
    let Ok(Some(raw)) = get_layout_payload(app_handle, ICON_CATEGORIES_KEY) else {
        return entries;
    };
    let Ok(value) = serde_json::from_str::<Value>(&raw) else {
        return entries;
    };
    let Some(list) = value.get("entries").and_then(Value::as_array) else {
        return entries;
    };

    for item in list {
        let name = item
            .get("name")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty());
        let category = item
            .get("category")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty());
        let (Some(name), Some(category)) = (name, category) else {
            continue;
        };
        entries.retain(|entry| !entry.name.eq_ignore_ascii_case(name));
        entries.push(AiIconCategoryEntry {
            name: name.to_string(),
            category: category.to_string(),
        });
    }

    if entries.len() > MAX_ENTRIES {
        entries.truncate(MAX_ENTRIES);
    }
    entries
}

/// 名称匹配：先找全等（忽略大小写），再找最长且不少于 3 字符的包含匹配，
/// 避免过短的关键字（如 "AI"）误命中。
pub(crate) fn match_icon_category(
    icon_name: &str,
    entries: &[AiIconCategoryEntry],
) -> Option<String> {
    let lower = icon_name.trim().to_lowercase();
    if lower.is_empty() {
        return None;
    }

    let mut best: Option<(&AiIconCategoryEntry, bool, usize)> = None;
    for entry in entries {
        let entry_lower = entry.name.trim().to_lowercase();
        if entry_lower.is_empty() {
            continue;
        }
        let exact = lower == entry_lower;
        let contains = lower.contains(&entry_lower);
        if !exact && (!contains || entry_lower.chars().count() < MIN_SUBSTRING_MATCH_CHARS) {
            continue;
        }
        let entry_len = entry_lower.chars().count();
        let better = match best {
            None => true,
            Some((_, best_exact, best_len)) => {
                (exact && !best_exact) || (exact == best_exact && entry_len > best_len)
            }
        };
        if better {
            best = Some((entry, exact, entry_len));
        }
    }

    best.map(|(entry, _, _)| entry.category.clone())
}

#[cfg(test)]
mod tests {
    use super::{builtin_icon_categories, match_icon_category, AiIconCategoryEntry};

    fn entry(name: &str, category: &str) -> AiIconCategoryEntry {
        AiIconCategoryEntry {
            name: name.to_string(),
            category: category.to_string(),
        }
    }

    #[test]
    fn matches_exact_name_case_insensitively() {
        let entries = vec![entry("Steam", "游戏娱乐")];
        assert_eq!(
            match_icon_category("steam", &entries).as_deref(),
            Some("游戏娱乐")
        );
    }

    #[test]
    fn matches_icon_names_containing_the_entry_name() {
        let entries = vec![entry("Chrome", "浏览器")];
        assert_eq!(
            match_icon_category("Google Chrome", &entries).as_deref(),
            Some("浏览器")
        );
    }

    #[test]
    fn prefers_exact_over_substring_and_longer_names() {
        let entries = vec![
            entry("Code", "开发工具"),
            entry("Visual Studio Code", "开发工具"),
            entry("Code - Insiders", "开发工具"),
        ];
        assert_eq!(
            match_icon_category("visual studio code", &entries).as_deref(),
            Some("开发工具")
        );
        assert_eq!(
            match_icon_category("code - insiders", &entries).as_deref(),
            Some("开发工具")
        );
    }

    #[test]
    fn skips_short_names_for_substring_matching() {
        let entries = vec![entry("Go", "开发工具")];
        assert_eq!(match_icon_category("Google Drive", &entries), None);
        assert_eq!(
            match_icon_category("Go", &entries).as_deref(),
            Some("开发工具")
        );
    }

    #[test]
    fn builtin_table_has_entries_in_every_category() {
        let builtins = builtin_icon_categories();
        assert!(builtins.len() >= 80);
        assert!(builtins.iter().any(|entry| entry.category == "浏览器"));
        assert!(builtins.iter().any(|entry| entry.category == "开发工具"));
        assert!(builtins.iter().any(|entry| entry.category == "游戏娱乐"));
    }
}
