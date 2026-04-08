<p align="center">
  <img src="./public/logo.svg" width="92" alt="DesktopGo logo" />
</p>

<p align="center">
  <strong>简体中文</strong> | <a href="./README.en.md">English</a>
</p>

<h1 align="center">DesktopGo</h1>

<p align="center">
  一个面向 Windows 的桌面启动台，把应用唤起、图标整理和 Everything 文件搜索收进同一个入口。
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

DesktopGo 是一个使用 Tauri 2 + React 19 + Rust 构建的 Windows 桌面启动台。它参考 macOS Launchpad 的交互方式，但能力设计围绕 Windows 桌面场景展开，重点解决三个问题：

- 用全局快捷键快速呼出统一入口
- 把桌面图标和自定义应用入口整理成可拖拽、可分页的布局
- 基于 Everything 提供快速文件搜索、预览和打开能力

## 🚀 下载

如果你只是想使用 DesktopGo，不需要本地安装 Node.js 或 Rust，直接从 Releases 下载即可：

- 最新版本：<https://github.com/Aixbox/DesktopGo/releases/latest>
- 所有发布：<https://github.com/Aixbox/DesktopGo/releases>
- `1.0.1` 发布说明：[`docs/RELEASE_NOTES/v1.0.1.md`](docs/RELEASE_NOTES/v1.0.1.md)
- 详细使用说明（中文）：[`docs/USER_GUIDE.zh-CN.md`](docs/USER_GUIDE.zh-CN.md)
- User Guide (English): [`docs/USER_GUIDE.en.md`](docs/USER_GUIDE.en.md)

安装说明：

1. 下载最新安装包并执行安装。
2. 如果系统中还没有 Everything，保持安装器里的“安装 Everything”选项勾选。
3. 安装完成后，使用默认快捷键 `Ctrl+Space` 呼出启动台。

## 🖼 截图预览

<table>
  <tr>
    <td colspan="2" align="center">
      <img src="./website/assets/images/icon-grid.png" width="960" alt="DesktopGo 启动台主界面预览占位图" />
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="./website/assets/images/search-panel.png" width="470" alt="DesktopGo 搜索面板预览占位图" />
    </td>
    <td align="center">
      <img src="./website/assets/images/settings.png" width="470" alt="DesktopGo 设置页预览占位图" />
    </td>
  </tr>
</table>



## ✨ 核心特性

### ⌨️ 启动台入口

- 默认使用 `Ctrl+Space` 呼出启动台，且支持在设置中修改快捷键
- 托盘常驻，支持从托盘重新显示主窗口
- 主窗口失焦自动隐藏，适合快速打开、快速关闭的工作流
- 支持 `fullscreen`、`large`、`medium`、`small` 四种窗口模式

### 🧩 图标整理

- 读取桌面图标并展示为启动台网格
- 支持拖拽排序、分页整理、跨页移动
- 支持文件夹创建、重命名和打开
- 支持 Dock 区固定常用入口
- 支持批量选择、隐藏、删除图标
- 图标布局、显示顺序和相关设置保存在本地
- 支持 `customapp` 自定义入口目录，用于补充桌面之外的常用应用

### 🔎 文件搜索

- 集成 Everything 搜索能力
- 支持搜索历史、筛选器、排序和键盘导航
- 支持结果预览，便于打开前确认内容
- 支持虚拟滚动和按需加载，适合大结果集
- 搜索栏可在“桌面图标搜索”和“Everything 搜索”之间切换

### ⚙️ 设置与更新

- 支持主题切换、图标大小、标题行数、Dock 开关等设置
- 支持搜索行为设置，例如实时搜索、默认筛选器、默认排序、结果页大小
- 提供图标管理页，可对桌面和 `customapp` 来源执行增量/全量同步
- 已接入 GitHub Releases 更新通道

## 📊 特性对比

| 能力 | DesktopGo | Windows 原生桌面 | Everything 单独使用 |
| --- | --- | --- | --- |
| 统一入口 | 启动、整理、搜索整合在一个界面里 | 入口分散在桌面、开始菜单、资源管理器等位置 | 主要聚焦文件搜索 |
| 全局快捷键呼出 | 支持，默认 `Ctrl+Space` | 不以此为核心 | 支持搜索窗口，但不负责桌面整理 |
| 桌面图标整理 | 支持分页、拖拽、文件夹、Dock | 仅基础排列能力 | 不支持 |
| 文件搜索 | 支持，依赖已安装版 Everything | 有限 | 强项 |
| 搜索结果预览 | 支持 | 有限 | 非核心能力 |
| 本地布局与设置持久化 | 支持 | 分散 | 仅搜索侧配置 |

## 🗺 路线图

### ✅ 已完成

- [x] 启动台全局快捷键、托盘常驻、主窗口失焦自动隐藏
- [x] 桌面图标读取、拖拽排序、分页整理、文件夹和 Dock
- [x] Everything 搜索、搜索历史、筛选、排序和结果预览
- [x] 设置页、图标管理页和 GitHub Releases 更新链路

### 🔜 下一阶段

## ⚠️ 当前限制

- 当前仅支持 Windows
- 文件搜索目前仅支持“已安装版 Everything”

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
- `pnpm test`：运行当前仓库里的前端脚本测试
- `pnpm lint`：执行 ESLint
- `pnpm lint:fix`：自动修复可处理的 ESLint 问题
- `pnpm format`：格式化 `src/**/*.{ts,tsx,css}`

## 🧱 技术栈

- 前端：React 19、TypeScript、Vite 7
- 桌面容器：Tauri 2
- 本地能力：Rust、Windows API、rusqlite
- 状态与交互：Zustand、dnd-kit、Framer Motion、Radix UI
- 搜索：Everything SDK + IPC
- 持久化：Tauri Store + SQLite

## 📁 项目结构

```text
DesktopGo/
├─ src/                     # React 前端
├─ src-tauri/               # Tauri / Rust / NSIS 打包配置
│  ├─ src/                  # Tauri commands、Everything、图标与布局逻辑
│  ├─ nsis/                 # Windows 安装器钩子与语言文件
│  └─ resources/            # Everything SDK 与安装资源
├─ docs/
│  ├─ RELEASE_NOTES/        # 发布说明
│  └─ screenshots/          # README 截图资源
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
- 图标整理和搜索运行时相关信息都以“本地优先”的方式保存，不依赖远端服务

## 🔧 排障建议

### 搜索不可用

优先检查下面几项：

- 是否已安装 Everything
- Everything 是否已经启动
- DesktopGo 与 Everything 是否使用相同权限级别运行
- 安装 DesktopGo 时是否勾选了 Everything 安装选项

### `customapp` 项未显示

- 确认设置页中的 `customAppDir` 是否指向预期目录
- 新增文件后，到设置页执行一次增量同步
- 如果你刚整理过整个目录，执行一次全量同步更稳妥

## 📄 许可证

本项目基于 MIT License 发布，详见 [`LICENSE.txt`](LICENSE.txt)。
