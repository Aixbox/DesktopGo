# DesktopGo 安装流程集成安装版 Everything 功能设计

## 1. 需求澄清

本方案严格按以下约束设计：

1. **DesktopGo 只能使用安装版 Everything**，不再存在“优先安装版、回退 portable”的逻辑。
2. **Everything 的安装入口必须放在 DesktopGo 安装流程中**，而不是 DesktopGo 应用内新增检测/安装引导页。
3. 用户在安装 DesktopGo 时，可以选择是否同时安装 Everything。
4. 如果系统已经安装了安装版 Everything，则安装器中不再重复安装。
5. 如果用户选择不安装 Everything，DesktopGo 仍可安装完成，但搜索功能不可用。

## 2. 现状与问题

当前仓库中的搜索实现仍是 **portable-only** 思路：

- `src-tauri/src/everything/models.rs` 中 provider 只有 `portable`
- `src-tauri/src/everything/runtime.rs` 的启动链路只会尝试 portable runtime
- `src-tauri/src/everything/portable.rs` 依赖 `everything.exe`
- `src/components/search/SearchSettingsPanel.tsx` 仍暴露 `Portable Service Pipe Name`
- `src-tauri/nsis/installer-hooks.nsh` 也写了 `Portable-only mode`

这与目标需求完全相反，因此本次改动不是“补一个安装选项”这么简单，而是要把搜索依赖模型整体改成：

**DesktopGo 搜索 = 安装版 Everything 必选依赖**

## 3. 目标

### 3.1 产品目标

1. 在 DesktopGo 安装器中增加 “安装 Everything” 选项。
2. 安装器能检测系统是否已安装安装版 Everything。
3. 已安装时，跳过 Everything 安装步骤。
4. 未安装时，用户可选择一起安装。
5. DesktopGo 运行后只连接安装版 Everything。
6. DesktopGo 内不新增 Everything 安装向导页。

### 3.2 技术目标

1. 删除 portable runtime 依赖。
2. 搜索 provider 改成 `installed-only`。
3. 安装阶段完成 Everything 检测与可选安装。
4. DesktopGo 运行时只负责连接/检测安装版 Everything 是否可用，不负责弹安装引导页。

## 4. 非目标

1. 不保留 portable 模式。
2. 不在 DesktopGo 内新增 Everything 安装/引导页面。
3. 不支持运行时在 `portable / installed` 间切换。
4. 不在本期做 Everything 高级配置管理。

## 5. 总体方案

## 方案结论

本功能拆成两部分：

### A. 安装器层

在 `DesktopGo` 的 NSIS 安装流程中增加一个 **Everything 安装选项页**：

- 如果已检测到安装版 Everything：
  - 显示“已检测到安装版 Everything”
  - 不执行重复安装
- 如果未检测到安装版 Everything：
  - 提供复选框：`安装 Everything（用于 DesktopGo 搜索）`
  - 默认勾选
  - 用户可取消勾选继续安装 DesktopGo

### B. 应用层

DesktopGo 启动后：

- 只连接安装版 Everything
- 不再尝试拉起 portable runtime
- 不新增安装向导页
- 如果用户没有安装 Everything，只显示“搜索不可用”的状态提示

## 6. 安装器产品设计

### 6.1 安装器页面目标

在 DesktopGo 安装流程中新增一页：

- 页面名建议：`搜索组件`
- 副标题建议：`DesktopGo 搜索功能依赖安装版 Everything`

### 6.2 页面展示逻辑

#### 状态 1：系统已安装 Everything

展示：

- 文案：`已检测到安装版 Everything`
- 附加信息：版本号、安装路径（如可获取）
- 复选框：不展示，或展示为禁用状态
- 继续按钮：正常进入下一步

#### 状态 2：系统未安装 Everything

展示：

- 说明文案：`DesktopGo 的文件搜索依赖安装版 Everything`
- 复选框：`安装 Everything（推荐）`
- 默认：勾选
- 提示文案：`如果不安装，DesktopGo 安装后搜索功能不可用`

#### 状态 3：检测失败

展示：

