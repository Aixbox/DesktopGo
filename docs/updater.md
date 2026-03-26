# DesktopGo 更新功能说明

## 当前接入方式

- 设置页已经接入“检查更新 / 下载并安装”界面。
- Tauri 侧使用 `tauri-plugin-updater`，更新配置通过**构建期环境变量**嵌入到应用里。
- 如果没有注入更新配置，设置页会显示“等待配置”，但应用本身仍可正常运行。

## 必备环境变量

### 应用内嵌的更新配置

- `DESKTOPGO_UPDATER_PUBKEY`
  - Tauri updater 的公钥。
  - 这个值会在编译时写进应用，供客户端校验更新包签名。
- `DESKTOPGO_UPDATER_ENDPOINTS`
  - 更新地址，支持单个 URL、以换行/分号/逗号分隔的多个 URL，或 JSON 数组字符串。
  - 推荐直接指向 `latest.json`，例如：
    - `https://github.com/<owner>/<repo>/releases/latest/download/latest.json`
- `DESKTOPGO_UPDATER_TARGET`
  - 可选。
  - 只有在你需要自定义 updater target 时才需要提供。

### 生成更新包签名所需的变量

- `TAURI_SIGNING_PRIVATE_KEY`
  - updater 私钥。
  - 用于在构建时给更新包签名。
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
  - 可选。
  - 如果私钥有密码保护，需要同时提供。

## GitHub Actions Secrets

建议至少配置以下 secrets：

- `TAURI_UPDATER_PUBKEY`
- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

说明：

- `TAURI_UPDATER_PUBKEY` 会映射到应用构建变量 `DESKTOPGO_UPDATER_PUBKEY`。
- `TAURI_SIGNING_PRIVATE_KEY` 是 updater 签名私钥，不是 Windows 代码签名证书。
- 如果后续要减少 Windows SmartScreen 警告，还需要额外准备 Windows 代码签名证书，这部分当前工作流还没有自动接入。

## 本地测试

PowerShell 示例：

```powershell
$env:DESKTOPGO_UPDATER_PUBKEY = @'
<你的 updater 公钥>
'@

$env:DESKTOPGO_UPDATER_ENDPOINTS = 'https://github.com/<owner>/<repo>/releases/latest/download/latest.json'
$env:TAURI_SIGNING_PRIVATE_KEY = @'
<你的 updater 私钥>
'@

pnpm.cmd tauri build
```

如果只想验证 UI 是否已经接入，不设置这些变量也可以启动应用，更新页会明确提示缺少的配置项。

## 发布建议

- 先递增 [tauri.conf.json](D:/Project/self/DesktopGo/src-tauri/tauri.conf.json) 里的 `version`。
- 通过 `.github/workflows/release.yml` 手动触发发布。
- 构建完成后，GitHub Release 里会带上安装包和 updater 相关产物。
- 客户端更新源建议统一使用 GitHub Release 的 `latest.json` 地址。
