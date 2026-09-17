<p align="center">
  <img src="./public/logo.svg" width="92" alt="DesktopGo logo" />
</p>

<p align="center">
  <strong>简体中文</strong> | <a href="./README.en.md">English</a>
</p>

<h1 align="center">DesktopGo</h1>

<p align="center">
  一个面向 Windows 的桌面启动台，把应用唤起、图标整理、AI 智能分组和 Everything 文件搜索收进同一个入口。
</p>

<p align="center">
  <a href="https://github.com/Aixbox/DesktopGo/releases/latest">下载最新版本</a>
  ·
  <a href="https://github.com/Aixbox/DesktopGo/releases">查看 Releases</a>
  ·
  <a href="https://github.com/Aixbox/DesktopGo/issues">提交问题</a>
</p>

<p align="center">
  <img alt="Platform" src="https://img.shields.io/badge/Platform-Windows%2010%2F11-0078D6?logo=windows&logoColor=white" />
  <img alt="Tauri 2" src="https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white" />
  <img alt="React 19" src="https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white" />
  <img alt="License MIT" src="https://img.shields.io/badge/License-MIT-111111" />
</p>

DesktopGo 是一个使用 Tauri 2 + React 19 + Rust 构建的 Windows 桌面启动台。它参考 macOS Launchpad 的交互方式，但能力设计围绕 Windows 桌面场景展开，重点解决四个问题：

- 用全局快捷键快速呼出统一入口
- 把应用、文件和自定义入口整理成可拖拽、可分组、可分页的图标库
- 用 AI 自动分析图标并生成分组方案，一键整理启动台
- 基于 Everything 提供快速文件搜索、预览和打开能力

## 🚀 下载

如果你只是想使用 DesktopGo，不需要本地安装 Node.js 或 Rust，直接从 Releases 下载即可：

- 最新版本：<https://github.com/Aixbox/DesktopGo/releases/latest>
- 所有发布：<https://github.com/Aixbox/DesktopGo/releases>
- 最新发布说明：[`docs/RELEASE_NOTES/v1.0.6.md`](docs/RELEASE_NOTES/v1.0.6.md)
- 详细使用说明（中文）：[`docs/USER_GUIDE.zh-CN.md`](docs/USER_GUIDE.zh-CN.md)
- User Guide (English): [`docs/USER_GUIDE.en.md`](docs/USER_GUIDE.en.md)

安装说明：

1. 下载最新安装包并执行安装，同一个安装包内已包含简体中文和英文安装资源。
2. 每次运行安装包都会先弹出语言选择对话框，选择“中文(简体)”或“English”后，后续安装步骤、提示和首次启动的界面语言都会跟随该选择。
3. 如果系统中还没有 Everything，保持安装器里的“安装 Everything”选项勾选。
4. 安装完成页可以直接勾选“开机自启动”。
5. 安装完成后，使用默认快捷键 `Ctrl+Space` 呼出启动台。

## 🖼 截图预览

<table>
  <tr>
    <td colspan="2" align="center">
      <img src="./website/assets/images/icon-grid.png" width="960" alt="DesktopGo 启动台主界面预览" />
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="./website/assets/images/search-panel.png" width="470" alt="DesktopGo 搜索面板预览" />
    </td>
    <td align="center">
      <img src="./website/assets/images/settings.png" width="470" alt="DesktopGo 设置页预览" />
    </td>
  </tr>
</table>

## ✨ 核心特性

### ⌨️ 启动台入口

- 默认使用 `Ctrl+Space` 呼出启动台，支持在设置中修改快捷键
- 托盘常驻，支持从托盘重新显示主窗口
- 主窗口默认失焦自动隐藏，也支持“窗口常驻”模式，适合把启动台固定在桌面
- 支持全屏、大、中三种窗口模式，以及“始终置顶”
- Dock 栏固定常用入口，支持线性预览

### 🧩 图标库与整理

- 统一图标库管理应用、快捷方式、文件和文件夹，支持从资源管理器直接拖入
- 拖拽排序、分页整理、跨页移动、文件夹创建与管理
- 支持“分页布局”和“滚动分组布局”两种视图：后者提供无限滚动、分组侧边栏和 FLIP 平滑重排动画
- 批量选择、隐藏、移出图标库；支持自定义显示名称（不改动原始文件）
- 添加图标时可配置启动参数、工作目录与自定义图标
- 支持 `customapp` 自定义入口目录，用于补充常用应用

