# DesktopGo 发布流程

本文档说明如何发布 DesktopGo 的新版本。

## 准备工作

### 1. 更新版本号

需要在以下 3 个文件中同步更新版本号（例如从 `1.0.7` 升级到 `1.0.8`）：

- `package.json` → `"version": "1.0.8"`
- `src-tauri/tauri.conf.json` → `"version": "1.0.8"`
- `src-tauri/Cargo.toml` → `version = "1.0.8"`

### 2. 创建发布说明

在 `docs/RELEASE_NOTES/` 目录下创建对应版本的发布说明文件，例如 `v1.0.8.md`。

**文件格式参考**：

```markdown
# DesktopGo v1.0.8 🎉

简要描述本次版本的主要更新方向。

## 新功能 🚀

- **功能名称**：功能描述

## 修复与优化 🛠️

- **修复项目**：修复描述
- **优化项目**：优化描述

本次发布已同步更新应用版本号（package.json / tauri.conf.json / Cargo.toml）与发布说明文件，满足现有 GitHub Actions 发布流程要求。
```

### 3. 提交更改

```bash
# 查看所有更改
git status

# 添加所有文件
git add .

# 提交
git commit -m "chore(release): 升级版本号至 1.0.8

准备发布 v1.0.8 版本，包含以下更新：
- 功能1描述
- 功能2描述
- 修复项描述

Co-Authored-By: Claude Code <noreply@anthropic.com>"

# 推送到 GitHub
git push origin desktop
```

## 发布步骤

### 第 1 步：创建测试构建

1. 访问：[Release Workflow](https://github.com/Aixbox/DesktopGo/actions/workflows/release.yml)

2. 点击 **"Run workflow"** 按钮

3. 选择分支：**desktop**

4. 点击 **"Run workflow"** 运行

**Workflow 会自动执行**：
- 检查版本号一致性（package.json / tauri.conf.json / Cargo.toml）
- 检查发布说明文件是否存在（`docs/RELEASE_NOTES/v<version>.md`）
- 构建 Windows 安装包（NSIS 格式）
- 创建草稿 Release，标签格式：`v<version>-test.<run_number>.<run_attempt>`
  - 例如：`v1.0.8-test.123.1`
- 上传安装包和 `latest.json`（应用内更新清单）

### 第 2 步：检查并发布 Release

1. 访问：[Releases 页面](https://github.com/Aixbox/DesktopGo/releases)

2. 找到刚创建的草稿 Release（标题类似：`DesktopGo 测试构建 v1.0.8（构建 123.1）`）

3. **检查内容**：
   - ✅ 发布说明是否正确
   - ✅ 安装包文件是否存在（`.exe` 文件）
   - ✅ `latest.json` 文件是否存在
   - ✅ 签名文件（`.sig`）是否存在

4. **编辑 Release**：
   - **修改标题**：`DesktopGo 测试构建 v1.0.8（构建 123.1）` → `DesktopGo v1.0.8`
   - **修改标签**：`v1.0.8-test.123.1` → `v1.0.8`
   - **删除警告信息**：删除顶部的 `> [!WARNING]` 警告块
   - **保留发布说明**：保留从 `docs/RELEASE_NOTES/v1.0.8.md` 读取的内容

5. 点击 **"Publish release"** 正式发布

### 第 3 步：修复应用内更新 URL（⚠️ 重要）

**为什么需要这一步？**

虽然你在第 2 步手动将标签从 `v1.0.8-test.123.1` 改为 `v1.0.8`，但 `latest.json` 文件中的下载 URL 仍然指向测试标签，导致应用内更新时会出现 404 错误。

**操作步骤**：

1. 访问：[Finalize Release Workflow](https://github.com/Aixbox/DesktopGo/actions/workflows/finalize-release.yml)

2. 点击 **"Run workflow"** 按钮

3. 选择分支：**desktop**

4. 输入版本号：**1.0.8**（可以带 `v` 前缀：`v1.0.8`）

5. 点击 **"Run workflow"** 运行

**Workflow 会自动执行**：
- 下载 Release 中的 `latest.json`
- 将下载 URL 从 `v1.0.8-test.123.1` 改写为 `v1.0.8`
- 验证新 URL 是否可访问
- 重新上传修复后的 `latest.json` 到 Release

### 第 4 步：验证发布

1. **验证 Release 页面**：
   - 访问：https://github.com/Aixbox/DesktopGo/releases/latest
   - 确认标签是 `v1.0.8`（不是测试标签）
   - 确认安装包可以下载

2. **验证应用内更新**：
   - 下载 `latest.json`：
     ```
     https://github.com/Aixbox/DesktopGo/releases/download/v1.0.8/latest.json
     ```
   - 检查 JSON 内容，确保所有 URL 都指向正式标签 `v1.0.8`（不是测试标签）

3. **测试安装包**：
   - 下载并安装新版本
   - 验证功能是否正常
   - 测试应用内更新功能

## 常见问题

### Q1: Release workflow 失败，提示版本号不一致

**原因**：package.json、tauri.conf.json、Cargo.toml 中的版本号不一致。

**解决**：确保这三个文件中的版本号完全相同。

### Q2: Release workflow 失败，提示找不到发布说明文件

**原因**：`docs/RELEASE_NOTES/v<version>.md` 文件不存在。

**解决**：创建对应版本的发布说明文件。

### Q3: 应用内更新出现 404 错误

**原因**：忘记运行 finalize-release workflow，`latest.json` 中的 URL 仍指向测试标签。

**解决**：运行 finalize-release workflow（第 3 步）。

### Q4: 如何跳过测试构建直接发布正式版本？

**答案**：目前的工作流设计就是先创建测试构建，然后手动转正。这样可以：
- 在发布前检查构建产物
- 避免误发布
- 保留测试构建的记录

如果需要修改工作流直接发布正式版本，可以编辑 `.github/workflows/release.yml`。

## Workflow 文件说明

### release.yml

- **触发方式**：手动触发（workflow_dispatch）
- **用途**：创建测试构建
- **输出**：草稿 Release + 测试标签 + 安装包 + latest.json

### finalize-release.yml

- **触发方式**：手动触发，需要输入版本号
- **用途**：修复 `latest.json` 中的下载 URL
- **输入**：正式版本号（如 `1.0.8` 或 `v1.0.8`）
- **输出**：修复后的 `latest.json`

## 版本号规范

DesktopGo 使用 [语义化版本](https://semver.org/lang/zh-CN/)：`MAJOR.MINOR.PATCH`

- **MAJOR**（主版本号）：不兼容的 API 修改
- **MINOR**（次版本号）：向下兼容的功能性新增
- **PATCH**（修订号）：向下兼容的问题修正

例如：
- `1.0.8` → 修复和小优化
- `1.1.0` → 新增功能
- `2.0.0` → 重大更新，可能不兼容旧版本

## 相关链接

- [GitHub Actions - Release Workflow](https://github.com/Aixbox/DesktopGo/actions/workflows/release.yml)
- [GitHub Actions - Finalize Release Workflow](https://github.com/Aixbox/DesktopGo/actions/workflows/finalize-release.yml)
- [GitHub Releases](https://github.com/Aixbox/DesktopGo/releases)
- [Tauri Updater 文档](https://v2.tauri.app/plugin/updater/)