- 文案：`无法确认 Everything 是否已安装`
- 默认策略：仍显示复选框，并默认勾选
- 提示：`建议勾选安装，避免搜索功能不可用`

### 6.3 用户流程

#### 流程 A：系统已安装 Everything

1. 用户启动 DesktopGo 安装器
2. 安装器检测到安装版 Everything
3. 安装器展示“已安装”
4. 用户继续安装 DesktopGo
5. 安装结束后不执行 Everything 安装

#### 流程 B：系统未安装，用户勾选安装

1. 用户启动 DesktopGo 安装器
2. 安装器检测到未安装 Everything
3. 用户保留勾选“安装 Everything”
4. DesktopGo 安装完成后，安装器拉起 Everything 官方安装程序
5. Everything 安装完成后，DesktopGo 搜索可用

#### 流程 C：系统未安装，用户取消勾选

1. 用户启动 DesktopGo 安装器
2. 安装器检测到未安装 Everything
3. 用户取消勾选
4. DesktopGo 继续安装完成
5. 启动 DesktopGo 后，搜索显示不可用状态，但不出现应用内安装向导页

## 7. 技术设计

### 7.1 安装器实现原则

由于需求明确要求“选项出现在 DesktopGo 安装流程中”，因此实现重心在 **NSIS 安装器**，不是 React/Tauri 页面。

### 7.2 NSIS 实现方式

建议采用：

1. **自定义 NSIS 安装模板**
2. **新增 Everything 选项页**
3. **在安装完成阶段按用户选择执行 Everything 安装**

原因：

- 当前 `installerHooks` 只能补安装前后逻辑，不适合承载一个真正可交互的安装选项页
- 要实现“安装时复选框/状态页”，更适合直接改 NSIS 模板

### 7.3 安装器资源方案

建议将 **官方 Everything 安装程序** 作为 DesktopGo 安装资源的一部分一并打包。

推荐资源组织：

- `src-tauri/resources/third-party/everything/x64/Everything-Setup.exe`
- `src-tauri/resources/third-party/everything/LICENSE.txt`

注意：

1. 必须使用 **完整安装版**，不能使用 Lite 版本。
2. 如果未来支持多架构，需要分别打包 x64/x86 对应安装器。

### 7.4 安装器检测逻辑

安装器启动时执行 Everything 检测，判断是否已安装。

建议检测顺序：

1. 卸载注册表项
2. 安装目录是否存在 `Everything.exe`
3. Everything 服务是否存在

满足任一条件即可判定“已安装”。

### 7.5 安装执行逻辑

推荐 Phase 1 采用最稳妥的方式：

**勾选后由 DesktopGo 安装器拉起 Everything 官方安装程序。**

执行时机建议：

1. DesktopGo 文件复制完成后
2. Finish 页之前，或 Finish 页勾选启动前
3. 如果用户选择安装 Everything，则启动官方安装程序

这样做的优点：

- 实现简单
- 不需要在 DesktopGo 内再做安装页面
- 安装版 Everything 仍由其官方安装程序负责

### 7.6 应用运行时改造

应用侧只做一件事：

**连接安装版 Everything 并执行搜索。**

应用侧不再负责：

- portable runtime 启动
- portable service pipe 管理
- Everything 安装引导页

### 7.7 搜索运行时状态

建议将搜索 provider 和状态改成安装版语义：

```ts
SearchProvider = "installed"

SearchRuntimeState =
  | "unknown"
  | "installed_ready"
  | "not_installed"
  | "unavailable"
```

说明：

- `installed_ready`：已检测到安装版 Everything，且 IPC 可用
- `not_installed`：未检测到安装版 Everything
- `unavailable`：已安装但当前无法连接

### 7.8 应用内表现

由于不允许新增安装引导页，因此应用内只保留最小化状态反馈：

- 搜索可用：正常工作
- 搜索不可用：显示 `未检测到安装版 Everything，搜索功能不可用`

不新增：

- 安装向导页
- 首次启动引导页
- 应用内安装按钮主流程

## 8. 前后端改动清单

### 8.1 安装器相关