### 🖥 应用发现与批量导入

- “快捷导入”可一键扫描桌面、开始菜单等位置的已安装应用，勾选后批量导入
- 目录扫描支持补充“注册应用”（注册表 App Paths），覆盖只装了 exe、没建快捷方式的应用
- 支持 Windows 商店应用（UWP / MSIX）

### 🤖 AI 智能整理

- 内置对话式 AI 整理面板，接入 OpenAI（Responses / Chat Completions 协议）与 Anthropic，或任意 OpenAI 兼容接口（自定义 Base URL、模型与推理力度）
- 流式输出，可查看模型思考过程并随时停止生成
- AI 自动分析图标用途并生成分组方案，网格预览确认后一键应用；滚动分组布局同样支持智能整理
- 内置“图标分类知识库”，分类条目可编辑，内置条目支持删除与恢复
- 支持会话与快照保留，面板切换间不丢上下文

### 🔎 全局搜索

- 集成 Everything 搜索能力，快捷入口与本地文件混合搜索
- “最佳匹配”把高频使用的图标与文件命中置顶，支持配置最佳匹配目录
- 支持搜索历史、筛选器（文件/文件夹/程序/图片/视频等）、排序和键盘导航
- 支持路径匹配、大小写匹配、正则表达式、全字匹配
- 支持结果预览面板，打开前确认内容
- 一次性加载完整结果快照 + 虚拟滚动，大结果集依然流畅

### 🎨 壁纸与外观

- 内置精选壁纸库：预置六张精选壁纸，离线可用、一键应用
- 在线壁纸源：Bing 每日壁纸、Wikimedia Commons、Wallhaven、Pexels
- 支持自定义本地图片作为背景，可调整蒙版浓度与模糊强度，背景支持裁剪与原图管理
- 亮色 / 暗色 / 跟随系统主题，主题色支持从壁纸自动提取
- 全局连续曲率（超椭圆）圆角体系：窗口轮廓与图标圆角统一
- 图标大小、圆角、透明度、标题行数均可调整；界面支持简体中文 / English 切换

### ⚙️ 设置与更新

- 设置页覆盖：常规、外观与壁纸、搜索行为、图标库管理、AI 设置、更新与关于
- 图标管理页支持查看、搜索、批量操作与无效图标扫描清理
- 已接入 GitHub Releases 更新通道：应用内检查并静默下载签名更新包（`latest.json` + 签名）

## 📊 特性对比

| 能力 | DesktopGo | Windows 原生桌面 | Everything 单独使用 |
| --- | --- | --- | --- |
| 统一入口 | 启动、整理、搜索整合在一个界面里 | 入口分散在桌面、开始菜单、资源管理器等位置 | 主要聚焦文件搜索 |
| 全局快捷键呼出 | 支持，默认 `Ctrl+Space` | 不以此为核心 | 支持搜索窗口，但不负责桌面整理 |
| 图标库整理 | 分页 / 滚动分组、拖拽、文件夹、Dock | 仅基础排列能力 | 不支持 |
| AI 智能分组 | 支持（需自行配置模型 API） | 无 | 无 |
| 文件搜索 | 支持，依赖已安装版 Everything | 有限 | 强项 |
| 搜索结果预览 | 支持 | 有限 | 非核心能力 |
| 壁纸与外观自定义 | 内置/在线壁纸库、主题色、圆角体系 | 基础壁纸 | 无 |
| 本地布局与设置持久化 | 支持 | 分散 | 仅搜索侧配置 |

## 🗺 路线图

### ✅ 已完成

- [x] 启动台全局快捷键、托盘常驻、失焦隐藏与窗口常驻
- [x] 统一图标库：拖拽排序、分页与滚动分组布局、文件夹和 Dock
- [x] 应用发现：开始菜单扫描、注册应用与 UWP/MSIX 商店应用、批量导入
- [x] Everything 混合搜索、最佳匹配、历史、筛选、排序和结果预览
- [x] AI 智能整理：多协议模型接入、分组方案预览与应用、分类知识库
- [x] 内置 / 在线壁纸库、主题与连续曲率外观体系
- [x] 设置页、图标管理页与 GitHub Releases 签名更新链路

## ⚠️ 当前限制

- 当前仅支持 Windows
- 文件搜索目前仅支持“已安装版 Everything”
- AI 整理需要自行配置模型 API（OpenAI / Anthropic 或兼容接口）
- `customapp` 目录目前只扫描一级，不递归子目录

