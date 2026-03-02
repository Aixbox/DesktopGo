# DesktopGo 搜索系统开发文档（Everything IPC + 内置 Portable）

- 文档版本：v1.0
- 日期：2026-03-02
- 适用范围：Windows 版本 DesktopGo（Tauri 2 + Rust + React）
- 目标：在应用内提供“系统全部文件搜索”能力，优先使用用户已安装的 Everything；未安装或不可用时自动回退到内置 portable Everything；统一通过 IPC（SDK）查询。

## 1. 背景与目标

当前 Launchpad 搜索框仍是占位状态。我们要实现低延迟、全盘文件名搜索，并满足以下产品要求：

1. 优先使用用户已安装的 Everything。
2. 如本机没有可用 Everything，自动启用应用内置 portable Everything。
3. 统一使用 IPC（SDK）调用，不走 `es.exe` 主路径。
4. 启动后可持续查询，支持分页、排序、路径返回、文件打开。
5. 对用户透明：尽量自动恢复，不要求手工配置。

## 2. 官方约束与设计前提

以下约束来自官方文档，作为本方案的边界条件：

1. Everything SDK 基于 IPC，要求 Everything 实例在后台运行。
2. Everything Lite 不支持 IPC（SDK/ES 均不可用），不可作为依赖版本。
3. 标准用户若要完整 NTFS 索引，通常需要 Everything Service 或管理员权限。
4. 本方案的 portable 运行模式固定为服务模式（`-svc`），不启动 UI。
5. Everything 许可证允许分发和商用，但必须保留许可证文本。

## 3. 总体架构

### 3.1 模块划分（Rust）

新增 `src-tauri/src/everything/`：

1. `mod.rs`：导出对外接口。
2. `models.rs`：查询参数、结果、状态结构体。
3. `ipc.rs`：SDK FFI 封装（`Everything*.dll` 动态加载 + API 调用）。
4. `runtime.rs`：运行时编排（探测、启动、回退）。
5. `installed.rs`：安装版探测（注册表、服务、常见路径）。
6. `portable.rs`：portable 部署与启动管理。
7. `errors.rs`：错误码映射与用户可读错误。

在 `src-tauri/src/commands.rs` 暴露搜索命令，前端仅通过 Tauri command 调用。

### 3.2 模块划分（前端）

新增 `src/lib/search/`：

1. `api.ts`：invoke 包装。
2. `types.ts`：TS 类型定义。
3. `useSearch.ts`：防抖、取消、分页、状态。
4. `SearchPanel.tsx`：搜索 UI（输入、结果列表、空态、错误态）。

把 [Launchpad.tsx](D:/Project/self/DesktopGo/src/components/Launchpad.tsx) 的只读输入框改为真实输入与结果层。

## 4. 运行时策略（优先安装版）

### 4.1 状态机

`SearchRuntimeState`：

1. `Unknown`
2. `InstalledReady`
3. `PortableReady`
4. `Unavailable`

启动流程：

1. `probe_existing_ipc()`：先探测当前是否已有可用 Everything 实例（最快路径）。
2. 若不可用：`try_start_installed()`
3. 若仍不可用：`try_start_portable()`
4. 全失败：`Unavailable`，前端显示引导信息。

### 4.2 “优先安装版”判定规则

`try_start_installed()` 顺序：

1. 注册表卸载项定位安装路径（HKLM/HKCU）。
2. 检查 `Everything Service` 是否存在并运行。
3. 检查常见安装目录（`Program Files` / `Program Files (x86)`）。
4. 找到 `Everything.exe` 后启动并轮询 IPC（最多 5 秒，100ms 间隔）。

若安装版不可用，再进入 portable 兜底。

## 5. 内置 Portable Everything 方案

### 5.1 打包内容

在 `src-tauri/resources/everything/` 放入：

1. `Everything.exe`
2. `Everything64.dll`（或按架构提供）
3. `License.txt`
4. 可选：默认 `Everything.ini` 模板

`tauri.conf.json` 的 `bundle.resources` 增加上述目录，使安装器落地到 `$INSTDIR/resources/...`。

### 5.2 首次运行部署

首次启动时复制并带版本校验，把资源复制到可写目录：

`%LOCALAPPDATA%/com.binuo.desktopgo/everything-portable/`

原因：portable 需要写 ini/db，安装目录通常只读。

### 5.3 启动参数建议

portable 统一使用“服务模式（无 UI）”，默认启动参数：

Everything.exe -svc -svc-pipe-name EverythingSvcDesktopGo

说明：

1. -svc 为后台服务模式，不展示主界面。
2. -svc-pipe-name 用于隔离 IPC 通道，避免与用户现有服务冲突。
3. 不再使用 -instance 作为 portable 主方案。

## 6. IPC（SDK）实现设计

### 6.1 FFI 封装

