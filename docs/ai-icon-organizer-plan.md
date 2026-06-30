# AI 智能整理图标 — 实现方案

让用户配置自己的 AI 模型（OpenAI 兼容），由 AI Agent 读取启动台图标元数据，自动生成「按用途分组的文件夹」，用户预览确认后写回布局。

## 总体数据流

```
图标元数据(name/path/target_path/item_type/source)
  → invoke('ai_classify_icons', {config, icons})        [Rust: reqwest 调 OpenAI 兼容接口]
  → 返回 { groups: [{ folderName, iconKeys[] }], leftover[] }
  → 前端构造预览(FolderItem[]) → 用户确认
  → writeLayout(新 items/slots/dockKeys) → emit LAUNCHPAD_LAYOUT_RESET_EVENT
  → 主窗口重渲染
```

复用现有「重置图标 + 刷新主窗口」链路（`Settings.tsx:1477`、`layoutStore.writeLayout`、`LAUNCHPAD_LAYOUT_RESET_EVENT`）。

## 一、后端（Rust）

### 1. 依赖
`src-tauri/Cargo.toml` 增加：
```toml
reqwest = { version = "0.12", default-features = false, features = ["json", "rustls-tls"] }
```
（rustls 避免 schannel 的证书问题；tokio 已由 Tauri 运行时提供，async command 可用。）

### 2. 新模块 `src-tauri/src/ai.rs`
- `AiConfig { base_url, api_key, model, temperature? }`、`AiIconInput { key, name, target_path, item_type, source }`、`AiGroup { folder_name, icon_keys }`、`AiClassifyResult { groups, leftover }`。
- `#[tauri::command] async fn ai_classify_icons(config, icons) -> Result<AiClassifyResult, String>`：
  - 拼接固定的 system prompt（要求严格输出 JSON：`{"groups":[{"folderName":"","iconKeys":[]}]}`），并允许追加用户自定义提示词。
  - 用户图标列表作为 user message（仅传 key + name + target_path 叶子 + 类型，**不传完整路径中的敏感信息**，控制 token）。
  - POST `{base_url}/chat/completions`，`response_format: {type: json_object}`，`Authorization: Bearer {api_key}`。
  - 解析 `choices[0].message.content` 为 JSON；校验 iconKeys 必须是传入 key 的子集，去重、过滤空组、单图标组并入 leftover。
  - 错误信息中文化（网络失败 / 鉴权失败 / JSON 解析失败 / 模型未按格式返回）。
- 加超时（30s）；**不打印 api_key**。

### 3. 注册
`src-tauri/src/lib.rs`：`mod ai;`，`use ai::ai_classify_icons;`，加入 `invoke_handler!`。

## 二、设置层（前端）

### `src/lib/aiConfigStore.ts`（新建）
独立 LazyStore（`dev/aiConfig.json` / `aiConfig.json`），仿 `customNamesStore.ts`。
- 字段：`baseUrl`、`apiKey`、`model`、`customPrompt`、`enabled`。
- `loadAiConfig()` / `saveAiConfig()`，带类型校验和默认值。
- API Key 单独存此文件（与设置主 store 隔离），保存时给出明文存储的风险提示。

> 说明：API Key 属敏感信息，本地明文存储不是最优（理想是 Windows 凭据管理器），方案先做明文 + UI 提示，留 TODO。

### `src/components/Settings.tsx`
`NAV_ITEMS` 增加 `ai` 项（图标用 `Sparkles`/`Bot`），新增 `AiPanel`：
- 用 `SettingCard` + `Input` 配置 baseUrl / apiKey(密码态) / model / customPrompt(textarea)。
- 「测试连接」按钮：调一个最小图标集验证配置可用。
- 明文存储风险提示文案。

## 三、整理交互（前端核心）

### `src/lib/aiOrganize.ts`（新建，纯逻辑 + 可测试）
- `buildAiIconInputs(icons, customNames)`：把 `DesktopIcon[]` → AI 输入（用 `buildIconSelectionKey` 生成 key，名称优先 customName）。
- `applyAiGroupsToLayout(currentItems, currentSlots, currentDockKeys, groups)`：
  - 基于现有 `GridItem[]`，把每组 `iconKeys` 收拢成新的 `FolderItem`（`makeFolderId()`、`name=folderName`、children 用现有 IconItem 实例），其余图标保持原顺序。
  - 返回新的 `items`，slots/dockKeys 交给现有 `normalizeOuterSlots` 流程（直接 `writeLayout(newItems, [], [])` 触发 rehydrate 最稳，参考 reset 路径）。
- 为该纯函数写测试 `aiOrganize.test.ts`（项目用 `node --experimental-strip-types`，加入 `package.json` test 脚本）。

### `src/components/ai/AiOrganizePanel.tsx`（新建预览弹窗）
- 触发后：读 config → `buildAiIconInputs` → `invoke('ai_classify_icons')` → 展示分组预览（文件夹名 + 每组图标缩略图，可重命名分组 / 剔除图标）。
- 「应用」：`applyAiGroupsToLayout` → `writeLayout` → emit `LAUNCHPAD_LAYOUT_RESET_EVENT` → 关闭。
- 「取消」：丢弃。
- 加载态 / 错误态 / 空结果态；未配置 AI 时引导去设置页。

### 触发入口（两处）
1. **启动台右键菜单**（`Launchpad.tsx:1631` 区域）：在「编辑图标」附近加 `AI 智能整理`，打开 `AiOrganizePanel`。
2. **设置页 → 图标管理**：在「图标布局重置」`SettingCard` 旁加一个 AI 整理入口卡片（设置窗口内触发时，通过事件通知主窗口打开预览，或直接在设置窗口做预览后 emit 写回——优先后者：设置页执行分类与写回，emit reset 事件刷新主窗口，和现有 reset 行为一致）。

## 四、i18n
所有新增中文文案在 `src/lib/i18n.tsx` 的 `EN_MESSAGES` 补英文键值（沿用 `translate('中文')` 调用方式）。

## 五、安全要点
- API Key：不入前端日志、不入 Rust 日志；预览数据只传图标名/叶子路径/类型，不外传完整目录树。
- 网络请求集中在 Rust，绕过 webview CORS，Key 不暴露于页面上下文。
- 写回前必有预览确认，不覆盖用户手工排布而无确认。

## 六、验证
- `pnpm test`（含新增 aiOrganize 纯函数测试）。
- `pnpm lint`、`pnpm build`（tsc）。
- `cargo build`（src-tauri）确认 reqwest 集成编译通过。
- 手动：配置一个 OpenAI 兼容端点 → 右键整理 → 预览 → 应用 → 主窗口出现分类文件夹；取消不改动布局。

## 改动文件清单
**新增**：`src-tauri/src/ai.rs`、`src/lib/aiConfigStore.ts`、`src/lib/aiOrganize.ts`、`src/lib/aiOrganize.test.ts`、`src/components/ai/AiOrganizePanel.tsx`
**修改**：`src-tauri/Cargo.toml`、`src-tauri/src/lib.rs`、`src/components/Settings.tsx`、`src/components/Launchpad.tsx`、`src/lib/i18n.tsx`、`package.json`(test 脚本)