## 🛠 快速开始

### 开发环境

- Node.js 与 `pnpm`
- Rust stable toolchain
- 满足 Tauri 在 Windows 下的构建前置要求，例如 WebView2 与 MSVC 构建工具链

### 本地运行

```bash
pnpm install
pnpm tauri dev
```

说明：

- `pnpm tauri dev` 会同时启动前端和 Tauri 桌面壳，是本项目的主要开发命令
- `pnpm dev` 只启动 Vite 前端开发服务器，适合纯界面调试，不适合验证完整桌面能力

## 📦 常用命令

- `pnpm tauri dev`：启动桌面开发环境
- `pnpm build`：构建前端产物到 `dist/`
- `pnpm tauri build`：构建桌面安装包
- `pnpm build:installer`：只构建 NSIS 安装包（含简体中文与英文资源），本地构建不产出更新签名产物，因此不需要 `TAURI_SIGNING_PRIVATE_KEY`
- `pnpm test`：运行仓库内前端脚本测试
- `pnpm lint` / `pnpm lint:fix`：执行 ESLint（`:fix` 自动修复）
- `pnpm format` / `pnpm format:check`：Prettier 格式化 / 校验
- `pnpm rust:quality`：Rust 全量质量门禁（fmt + 严格 clippy + check + test + 文件预算）

## 🧱 技术栈

- 前端：React 19、TypeScript、Vite 7、Tailwind CSS 4
- 桌面容器：Tauri 2（updater、global-shortcut、store、dialog 等官方插件）
- 本地能力：Rust、Windows API、rusqlite
- 状态与交互：Zustand、dnd-kit、Framer Motion、Radix UI
- 搜索：Everything SDK + IPC
- AI：OpenAI / Anthropic 协议直连（支持兼容网关）
- 持久化：Tauri Store + SQLite

## 📁 项目结构

```text
DesktopGo/
├─ src/                     # React 前端
├─ src-tauri/               # Tauri / Rust / NSIS 打包配置
│  ├─ src/                  # Tauri commands、Everything、图标目录、AI 与布局逻辑
│  ├─ nsis/                 # Windows 安装器钩子与语言文件
│  └─ resources/            # Everything SDK 与安装资源
├─ public/wallpapers/       # 内置精选壁纸
├─ website/                 # 官网静态页与 README 截图资源
├─ scripts/                 # 质量门禁与构建辅助脚本
├─ docs/
│  ├─ RELEASE_NOTES/        # 发布说明
│  └─ USER_GUIDE.*.md       # 中英文使用说明
├─ .github/workflows/       # CI / 发布 / 官网部署工作流
├─ LICENSE.txt              # 项目许可证
├─ README.en.md             # 英文文档
└─ README.md                # 中文默认文档
```

## 🧩 数据与目录说明

### `customapp` 目录

- 当 `customAppDir` 未显式配置时，DesktopGo 会默认使用“可执行文件同级目录下的 `customapp/`”
- 如果目录不存在，应用会自动创建
- 当前只扫描一级目录内容，不递归扫描子目录

### 本地持久化

- 常规设置通过 Tauri Store 写入 `settings.json`
- 启动台布局、搜索设置等状态通过 SQLite 写入本地应用数据目录下的 `app_state.db`
- AI 模型接入配置独立保存在 `aiConfig.json`（API Key 仅存本地）
- 壁纸原图、图标缓存等资源都保存在本地应用数据目录中
- 除 AI 模型调用与在线壁纸源外，所有功能本地运行，不依赖账号系统

## 🔧 排障建议

### 搜索不可用

优先检查下面几项：

- 是否已安装 Everything
- Everything 是否已经启动
- DesktopGo 与 Everything 是否使用相同权限级别运行
- 安装 DesktopGo 时是否勾选了 Everything 安装选项

### `customapp` 项未显示

- 确认设置页中的 `customAppDir` 是否指向预期目录
- 注意 `customapp` 只扫描一级目录，子目录内的文件不会被收录

### AI 整理不可用

- 检查“设置 → AI”中的模型接入配置（Base URL、API Key、模型名）
- 使用兼容网关时确认协议选择正确（OpenAI 兼容选 Responses 或 Chat Completions）
- 确认当前网络可以访问所选服务地址

## 🤝 友链

- [linux.do](https://linux.do/)

## 📄 许可证

本项目基于 MIT License 发布，详见 [`LICENSE.txt`](LICENSE.txt)。
