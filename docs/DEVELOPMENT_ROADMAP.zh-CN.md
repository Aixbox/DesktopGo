# DesktopGo 后续开发路线图

> 用于集中记录尚未开始或需要继续完善的开发事项。每次实施前补充范围与验收条件，完成后同步更新状态和实现说明。

## 状态说明

- `待开发`：已确认需要实现，但尚未开始。
- `进行中`：已经进入开发或验证阶段。
- `已完成`：实现、测试和文档均已完成。
- `暂缓`：保留需求，但当前不进入开发计划。

## 当前事项

| 编号  | 优先级 | 状态   | 事项                            | 目标                                                                                                   |
| ----- | ------ | ------ | ------------------------------- | ------------------------------------------------------------------------------------------------------ |
| D-001 | P0     | 待开发 | 安装包启动时先选择语言          | 使用一个安装包承载简体中文和英文；启动安装包后首先选择语言，再进入对应语言的完整安装流程。             |
| D-002 | P0     | 进行中 | ESLint 告警清零与超大文件模块化 | 将当前 79 条 ESLint 告警分批降至 0；逐步把 11 个超预算手写文件拆回清晰的视图、控制器、领域和服务边界。 |

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

## D-001 完成检查

1. 更新事项状态和实际实现说明。
2. 分别在简体中文和英文 Windows 环境验证安装流程。
3. 检查安装、取消、覆盖安装、卸载和 Everything 可选安装流程。
4. 验证本地构建脚本与 GitHub Actions 发布流程。
5. 更新 README、用户指南和对应版本发布说明。

## D-002：ESLint 告警清零与超大文件模块化

### 当前基线

截至 2026-07-27，第一阶段 ESLint 配置治理已经完成：

- `pnpm lint` 限定检查 `src`、`vite.config.ts` 和 `eslint.config.js`，当前为 `0 errors / 79 warnings`。
- `pnpm lint:strict` 保留 `--max-warnings 0`，用于衡量技术债是否真正清零。
- ESLint 与 Prettier 已解耦，并提供独立的 `format` 和 `format:check` 命令。
- React Compiler 相关规则只在 8 个明确列出的旧文件中临时降级为 warning，不允许扩大例外范围。
- 当前 79 条告警分布为：`exhaustive-deps` 41 条、`set-state-in-effect` 20 条、`max-lines` 11 条、`immutability` 4 条、`refs` 3 条；`only-export-components` 已清零。
- E-01 完成时的 68 条功能代码告警没有回升；当前新增的 11 条全部来自后续启用的 1000 行 `max-lines` 门禁。
- 当前有 11 个手写 `.ts/.tsx` 文件超过统一的 1000 行模块预算；ESLint 与变更文件预算脚本使用相同阈值。

### 治理原则

1. 不通过全局关闭规则、扩大 legacy 文件列表、增加无说明的 ESLint disable 或把 warning 改成 off 来完成清零。
2. `exhaustive-deps` 不机械补依赖：先判断值属于纯计算、稳定回调、事件读取还是外部同步，再选择移动纯逻辑、`useCallback`、事件处理器或控制器边界。
3. `set-state-in-effect` 优先通过派生状态、事件入口重置、reducer 状态转换或带 key 的子树生命周期处理；不得用延时器或微任务只为绕过规则。
4. render 期间的 ref 写入必须移到 effect、事件处理器或显式控制器；递归 callback 和相互调度逻辑必须改成可测试的迭代策略或单一调度器。
5. 拆分按责任进行，不创建 `part1`、`helpers2` 或只转发参数的包装文件。视图只负责渲染与直接交互，Hook/控制器负责生命周期，domain 负责纯规则，service/adapter 负责持久化与平台调用。
6. 超预算旧文件不得继续增加物理行数。允许短期保留 facade，但 facade 必须只做组合/委派，并在每个批次中持续缩小。
7. 格式化、重命名、行为调整和结构抽取尽量分开提交，保证每批差异可审查、可回滚。

### ESLint 告警清零批次

