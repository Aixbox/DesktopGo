# DesktopGo 后续开发路线图

> 用于集中记录尚未开始或需要继续完善的开发事项。每次实施前补充范围与验收条件，完成后同步更新状态和实现说明。

## 状态说明

- `待开发`：已确认需要实现，但尚未开始。
- `进行中`：已经进入开发或验证阶段。
- `已完成`：实现、测试和文档均已完成。
- `暂缓`：保留需求，但当前不进入开发计划。

## 当前事项

| 编号 | 优先级 | 状态 | 事项 | 目标 |
| --- | --- | --- | --- | --- |
| D-001 | P0 | 待开发 | 安装包启动时先选择语言 | 使用一个安装包承载简体中文和英文；启动安装包后首先选择语言，再进入对应语言的完整安装流程。 |

## D-001：安装包启动时先选择语言

### 当前基线

- 当前通过 `src-tauri/tauri.nsis.zh.conf.json` 和 `src-tauri/tauri.nsis.en.conf.json` 分别构建简体中文、英文安装包。
- `scripts/build-installers.ps1` 会生成带 `zh-CN` 和 `en-US` 后缀的两个发布产物。
- GitHub Actions 发布流程会分别上传这两个本地化安装包。

### 目标流程

1. 用户打开 DesktopGo 安装包。
2. 安装器首先显示语言选择界面，至少提供“简体中文”和“English”。
3. 用户确认语言后，安装器才进入欢迎页面。
4. 后续安装选项、安装路径、进度、完成页面和错误提示全部使用所选语言。
5. 用户取消语言选择或安装流程时，不写入不完整的安装状态。

### 验收标准

- 发布产物中提供一个同时包含简体中文和英文资源的 Windows 安装包。
- 安装包启动后的第一个交互界面是语言选择，而不是固定语言的欢迎页面。
- 选择简体中文后，完整安装流程不出现不必要的英文安装器文案。
- 选择 English 后，完整安装流程不出现不必要的中文安装器文案。
- 自定义安装步骤和提示（包括 Everything 相关选项）会跟随所选语言。
- 两种语言下均可正常完成安装、取消安装和卸载。
- 安装包签名、应用内更新产物和 GitHub Releases 发布流程保持可用。

### 预计影响范围

- `src-tauri/tauri.conf.json`
- `src-tauri/tauri.nsis.zh.conf.json`
- `src-tauri/tauri.nsis.en.conf.json`
- `src-tauri/nsis/installer-hooks.nsh`
- `src-tauri/nsis/SimpChinese.nsh`
- `src-tauri/nsis/English.nsh`
- `scripts/build-installers.ps1`
- `.github/workflows/release.yml`

### 边界说明

- 安装器语言与 DesktopGo 应用内界面语言暂时独立；除非后续另行设计，不因安装器语言自动修改应用语言设置。
- 本事项只覆盖 Windows NSIS 安装包，不扩展到其他操作系统或安装格式。

## 完成检查

1. 更新事项状态和实际实现说明。
2. 分别在简体中文和英文 Windows 环境验证安装流程。
3. 检查安装、取消、覆盖安装、卸载和 Everything 可选安装流程。
4. 验证本地构建脚本与 GitHub Actions 发布流程。
5. 更新 README、用户指南和对应版本发布说明。