在 `ipc.rs` 动态加载 SDK DLL，封装以下核心调用：

1. `Everything_SetSearchW`
2. `Everything_SetMatchPath`
3. `Everything_SetMatchCase`
4. `Everything_SetRegex`
5. `Everything_SetMatchWholeWord`
6. `Everything_SetRequestFlags`
7. `Everything_SetSort`
8. `Everything_SetOffset`
9. `Everything_SetMax`
10. `Everything_QueryW`
11. `Everything_GetNumResults`
12. `Everything_GetResultFullPathNameW`
13. `Everything_GetLastError`
14. `Everything_Reset`
15. `Everything_CleanUp`

异步查询补充（仅当使用 `Everything_QueryW(FALSE)` 时需要）：

1. `Everything_SetReplyWindow`
2. `Everything_SetReplyID`

### 6.2 查询参数标准化

统一请求模型：

```ts
interface SearchQuery {
  keyword: string
  offset: number
  limit: number
  matchPath: boolean
  matchCase: boolean
  regex: boolean
  wholeWord: boolean
  sort: 'name_asc' | 'name_desc' | 'path_asc' | 'date_modified_desc'
}
```

关键词规则：

1. `trim()` 后为空，直接返回空结果，不发 IPC。
2. 最大长度限制 256，避免异常输入。
3. 默认非正则、忽略大小写。

### 6.3 结果模型

```ts
interface SearchHit {
  path: string
  name: string
  parent: string
  isFile: boolean
  isFolder: boolean
}

interface SearchPage {
  items: SearchHit[]
  offset: number
  limit: number
  hasMore: boolean
  provider: 'installed' | 'portable'
  tookMs: number
}
```

## 7. Tauri Command API 设计

在 `commands.rs` 增加：

1. `search_files(query: SearchQuery) -> Result<SearchPage, String>`
2. `get_search_runtime_status() -> Result<SearchRuntimeStatus, String>`
3. `start_search_runtime() -> Result<SearchRuntimeStatus, String>`
4. `stop_portable_runtime() -> Result<(), String>`（仅关闭内置实例，不影响用户安装版）

返回错误要可区分：

1. `EverythingNotFound`
2. `EverythingLiteUnsupported`
3. `EverythingIpcUnavailable`
4. `EverythingStartTimeout`

## 8. 前端交互设计

### 8.1 搜索框行为

1. 输入防抖 120ms。
2. Enter 打开首项（复用现有 `launch_app`）。
3. ↑/↓ 切换选中项。
4. Esc 清空搜索并回到图标视图。

### 8.2 结果展示

1. 按文件优先 + 目录次之（可配置）。
2. 展示 `name + parent path`。
3. 每页默认 50 条，滚动触发下一页。
4. 顶部显示 provider 标识：`Everything (Installed)` 或 `Everything (Portable)`。

### 8.3 不可用提示

1. 检测到 Lite：提示“检测到 Everything Lite，不支持 IPC，请安装完整版本”。
2. 全不可用：显示“未检测到可用 Everything，点击安装/修复”。
3. 若用户拒绝安装，仍可保持当前 Launchpad 图标功能不受影响。

### 8.4 搜索设置设计（整合到 Settings 页面）

设置入口：在现有 Settings 窗口新增“搜索”分组，按“基础交互 / 搜索策略 / 筛选器”三组展示。

MVP（首发必做）：

1. `search.liveOnType = true`（键入即搜）
2. `search.debounceMs = 120`（输入防抖）
3. `search.autoSelectFirst = true`（自动选中第一条）
4. `search.openOnEnter = true`（Enter 打开选中项）
5. `search.openOnDoubleClick = true`（双击打开）
6. `search.defaultFilter = all|files|folders`（默认筛选）
7. `search.maxResultsPerPage = 50`（每页结果数）

第二阶段（增强项）：

1. `search.matchPath = false`
2. `search.matchCase = false`
3. `search.regex = false`
4. `search.matchWholeWord = false`
5. `search.includeHidden = false`
6. `search.sortBy = name_asc|name_desc|path_asc|date_modified_desc`
7. `search.rememberLastFilter = true`

设置项与 IPC 参数映射：

1. `matchPath -> Everything_SetMatchPath`
2. `matchCase -> Everything_SetMatchCase`
3. `regex -> Everything_SetRegex`
4. `matchWholeWord -> Everything_SetMatchWholeWord`
5. `sortBy -> Everything_SetSort`
6. `maxResultsPerPage -> Everything_SetMax`
7. `defaultFilter` 在请求组装阶段转换为查询语法（例如 `folder:` / `file:`）

交互规则：

1. 设置变更后即时生效到下一次查询。
2. `debounceMs` 有效范围建议 `50~500ms`，超出则回退默认值。
3. 当 `liveOnType = false` 时，仅在 Enter 或点击搜索按钮触发查询。
4. 当 `autoSelectFirst = false` 时，键盘 Enter 行为需先显式选择结果。