| 批次 | 状态   | 范围                          | 当前告警 | 处理策略                                                                                                                                                                | 完成后目标 |
| ---- | ------ | ----------------------------- | -------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------: |
| E-00 | 已完成 | ESLint/Prettier 基线          |        - | 收窄检查范围、移除 `eslint-plugin-prettier`、增加 `lint:strict` 和格式检查。                                                                                            |         81 |
| E-01 | 已完成 | Fast Refresh 导出边界         |       13 | 文件夹视觉 policy、按钮变体和输入样式已与组件分离；i18n 已拆出语言运行态、Context/Hook 和仅导出组件的 Provider，组件文件不再混合导出纯能力。                            |         68 |
| E-02 | 待开发 | 搜索、设置、AI 和图标编辑流程 |       16 | 处理 `useSearch.ts` 的递归 callback、分页调度和 effect 状态同步；将设置加载、更新检查、AI 步骤状态和图标预览重置移动到明确的事件或控制器状态转换。                      |         63 |
| E-03 | 待开发 | 分页图标网格                  |       29 | 覆盖 `IconGrid.tsx`、`useIconGridDragWorkflow.ts`、`DragOverlays.tsx`、`DockBar.tsx` 和 `FolderModalView.tsx`；先抽取生命周期与拖拽控制器，再修复依赖、ref 和派生状态。 |         34 |
| E-04 | 待开发 | 滚动图标网格                  |       23 | 覆盖 `ScrollableIconGrid.tsx` 和 `useScrollableIconGridDragWorkflow.ts`；复用分页网格已经稳定的纯策略与控制器接口，清理重复的拖拽、自动翻页、预览和 ref 同步逻辑。      |         11 |
| E-05 | 待开发 | 恢复零告警门禁                |       11 | 完成超大文件治理并清零 `max-lines`，删除 8 个 legacy 文件规则降级，令日常 `lint` 启用 `--max-warnings 0`；`lint:strict` 可保留为 CI 别名或合并为同一命令。              |          0 |

每个批次必须严格达到表中的告警目标；如果发现新增告警，必须在同一批次处理，不能把基线数字向上调整。

### 超大文件治理轨道

告警清理和文件拆分必须同步进行。优先处理同时携带告警的模块，随后处理虽然暂时无告警、但已经形成职责聚合的文件。

| 轨道                  | 优先级 | 文件与当前规模                                                                                                                                                | 目标边界                                                                                                                                                                                                                         |
| --------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M-01 搜索与启动台     | P0     | `Launchpad.tsx` 2137、`SearchPanel.tsx` 839、`useSearch.ts` 904                                                                                               | `Launchpad` 仅组合主窗口区域；搜索范围、键盘导航和启动流程进入 feature controller；`SearchPanel` 拆为结果列表、历史和预览布局；`useSearch` 拆为查询、分页、选择、历史和设置 facade。最终每个手写 TypeScript 模块不超过 1000 行。 |
| M-02 分页图标网格     | P0     | `IconGrid.tsx` 1690、`useIconGridDragWorkflow.ts` 1953、`useDragDropCommit.ts` 764、`DragOverlays.tsx` 672、`DockBar.tsx` 896、`OuterFolderTile.tsx` 537      | `IconGrid` 降为组合根；水合、分页、文件夹、导入放置和选择分别由 feature hooks/controllers 管理；拖拽 session、目标解析、预览和 commit 分离；视图组件不持有持久化或平台逻辑。                                                     |
| M-03 滚动图标网格     | P0     | `ScrollableIconGrid.tsx` 2474、`ScrollableOuterGridView.tsx` 2133、`useScrollableIconGridDragWorkflow.ts` 2716、`useScrollableDragDropCommit.ts` 810          | 先定义与分页网格共享的纯拖拽策略合同，再拆滚动分组、可视区域、自动滚动、拖拽预览和提交控制器；禁止复制分页网格修复。最终每个组合视图、Hook 或控制器不超过 1000 行。                                                              |
| M-04 图标网格领域规则 | P1     | `dragMovePolicy.ts` 1669、`topLevelLayout.ts` 1029、`dropPolicy.ts` 667、`scrollDropPolicy.ts` 800、`scrollGroupLayout.ts` 522、`scrollTopLevelLayout.ts` 447 | 按稳定规则拆为坐标/占位、候选目标、移动决策、提交变换和滚动分组策略；保持 domain 无 React、store、DOM、Tauri 和持久化依赖；每个策略模块配表驱动边界测试。                                                                        |
| M-05 AI 与图标编辑    | P1     | `AiOrganizePanel.tsx` 2208、`AddIconDialog.tsx` 1510、`IconCropDialog.tsx` 1111                                                                               | 视图按步骤或面板拆分；草稿、验证、异步预览、裁剪几何和保存流程进入专用 controller/domain/service；父组件只组合状态和步骤。每个视图或复杂 Hook 不超过 1000 行。                                                                   |
| M-06 设置界面         | P1     | `GeneralSettingsPanel.tsx` 879、`IconManagerPanel.tsx` 793                                                                                                    | 按设置分区拆成 feature-local sections；持久化由现有 settings service/store 统一处理；列表操作与导入/删除流程进入控制器，避免分区组件直接组合平台调用。                                                                           |
| M-07 基础设施         | P2     | `i18n.tsx` 977、`iconStore.ts` 456                                                                                                                            | i18n 已拆出 React Provider、Context/Hook 和语言运行态，后续继续按领域拆分翻译目录；store 保留稳定公共 facade，将选择、启动、布局偏好等 action 按职责拆到独立 slice 或 domain policy，避免消费者迁移期间出现多个状态源。          |