#### 需要新增

- `src-tauri/nsis/template.nsi`
- `src-tauri/nsis/includes/everything-installer.nsh`
- `src-tauri/resources/third-party/everything/...`

#### 需要修改

- `src-tauri/tauri.conf.json`
  - 增加 NSIS 自定义模板配置
- `src-tauri/nsis/installer-hooks.nsh`
  - 只保留安装前后辅助逻辑，核心交互迁移到模板

### 8.2 Rust 后端

#### 需要修改

- `src-tauri/src/everything/models.rs`
  - provider 改为 `installed`
- `src-tauri/src/everything/runtime.rs`
  - 删除 portable 启动逻辑
  - 改为只连接安装版 Everything
- `src-tauri/src/everything/mod.rs`
- `src-tauri/src/commands.rs`

#### 需要删除或废弃

- `src-tauri/src/everything/portable.rs`
- `stop_portable_runtime`

### 8.3 前端

#### 需要修改

- `src/lib/search/types.ts`
  - provider/state 改为安装版语义
- `src/lib/search/settings.ts`
  - 移除 `portableServicePipeName`
- `src/components/search/SearchSettingsPanel.tsx`
  - 删除 portable 相关配置项
- `src/components/search/SearchPanel.tsx`
  - provider 文案改成 `installed`

#### 明确不新增

- `EverythingOnboarding`
- 首次启动引导页
- 应用内安装流程页

## 9. 推荐实施顺序

### 里程碑 1：先切断 portable

1. provider 改为 `installed-only`
2. 删除 portable 启动链路
3. 搜索失败状态改成“未安装/不可用”

### 里程碑 2：实现安装器选项页

1. 引入自定义 NSIS 模板
2. 增加 Everything 检测逻辑
3. 增加“安装 Everything”复选框

### 里程碑 3：接入官方安装程序

1. 打包 Everything 官方安装器资源
2. 按复选框结果执行安装
3. 已安装场景自动跳过

### 里程碑 4：清理应用内遗留 portable 文案

1. 删除 `Portable Service Pipe Name`
2. 删除 `portable` provider 展示
3. 清理相关错误文案

## 10. 验收标准

### 安装器验收

1. DesktopGo 安装流程中存在明确的 Everything 安装选项页。
2. 已安装 Everything 时，安装器能识别并跳过重复安装。
3. 未安装 Everything 时，用户可选择是否一起安装。
4. 用户取消勾选后，DesktopGo 仍能安装完成。

### 应用验收

1. DesktopGo 不再尝试启动 portable runtime。
2. 搜索 provider 不再出现 `portable`。
3. 未安装 Everything 时，应用内只显示搜索不可用状态，不出现安装引导页。
4. 已安装 Everything 时，搜索可正常工作。

### 代码验收

1. 不再依赖 `portableServicePipeName`
2. 不再依赖 `stop_portable_runtime`
3. 搜索链路改为 `installed-only`

## 11. 风险与开放问题

### 11.1 第三方安装器分发

需要确认：

- Everything 官方安装器是否允许随 DesktopGo 分发
- 版本更新策略如何管理

### 11.2 架构匹配

若 DesktopGo 后续支持多架构：

- x64 DesktopGo 需打包 x64 Everything 安装器
- x86 DesktopGo 需打包 x86 Everything 安装器

### 11.3 安装取消场景

如果用户在 DesktopGo 安装器里勾选了安装 Everything，但随后取消了 Everything 官方安装：

- DesktopGo 仍安装成功
- 搜索不可用
- 不通过应用内向导补救

### 11.4 Lite 版本不可用

必须避免接入 Lite Installer，因为搜索依赖 IPC/SDK 能力。

## 12. 结论

本功能的正确方向不是“在 DesktopGo 里补一个 Everything 检测/安装页”，而是：

**在 DesktopGo 安装器中增加 Everything 安装选项，并把 DesktopGo 搜索彻底改成 installed-only。**

一句话概括实施方案：

**安装时可选安装 Everything，运行时只认安装版 Everything，应用内不再出现 portable，也不新增安装引导页。**