## 9. 安装器与引导设计

## 9.1 默认策略

默认随应用携带 portable，因此搜索功能可开箱可用。

## 9.2 可选“安装 Everything”引导

利用 Tauri NSIS `installerHooks`：

1. 在安装完成阶段弹窗询问“是否安装系统版 Everything（推荐）”。
2. 用户确认后执行资源目录中的 `Everything-Setup.exe`。
3. 失败不阻断 DesktopGo 安装。

说明：完整复选框页面可通过自定义 NSIS 模板实现；快速版可先用 Hook 弹窗。

## 10. 配置与持久化

复用现有 SQLite（`app_state.db`）保存搜索配置：

1. `search.preferInstalled = true`
2. `search.autoStartRuntime = true`
3. `search.lastProvider = installed|portable|none`
4. `search.portableServicePipeName = EverythingSvcDesktopGo`
5. `search.liveOnType = true`
6. `search.debounceMs = 120`
7. `search.autoSelectFirst = true`
8. `search.openOnEnter = true`
9. `search.openOnDoubleClick = true`
10. `search.defaultFilter = all|files|folders`
11. `search.maxResultsPerPage = 50`
12. `search.matchPath = false`
13. `search.matchCase = false`
14. `search.regex = false`
15. `search.matchWholeWord = false`
16. `search.includeHidden = false`
17. `search.sortBy = name_asc|name_desc|path_asc|date_modified_desc`
18. `search.rememberLastFilter = true`

## 11. 安全与合规

1. 不启用 Everything HTTP Server，避免额外网络暴露面。
2. 所有 IPC 仅本机，不开放远程接口。
3. 打包时必须附带 Everything 许可证文本。
4. 对输入关键词做长度限制和日志脱敏（不记录完整用户关键词）。

## 12. 测试计划

### 12.1 场景矩阵

1. 已安装 + 已运行 Everything：应命中 `InstalledReady`。
2. 已安装 + 未运行：应自动拉起安装版并可查询。
3. 未安装：应自动拉起 portable 并可查询。
4. 安装 Lite：应报 `EverythingLiteUnsupported` 并提示修复。
5. 无管理员权限标准用户：验证索引完整性提示。
6. portable 文件损坏：应自动重建目录并重试。

### 12.2 性能目标

1. 首次可用时间：`<= 2s`（已运行安装版）。
2. 冷启动回退 portable：`<= 6s`。
3. 单次查询（50条）P95：`<= 80ms`。

## 13. 里程碑计划

1. M1（2天）：Rust 运行时管理 + IPC 查询打通（CLI 工具验证）。
2. M2（2天）：前端搜索框接入 + 基础结果列表 + 搜索设置（MVP）接入。
3. M3（2天）：portable 打包与自动部署。
4. M4（1天）：安装引导（可选安装 Everything）。
5. M5（2天）：错误处理、测试矩阵、验收。

## 14. 验收标准

1. 用户无感知使用搜索（无本地手工配置）。
2. 已安装 Everything 时必须优先命中安装版。
3. 未安装时 portable 自动兜底成功率 >= 99%。
4. 全链路不依赖 `localStorage` 保存搜索核心状态。
5. 搜索设置项可持久化并在重启后生效。
6. 文档、许可证、错误提示完整。

## 15. 代码改造清单（实施时）

1. `src-tauri/src/everything/*`（新增）
2. `src-tauri/src/commands.rs`（新增搜索命令）
3. `src-tauri/src/lib.rs`（注册命令、初始化 runtime）
4. `src-tauri/tauri.conf.json`（resources + installerHooks）
5. `src/components/Launchpad.tsx`（搜索框启用）
6. `src/lib/search/*`（新增）
7. `src/components/search/*`（新增）
8. `src/components/Settings.tsx`（新增搜索设置分组）
9. `src/lib/settingsStore.ts`（新增搜索设置键）

## 16. 参考资料

1. Everything SDK: https://www.voidtools.com/support/everything/sdk/
2. Everything C SDK 示例: https://www.voidtools.com/support/everything/sdk/c/
3. Everything FAQ（Lite 不支持 IPC/ES）: https://www.voidtools.com/faq/
4. Everything 安装与 portable: https://www.voidtools.com/support/everything/installing_everything/
5. Everything 多实例: https://www.voidtools.com/support/everything/multiple_instances/
6. Everything Service: https://www.voidtools.com/support/everything/everything_service/
7. Everything 许可证: https://www.voidtools.com/License.txt
8. Tauri v2 配置（resources / installerHooks）: https://v2.tauri.app/reference/config/
9. Tauri Windows Installer（NSIS hooks）: https://v2.tauri.app/distribute/windows-installer/