### 拆分执行顺序

1. 先完成 `E-01`，以低行为风险的导出边界拆分验证模块化方法，并把告警降到 68。
2. 完成 `E-02` 与 `M-01` 中的 `useSearch` 拆分；搜索状态转换必须先有纯逻辑或 Hook 回归测试，再调整 effect。
3. 完成 `E-03`，同时推进 `M-02`。先提取纯策略和生命周期控制器，再修改依赖数组，避免闭包语义变化。
4. 完成 `E-04` 与 `M-03`。滚动网格复用分页网格已验证的接口，不并行维护两套同义规则。
5. 继续处理 `M-01` 至 `M-07` 中超过 1000 行的模块，每次只选择一个领域或一个用户流程，不进行全仓库一次性重排。
6. 超大文件全部进入预算后完成 `E-05`，让普通 lint 和 CI 都回到零告警门禁。
7. 当 11 个文件全部降到预算内，或仅剩经过例外协议记录的文件后，将 `D-002` 标记为已完成。

### 每批验收门禁

1. 在实施前记录目标文件行数、告警数和准备抽取的单一责任；完成后更新本节状态和实际数字。
2. 先运行目标模块的单元测试，再运行 `pnpm test`、`pnpm lint`、`pnpm format:check`、`pnpm exec tsc --noEmit` 和 `pnpm build`。
3. 运行 `node .codex/skills/maintain-modular-code/scripts/check-changed-files.mjs`；债务盘点阶段另运行 `--all`，确认超预算文件数量只下降不增加。
4. 对搜索、拖拽、文件夹、预览、AI 步骤和图标编辑等交互，记录需要用户在真实 Tauri 运行态完成的手工回归清单；静态检查不能替代这些行为验证。
5. 新的 `.ts/.tsx/.js/.jsx` 文件必须符合 1000 行预算；函数或 Hook 仍以 80 行、复杂度 15、嵌套 4 层、参数 5 个为审查阈值。
6. 不允许新增跨层反向依赖：domain 不得导入 React/视图/store/平台 API，共享 UI 不得读取 feature store，service 不得包含展示状态。
7. 每批独立提交，提交说明中列出告警变化、行数变化、抽取边界、测试结果和仍需手工验证的行为。

### D-002 完成标准

- `pnpm lint` 和 `pnpm lint:strict` 均为 `0 errors / 0 warnings`。
- `eslint.config.js` 中不存在针对旧业务文件的规则降级列表。
- 11 个当前超预算文件全部进入 1000 行预算，或存在逐文件、可量化、经批准的例外记录。
- 分页和滚动图标网格共享同义的纯领域规则，不再复制修复。
- 搜索、拖拽、AI、图标编辑和设置流程均有清晰的视图、控制器、领域与服务边界。
- 全量测试、类型检查、格式检查、生产构建和变更文件预算检查通过。
