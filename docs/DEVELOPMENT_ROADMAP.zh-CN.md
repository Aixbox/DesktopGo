# DesktopGo 后续开发路线图

> 用于集中记录尚未开始或需要继续完善的开发事项。每次实施前补充范围与验收条件，完成后同步更新状态和实现说明。

## 状态说明

- `待开发`：已确认需要实现，但尚未开始。
- `进行中`：已经进入开发或验证阶段。
- `已完成`：实现、测试和文档均已完成。
- `暂缓`：保留需求，但当前不进入开发计划。

## 当前事项

| 编号  | 优先级 | 状态   | 事项                            | 目标                                                                                       |
| ----- | ------ | ------ | ------------------------------- | ------------------------------------------------------------------------------------------ |
| D-001 | P0     | 待开发 | 安装包启动时先选择语言          | 使用一个安装包承载简体中文和英文；启动安装包后首先选择语言，再进入对应语言的完整安装流程。 |
| D-002 | P0     | 已完成 | ESLint 告警清零与超大文件模块化 | 普通与严格 ESLint 均恢复零告警；所有手写 TypeScript 模块已进入统一的 1000 行预算。         |
| D-003 | P1     | 进行中 | Rust 静态检查与超大模块治理     | 建立 rustfmt、Clippy、check、test 门禁，并将 9 个超预算 Rust 模块分批拆回 500 行预算。     |

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

截至 2026-07-28，ESLint 告警清零与超大文件模块化治理已经完成：

- `pnpm lint` 限定检查 `src`、`vite.config.ts` 和 `eslint.config.js`，当前为 `0 errors / 0 warnings`。
- `pnpm lint:strict` 保留 `--max-warnings 0`，并与普通 lint 一同作为零告警门禁。
- ESLint 与 Prettier 已解耦，并提供独立的 `format` 和 `format:check` 命令。
- React Compiler legacy 文件降级已删除，`immutability`、`refs` 与 `set-state-in-effect` 全部恢复推荐错误级别。
- `max-lines`、`exhaustive-deps`、`set-state-in-effect`、`refs`、`only-export-components` 与 `immutability` 均已清零。
- E-03 与 E-04 已将功能代码告警从 52 降到 0；E-05 已消除全部 11 条 1000 行 `max-lines` 门禁告警。
- 所有手写 `.ts/.tsx` 文件均已进入统一的 1000 行模块预算；ESLint 与变更文件预算脚本使用相同阈值。

### 治理原则

1. 不通过全局关闭规则、扩大 legacy 文件列表、增加无说明的 ESLint disable 或把 warning 改成 off 来完成清零。
2. `exhaustive-deps` 不机械补依赖：先判断值属于纯计算、稳定回调、事件读取还是外部同步，再选择移动纯逻辑、`useCallback`、事件处理器或控制器边界。
3. `set-state-in-effect` 优先通过派生状态、事件入口重置、reducer 状态转换或带 key 的子树生命周期处理；不得用延时器或微任务只为绕过规则。
4. render 期间的 ref 写入必须移到 effect、事件处理器或显式控制器；递归 callback 和相互调度逻辑必须改成可测试的迭代策略或单一调度器。
5. 拆分按责任进行，不创建 `part1`、`helpers2` 或只转发参数的包装文件。视图只负责渲染与直接交互，Hook/控制器负责生命周期，domain 负责纯规则，service/adapter 负责持久化与平台调用。
6. 超预算旧文件不得继续增加物理行数。允许短期保留 facade，但 facade 必须只做组合/委派，并在每个批次中持续缩小。
7. 格式化、重命名、行为调整和结构抽取尽量分开提交，保证每批差异可审查、可回滚。

### ESLint 告警清零批次

| 批次 | 状态   | 范围                          | 当前告警 | 处理策略                                                                                                                                                                                                                                                                                                                           | 完成后目标 |
| ---- | ------ | ----------------------------- | -------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------: |
| E-00 | 已完成 | ESLint/Prettier 基线          |        - | 收窄检查范围、移除 `eslint-plugin-prettier`、增加 `lint:strict` 和格式检查。                                                                                                                                                                                                                                                       |         81 |
| E-01 | 已完成 | Fast Refresh 导出边界         |       13 | 文件夹视觉 policy、按钮变体和输入样式已与组件分离；i18n 已拆出语言运行态、Context/Hook 和仅导出组件的 Provider，组件文件不再混合导出纯能力。                                                                                                                                                                                       |         68 |
| E-02 | 已完成 | 搜索、设置、AI 和图标编辑流程 |       16 | 搜索重试与分页改为迭代调度，关键词和选择状态改为纯策略；设置加载、图标会话重置、AI 提示队列和应用请求已移动到异步结果或显式事件边界。                                                                                                                                                                                              |         63 |
| E-03 | 已完成 | 分页图标网格                  |       29 | 布局尺寸快照进入独立状态控制器，自动翻页回调保持稳定；拖拽处理器在指针会话开始时显式装配，覆盖层、Dock 和文件夹弹窗改用真实依赖与 effect 同步边界。                                                                                                                                                                                |         34 |
| E-04 | 已完成 | 滚动图标网格                  |       23 | 已复用布局尺寸控制器与稳定自动翻页接口；滚动分组数量、文件夹可见状态和页码改为派生或渲染期校正，拖拽处理器改为在指针会话开始时显式装配。                                                                                                                                                                                           |         11 |
| E-05 | 已完成 | 恢复零告警门禁                |       11 | 11 个超预算模块已按领域、控制器和视图边界拆分并进入预算；React Compiler legacy 规则降级已删除，普通与严格 lint 均恢复零告警。                                                                                                                                                                                                   |          0 |

每个批次必须严格达到表中的告警目标；如果发现新增告警，必须在同一批次处理，不能把基线数字向上调整。

#### E-03 运行态手工回归

- 在分页网格内执行单选和多选拖拽，确认排序、避让动画、拖拽影子与落点提交一致。
- 将图标拖到左右边缘自动翻页，并从最后一个内容页创建尾随空页，确认取消拖拽后不会残留页码或高亮。
- 从文件夹内拖出图标、拖入文件夹并使用 `Escape` 关闭弹窗，确认共享布局动画、焦点恢复和选择状态正确。
- 在 Dock 溢出时使用滚轮、拖拽边缘自动滚动和指示器拖动，确认滚动位置、ARIA 数值与落点预览同步。
- 删除当前页或当前打开的文件夹，切换 Dock、图标尺寸和窗口模式，确认页码、文件夹可见状态与持久化布局几何收敛。

#### E-04 运行态手工回归

- 在滚动网格内执行单选和多选拖拽，确认同组排序、跨分组移动、侧栏悬停切组与松手提交一致。
- 从文件夹拖出图标、将图标拖入文件夹并在遮罩区松手，确认文件夹退出、自动打开、替换与关闭动画正常。
- 在分页兼容模式拖到左右边缘，确认自动翻页、尾随空页、取消拖拽和滚轮切页不会留下错误页码或预览。
- 启用和关闭 Dock 后拖入、拖出及重排图标，确认落点预览、隐藏占位、选择清理和持久化顺序一致。
- 新增、删除、编辑和重排滚动分组，删除当前打开的文件夹，并切换图标尺寸、窗口模式和侧栏宽度，确认分组数量、可见弹窗与布局几何立即收敛。

#### E-05 模块化进度

- `topLevelLayout.ts` 已从 1029 行降至 929 行，并消除对应的 `max-lines` 告警。
- 新增 111 行的 `gridCoordinates.ts`，集中负责持久化网格坐标的转换、校验和越界投影。
- 新增 56 行的表驱动测试，覆盖跨页坐标、锚点选择、非法坐标和越界投影。
- `IconCropDialog.tsx` 已从 1111 行降至 927 行，并消除对应的 `max-lines` 告警。
- 新增 309 行的 `IconCropControls.tsx`，集中承载图像工具、旋转缩放和背景色选择的纯展示控件；裁剪状态、指针会话和异步处理仍由对话框控制。
- `AddIconDialog.tsx` 已从 1420 行降至 982 行，并消除对应的 `max-lines` 告警。
- 新增 608 行的 `AddIconFormSections.tsx`，承载表单行、图标外观、名称与高级选项、底部操作区；请求去重、文件选择、裁剪应用和提交仍由对话框控制。
- `dragMovePolicy.ts` 已从 1669 行降至 918 行，并消除对应的 `max-lines` 告警。
- 新增 798 行的 `footprintPlacementPolicy.ts`，集中负责 footprint 候选生成、约束分配、回溯求解与结果择优；DOM 命中检测和高层避让流程仍由 `dragMovePolicy.ts` 编排。
- 新增 60 行的纯策略测试，覆盖固定条目保留、重叠条目迁移和首选方向单步避让。
- `IconGrid.tsx` 已从 1685 行降至 957 行，并消除对应的 `max-lines` 告警，使严格 ESLint 剩余告警从 7 降至 6。
- 新增 69 行的 `useFolderGridMeasurement.ts`，负责文件夹网格的默认尺寸、DOM 测量和 ResizeObserver 清理。
- 新增 596 行的 `usePagedIconGridLayout.ts`，集中负责分页网格的水合、持久化、几何测量、尺寸归一化、Dock 关闭迁移与导入落位生命周期。
- 新增 240 行的 `usePagedGridReorderAnimations.ts`，集中管理外层网格 FLIP、文件夹与 Dock 重排动画及其计时器清理；`IconGrid.tsx` 保留拖拽编排、分页交互、文件夹操作和视图组合。
- `useIconGridDragWorkflow.ts` 已从 1947 行降至 988 行，并消除对应的 `max-lines` 告警，使严格 ESLint 剩余告警从 6 降至 5。
- 新增 469 行的 `usePagedDragGeometryController.ts`，集中负责分页、文件夹与 Dock 的拖拽几何、命中检测、顺序计算和避让委派。
- 新增 442 行的 `usePagedDragMoveProcessor.ts`，按外层网格、Dock、文件夹和悬停场景编排指针移动处理。
- 新增 110 行的 `useTopLevelDwellEvasion.ts`，负责外层图标延时避让与文件夹预览决策。
- `usePagedDragStarter.ts` 复用共享的文件夹子项中心点补全能力后为 228 行，继续负责分页拖拽会话初始化、多选解析和指针捕获。
- `useScrollableIconGridDragWorkflow.ts` 已从 2710 行降至 946 行，并消除对应的 `max-lines` 告警，使严格 ESLint 剩余告警从 5 降至 4。
- 新增 868 行的 `useScrollableDragGeometryController.ts`，集中负责分页兼容与紧凑滚动模式的顺序、几何、命中检测和避让计算。
- 新增 706 行的 `useScrollableDragMoveProcessor.ts`，编排滚动分组、空槽预览、Dock 重排、文件夹移动和悬停计时。
- 新增 588 行的 `useScrollableFolderDragController.ts`，管理文件夹预览、自动打开、遮罩退出及顶层上下文转换。
- 新增 263 行的 `useScrollableDragStarter.ts`，负责滚动拖拽会话初始化、紧凑预览缓存重置、多选解析和指针捕获。
- 新增 44 行的 `seedSelectedFolderChildCenters.ts`，在 hooks 层共享文件夹子项中心点补全能力，分页与滚动启动器不再各自维护相同规则。
- `ScrollableOuterGridView.tsx` 已从 2133 行降至 486 行，并消除对应的 `max-lines` 告警，使严格 ESLint 剩余告警从 4 降至 3。
- 新增 916 行的 `useScrollableOuterGridDragWorkflow.ts`，集中负责滚动外层网格的指针/键盘拖拽、逻辑命中、文件夹合并预览、边缘自动滚动、FLIP 动画与提交生命周期。
- 新增 781 行的 `ScrollableGroupNavigation.tsx`，承载分组侧栏、分组排序、创建/编辑弹层与拖拽覆盖层；新增 19 行的 `scrollableOuterGridTypes.ts` 共享分组和 FLIP 位置类型。
- `ScrollableIconGrid.tsx` 已从 2473 行降至 1000 行，并消除对应的 `max-lines` 告警，使严格 ESLint 剩余告警从 3 降至 2。
- 新增 751 行的 `useScrollableIconGridLayout.ts`，集中负责布局水合、持久化、几何测量、布局归一化、Dock 关闭迁移与分组导入落位。
- 新增 203 行的 `useScrollableGridReorderAnimations.ts`，统一管理分页网格、文件夹与 Dock 的 FLIP 重排动画和计时器清理。
- 新增 260 行的 `useScrollGroupController.ts`，负责侧栏拖拽目标检测、跨组切换、分组 CRUD、组内移动、Dock 移动与文件夹合并。
- 新增 251 行的 `useScrollableIconGridViewModel.ts`，派生分页/滚动渲染顺序、分组 sections、预览 footprint、隐藏项与拖拽叠层模型。
- 新增 318 行的 `useScrollableFolderController.ts`，管理文件夹共享布局、打开/关闭与键盘退出、网格测量、尺寸变更和 footprint 重排。
- `Launchpad.tsx` 已从 2137 行降至 905 行，并消除对应的 `max-lines` 告警，使严格 ESLint 剩余告警从 2 降至 1。
- 新增 414 行的 `useLaunchpadIconImportController.ts`，集中管理新增/编辑图标、外部拖放预览、批量导入与导入落位请求。
- 新增 202 行的 `LaunchpadIconImportLayer.tsx`，承载外部拖放状态、批量导入确认和新增/编辑图标弹窗。
- 新增 384 行的 `useLaunchpadWindowController.ts`，负责启动初始化、窗口外观与常驻状态同步、焦点保护、设置窗口及布局重置事件。
- 新增 103 行的 `LaunchpadWindowControls.tsx`，承载 AI 入口、置顶、最小化和关闭窗口控件。
- 新增 240 行的 `useLaunchpadSurfaceInteractions.ts`，管理背景长按选择、框选命中、搜索面板退出与全屏背景关闭行为。
- `AiOrganizePanel.tsx` 已从 2207 行降至 990 行，并消除最后一条 `max-lines` 告警，使普通与严格 ESLint 均恢复零告警。
- 新增 628 行的 `useAiOrganizeExecution.ts`，集中管理 AI 对话与分类请求、流式事件缓冲、运行计时和状态派生。
- 新增 239 行的 `aiOrganizePanelModel.ts`，集中保存分组转换、会话上下文构建、状态标签及内部契约。
- 新增 198 行的 `AiOrganizeSnapshotPreview.tsx`，承载布局版本预览、分组编辑与图标移出交互。
- 新增 195 行的 `AiOrganizeComposer.tsx`，承载排队提示、整理指令、快捷提示和消息输入区。
- 新增 149 行的 `AiOrganizeRunInline.tsx` 与 113 行的 `AiOrganizeHistoryMenu.tsx`，分别展示运行遥测和会话历史。
- 新增 18 行的 `aiOrganizePanelTypes.ts`，保存面板 Props 与 imperative handle 契约，组合面板继续提供兼容导出。
- 删除 8 个 legacy 文件的 React Compiler 规则降级，`immutability`、`refs` 与 `set-state-in-effect` 恢复推荐错误级别。

#### E-05 分页网格布局控制器手工回归

- 启动后切换窗口模式、图标大小与 Dock 开关，确认持久化几何锁定、跨页坐标和 Dock 图标回填位置与拆分前一致。
- 新增或导入多个图标到当前页，覆盖当前页有空位、当前页已满和需要挤入下一页的场景，确认落位页码与高亮计时正常。
- 在外层网格、文件夹与 Dock 内分别拖拽重排，确认 FLIP 动画、占位隐藏和动画结束后的内联样式清理正常。
- 打开、关闭和调整文件夹尺寸后重启应用，确认文件夹共享布局动画、页数收敛和持久化顺序保持不变。

#### E-05 分页拖拽工作流手工回归

- 在不同分页密度下从图标四周与中心进入目标，确认命中区域、目标索引、跨页坐标和避让方向与拆分前一致。
- 在外层网格与 Dock 之间拖入、拖出和重排，确认外部预览、占位隐藏、Dock 溢出滚动和最终提交顺序一致。
- 从文件夹拖出图标并悬停现有文件夹，确认遮罩退出、自动打开、中心区预览和关闭后的状态清理正常。
- 选择多个外层图标或文件夹子项后开始拖拽，确认选择解析、初始中心点、拖拽影子和批量落点保持一致。
- 在图标、文件夹和页面空位之间连续悬停，确认延时避让、文件夹创建预览、冷却重置和取消拖拽后的布局恢复正常。

#### E-05 滚动拖拽工作流手工回归

- 在紧凑滚动分组内拖动单格与多格图标，确认命中点、空槽预览、前后插入和跨分组顺序与拆分前一致。
- 在滚动模式与分页兼容模式分别拖入、拖出和重排 Dock，确认上下文切换、占位索引与最终提交顺序一致。
- 将单选和多选图标悬停在普通图标、现有文件夹及分组间隙，确认文件夹创建、自动打开和延时避让互不抢占。
- 从文件夹拖出图标并经过遮罩、滚动分组和 Dock，确认退出计时、源文件夹替换、指针捕获与关闭回调正常。
- 连续滚动并快速跨越多个目标，确认重排锁定、命中缓存、预览刷新和取消拖拽后的缓存清理正常。

#### E-05 滚动外层分组视图手工回归

- 在侧栏新增、编辑、删除和拖拽重排分组，分别验证展开与紧凑侧栏下的名称、数量、图标、右键菜单和拖拽覆盖层与拆分前一致。
- 在当前分组内使用鼠标、触摸与键盘拖动单格及多格图标，确认前后插入、文件夹创建预览、FLIP 动画和最终顺序提交一致。
- 将图标拖到其他分组与 Dock，确认侧栏悬停高亮、跨分组移动、Dock 索引和取消拖拽后的状态清理正常。
- 拖到滚动容器上下边缘并连续跨越多个目标，确认自动滚动速度、逻辑命中缓存、重排锁定和松手落点稳定。
- 在选择模式、文件夹打开状态和添加图标入口之间切换，确认点击抑制、文件夹共享布局、隐藏/高亮状态与新增目标分组保持不变。

#### E-05 滚动组合根手工回归

- 启动后重置布局并重新载入，确认图标、Dock、滚动分组和分页兼容布局都能从持久化状态正确水合。
- 在分页与滚动模式间切换，并切换展开/紧凑侧栏，确认页码、分组滚动位置和网格尺寸重测立即收敛。
- 将图标导入当前分组和指定分组，覆盖有空位、需要扩容和导入高亮场景，确认落位与持久化顺序一致。
- 开关 Dock，打开、关闭并调整文件夹尺寸，确认图标迁移、共享布局动画、键盘退出与 footprint 重排保持不变。
- 新增、编辑、删除、重排分组并跨组拖拽图标，确认分页网格、文件夹和 Dock 的 FLIP 动画及最终提交顺序一致。

#### E-05 启动台组合根手工回归

- 首次启动、设置页返回和主窗口重新获得焦点时，确认设置、图标、搜索配置、窗口主题及常驻状态同步正常。
- 切换窗口常驻、置顶、最小化和关闭，并打开设置窗口，确认焦点保护、窗口拖动和首次背景点击行为与拆分前一致。
- 新增、编辑和外部拖入单个/多个图标，确认预览、批量选择、失败保留、成功提示及指定分组落位正常。
- 进入选择模式后长按背景并框选图标，覆盖追加选择、取消框选和背景清空，确认选择状态与点击抑制正确。
- 在搜索、AI 整理、选择模式和全屏背景之间切换，确认面板关闭、Escape、背景隐藏及工具栏互斥行为保持不变。

#### E-05 AI 整理面板手工回归

- 首次打开、关闭后重开和新建对话时，确认会话加载、默认会话、历史选择、删除确认及保存错误提示正常。
- 分别发送普通对话和整理指令，覆盖快捷提示、编辑旧版布局、加载期间继续排队及清空队列，确认执行顺序和输入状态一致。
- 在模型流式返回时确认事件状态、原始输出片段、耗时和 Token 用量持续更新，关闭面板后不残留监听器或计时器。
- 生成多个布局版本并切换预览，编辑分组名称、移出图标和解散分组，确认临时布局与会话快照同步更新。
- 覆盖 AI 配置缺失、空图标库、请求失败、无可用分组和应用失败，确认错误状态可恢复且关闭前的临时预览会回滚。
- 成功应用有效分组后确认布局持久化、运行记录、成功提示、主窗口刷新与面板关闭行为保持不变。

#### E-05 footprint 避让手工回归

- 在包含 1x1 与多格图标的页面内拖动图标，确认重叠项避让方向、相对顺序和最终落点与拆分前一致。
- 在满页、存在拖拽洞和需要跨页溢出的场景连续悬停多个目标，确认不丢失图标、不产生重复占位，且取消拖拽后布局复原。
- 分别从目标的上下左右和中心区域进入，确认单步避让、稳定后缀重排与方向回退保持原有优先级。

#### E-05 图标裁剪手工回归

- 切换四角圆角联动状态，拖动四个圆角和裁剪框的移动/缩放手柄，确认圆角、裁剪尺寸与预览同步。
- 执行左右旋转、复位、滚轮与按钮缩放，确认禁用边界、图像位置约束和复位结果保持不变。
- 开关清晰优化并等待异步处理，确认加载态、原图/优化图切换和错误提示正常。
- 选择透明色、预设色和提取色，并在图片上采样颜色，确认选中态、背景预览和最终生成结果一致。

#### E-05 添加图标手工回归

- 在应用模式选择文件和文件夹，确认路径识别、自动图标预览、名称推导及目标选择菜单关闭行为正常。
- 在网页模式输入、失焦和手动提取网址，确认 URL 校验、并发结果淘汰、候选图标和错误状态保持一致。
- 切换预设颜色、文字图标、自动图标和自定义图标，并打开裁剪编辑，确认选中态、禁用态和生成结果不变。
- 展开高级选项并选择工作目录，分别执行新增与编辑提交，确认取消、加载态、快捷键提交和焦点恢复正常。

### 超大文件治理轨道

告警清理和文件拆分必须同步进行。优先处理同时携带告警的模块，随后处理虽然暂时无告警、但已经形成职责聚合的文件。

| 轨道                  | 优先级 | 文件与当前规模                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 目标边界                                                                                                                                                                                                                |
| --------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M-01 搜索与启动台     | P0     | `Launchpad.tsx` 905、`useLaunchpadIconImportController.ts` 414、`LaunchpadIconImportLayer.tsx` 202、`useLaunchpadWindowController.ts` 384、`LaunchpadWindowControls.tsx` 103、`useLaunchpadSurfaceInteractions.ts` 240、`SearchPanel.tsx` 839、`useSearch.ts` 883                                                                                                                                                                                                                                                                                                                                                 | 窗口生命周期、外部导入、窗口控件和背景选择交互已从组合根拆出，`Launchpad` 已进入预算；后续继续收敛搜索视图参数和 AI 模式编排边界。                                                                                      |
| M-02 分页图标网格     | P0     | `IconGrid.tsx` 957、`useFolderGridMeasurement.ts` 69、`usePagedIconGridLayout.ts` 596、`usePagedGridReorderAnimations.ts` 240、`useIconGridDragWorkflow.ts` 988、`usePagedDragGeometryController.ts` 469、`usePagedDragMoveProcessor.ts` 442、`useTopLevelDwellEvasion.ts` 110、`usePagedDragStarter.ts` 228、`useDragDropCommit.ts` 764、`DragOverlays.tsx` 668、`DockBar.tsx` 904、`OuterFolderTile.tsx` 537                                                                                                                                                                                                    | 水合、持久化、几何测量、导入落位、文件夹尺寸测量、重排动画与分页拖拽会话职责已从组合视图拆出；后续继续收敛文件夹、选择和提交边界。                                                                                      |
| M-03 滚动图标网格     | P0     | `ScrollableIconGrid.tsx` 1000、`useScrollableIconGridLayout.ts` 751、`useScrollableGridReorderAnimations.ts` 203、`useScrollGroupController.ts` 260、`useScrollableIconGridViewModel.ts` 251、`useScrollableFolderController.ts` 318、`ScrollableOuterGridView.tsx` 486、`ScrollableGroupNavigation.tsx` 781、`useScrollableOuterGridDragWorkflow.ts` 916、`useScrollableIconGridDragWorkflow.ts` 946、`useScrollableDragGeometryController.ts` 868、`useScrollableDragMoveProcessor.ts` 706、`useScrollableFolderDragController.ts` 588、`useScrollableDragStarter.ts` 263、`useScrollableDragDropCommit.ts` 810 | 水合、持久化、几何测量、导入落位、文件夹生命周期、分组 CRUD、渲染模型、重排动画和滚动拖拽工作流均已进入独立控制器或视图；组合根已进入 1000 行预算，后续继续收敛预览提交和分页兼容交互边界。                             |
| M-04 图标网格领域规则 | P1     | `dragMovePolicy.ts` 918、`footprintPlacementPolicy.ts` 798、`topLevelLayout.ts` 929、`gridCoordinates.ts` 111、`dropPolicy.ts` 667、`scrollDropPolicy.ts` 800、`scrollGroupLayout.ts` 522                                                                                                                                                                                                                                                                                                                                                                                                                         | 持久化网格坐标与 footprint 放置求解已拆为独立纯策略并配有边界测试；后续继续按候选目标、移动决策、提交变换和滚动分组策略拆分，保持 domain 无 React、store、DOM、Tauri 和持久化依赖。                                     |
| M-05 AI 与图标编辑    | P1     | `AiOrganizePanel.tsx` 990、`useAiOrganizeExecution.ts` 628、`aiOrganizePanelModel.ts` 239、`AiOrganizeSnapshotPreview.tsx` 198、`AiOrganizeComposer.tsx` 195、`AiOrganizeRunInline.tsx` 149、`AiOrganizeHistoryMenu.tsx` 113、`aiOrganizePanelTypes.ts` 18、`AddIconDialog.tsx` 982、`AddIconFormSections.tsx` 608、`IconCropDialog.tsx` 927、`IconCropControls.tsx` 309                                                                                                                                                                                                                                      | AI 执行控制、纯模型、运行遥测、会话历史、布局预览、输入区和外部契约已从组合面板分离；图标表单 sections 与裁剪控件也已独立，所有相关手写模块均进入 1000 行预算。                                                         |
| M-06 设置界面         | P1     | `GeneralSettingsPanel.tsx` 879、`IconManagerPanel.tsx` 793                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 按设置分区拆成 feature-local sections；持久化由现有 settings service/store 统一处理；列表操作与导入/删除流程进入控制器，避免分区组件直接组合平台调用。                                                                  |
| M-07 基础设施         | P2     | `i18n.tsx` 977、`iconStore.ts` 456                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | i18n 已拆出 React Provider、Context/Hook 和语言运行态，后续继续按领域拆分翻译目录；store 保留稳定公共 facade，将选择、启动、布局偏好等 action 按职责拆到独立 slice 或 domain policy，避免消费者迁移期间出现多个状态源。 |

### 拆分执行顺序

1. 先完成 `E-01`，以低行为风险的导出边界拆分验证模块化方法，并把告警降到 68。
2. `E-02` 已完成，并推进了 `M-01` 中的 `useSearch` 拆分；关键词提交、选择钳制和图标表单初始态已有纯逻辑回归测试。
3. `E-03` 已完成，并推进了 `M-02`；布局尺寸控制器有独立状态转换测试，拖拽回调按指针会话固定，分页网格功能告警已清零。
4. `E-04` 已完成并推进了 `M-03`；滚动网格已复用分页网格验证过的布局尺寸、自动翻页和会话装配边界，功能代码告警已清零。
5. `E-05` 已完成 M-01 至 M-05 的超预算模块治理；启动台、分页与滚动网格、领域策略、图标编辑和 AI 整理职责均已进入独立边界。
6. 所有手写 TypeScript 模块已进入 1000 行预算，React Compiler legacy 降级已删除，普通 lint、严格 lint 与 CI 均恢复零告警门禁。
7. `D-002` 已完成；后续模块化工作按 M-01 至 M-07 的目标边界持续演进，不再作为 ESLint 基线债务处理。

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
- 最初识别的 11 个超预算文件全部进入 1000 行预算，或存在逐文件、可量化、经批准的例外记录。
- 分页和滚动图标网格共享同义的纯领域规则，不再复制修复。
- 搜索、拖拽、AI、图标编辑和设置流程均有清晰的视图、控制器、领域与服务边界。
- 全量测试、类型检查、格式检查、生产构建和变更文件预算检查通过。

## D-003：Rust 静态检查与超大模块治理

### 当前基线

截至 2026-07-28，R-00 至 R-04 已完成，R-05 进入真实运行回归阶段；Rust 零告警门禁和全部规划模块化边界已经建立：

- 仓库已提供 `rustfmt.toml`、`clippy.toml` 和统一的 `scripts/check-rust.ps1` 检查脚本。
- `package.json` 已提供 rustfmt、Clippy、check、test 的分项命令和 `rust:quality` 聚合命令；GitHub Actions 已增加 Windows Rust 质量任务。
- 首次 `cargo clippy --all-targets --all-features -- -D warnings` 扫描发现的 14 类告警已清零，未增加全局 Clippy 例外。
- `ai.rs` 与 `agent/llm.rs` 已收敛为 facade/编排入口，请求模型、端点策略、结果校验、HTTP operation、请求构建、SSE 解码和观测事件均已进入独立模块。
- `everything/ipc.rs` 已收敛为跨平台 facade，SDK 动态绑定、回复窗口、查询会话和工作线程已进入独立模块；搜索调试日志也已从运行时编排中分离。
- `icons/website.rs` 已收敛为 facade，候选策略、文档资源解析、HTTP、图像处理和异步发现流程已进入独立模块。
- `icons/catalog_windows.rs` 与 `catalog_windows/operations.rs` 已收敛为 facade，快照存储、图像缓存、条目建模、视图转换以及创建、更新、导入、查询和变更操作已进入独立模块。
- `lib.rs` 与 `commands.rs` 已收敛为应用装配和命令导出入口，窗口、托盘、启动、状态和领域命令均已进入独立模块。
- 文件预算脚本继续以 500 行作为手写 Rust 模块阈值；全仓 272 个源码文件扫描通过，既有超预算 Rust 文件已从 9 个降至 0 个。
- 文件行数预算属于模块化约束；Clippy 主要检查代码正确性与惯用写法，不能替代整个文件的规模门禁。

### 治理原则

1. 不通过全局 `allow`、降低 Clippy 等级或扩大例外列表完成清零；确需例外时必须逐项说明原因和退出条件。
2. Tauri command handler 只负责输入校验、类型转换、调用 application operation 和映射错误，不承载完整业务实现。
3. 纯领域策略不得依赖 Tauri handle、窗口对象、文件系统、注册表、网络客户端或 Windows API。
4. 文件系统、网络、数据库、注册表、动态库和 Windows Shell 调用必须收敛到明确的平台或集成适配器。
5. 保持现有 IPC 请求与响应契约兼容；若必须调整序列化结构，需要同步更新 TypeScript 调用方和兼容迁移。
6. 新建 `.rs` 文件不得超过 500 个物理行；函数以 80 行、复杂度 15、嵌套 4 层、参数 5 个为审查阈值。
7. 每批只处理一个可验证的领域边界，避免同时重命名、格式化和改变行为。

### Rust 治理批次

| 批次 | 状态   | 范围                    | 处理策略                                                                                                          | 完成后目标                       |
| ---- | ------ | ----------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| R-00 | 已完成 | Rust 静态检查基线       | 增加统一脚本与 CI 门禁，执行 rustfmt、Clippy、check、test 和文件预算检查，并清理首次扫描发现的 Clippy 告警。      | 可重复执行的 Rust 零告警质量门禁 |
| R-01 | 已完成 | AI 与 LLM               | 拆分 `agent/llm.rs` 和 `ai.rs` 的请求模型、流式解析、工具编排、结果校验与运行记录边界。                           | 2 个模块进入 500 行预算          |
| R-02 | 已完成 | Everything 集成         | 拆分 `everything/ipc.rs` 与 `everything/runtime.rs` 的协议、连接、查询、安装发现、进程生命周期和重试策略。        | 2 个模块进入 500 行预算          |
| R-03 | 已完成 | 图标网站与 Windows 目录 | 拆分 `icons/website.rs`、`catalog_windows.rs` 和 `operations.rs` 的网络、解析、候选策略、扫描、提取与持久化边界。 | 3 个模块进入 500 行预算          |
| R-04 | 已完成 | Tauri 入口与命令组织    | 将 `lib.rs` 和 `commands.rs` 收敛为装配与导出层，按窗口、图标、布局、搜索、设置和生命周期拆分命令及操作。         | 2 个中央模块进入 500 行预算      |
| R-05 | 进行中 | 零告警与预算收尾        | 清理临时 Clippy 例外，执行全仓门禁与 Windows 真实运行回归，并在路线图记录最终文件规模。                           | 0 个 Rust 超预算文件、0 条新告警 |

#### R-00 实施结果

- 新增 `rustfmt.toml` 与 `clippy.toml`，统一 edition、行宽以及复杂度和函数规模阈值配置。
- 新增 `scripts/check-rust.ps1`，按顺序执行 rustfmt、Clippy、check、test 和变更文件预算检查；支持通过 `-BaseRef` 检查 CI 提交差异，并保留 `-All` 全仓债务盘点入口。
- `package.json` 新增 `rust:fmt`、`rust:clippy`、`rust:check`、`rust:test` 和 `rust:quality`，本地与 CI 复用相同命令契约。
- 新增 `.github/workflows/ci.yml` 的 Windows Rust 质量任务，安装 rustfmt/Clippy 组件并缓存 Cargo 构建结果。
- 清理首次扫描发现的 14 类 Clippy 告警：收紧 `PathBuf` 借用为 `Path`、派生 `Default`、移除冗余借用和返回、简化条件与 `Option` 处理，并将测试模块移到文件末尾。
- `SearchErrorCode` 仅调整 Rust 内部变体名称，对外仍返回既有 `EverythingNotFound`、`EverythingSdkUnavailable`、`EverythingInitializing` 和 `EverythingIpcUnavailable` 字符串，未改变前端 IPC 错误契约。
- `agent/llm.rs` 通过流式请求输入类型降低函数参数数量，并从 798 行缩至 792 行；本批涉及的其他超预算模块均未增长。
- 聚合门禁实测通过：Clippy 为零告警，`cargo test` 为 36 passed / 0 failed，变更文件预算检查通过；全仓仍保留 9 个既有超预算 Rust 文件，交由 R-01 至 R-05 继续治理。

#### R-01 实施结果

- `ai.rs` 从 555 行降至 30 行，仅保留稳定类型导出和两个 Tauri command 委派入口。
- 新增 `ai/models.rs` 113 行，集中定义 IPC 输入输出、OpenAI 兼容请求响应以及模型分组载荷。
- 新增 `ai/endpoint.rs` 77 行，集中负责 Base URL 校验与 Chat Completions/Responses 端点规范化。
- 新增 `ai/policy.rs` 180 行，集中负责系统提示词、模型 JSON 提取、folder size 规范化和分组清洗纯策略。
- 新增 `ai/operation.rs` 169 行，集中负责配置校验、请求组装、HTTP 执行、错误截断和响应内容提取；command handler 不再承载完整网络流程。
- `agent/llm.rs` 从 792 行降至 246 行，仅保留供应商选择、Responses 降级编排和流式请求生命周期。
- 新增 `agent/llm/request.rs` 119 行、`observation.rs` 133 行和 `stream.rs` 392 行，分别负责请求体构建、运行事件观测以及 SSE/usage 解码。
- 工具调用和运行记录继续复用既有 `agent/icon_agent.rs`、`agent/tool.rs` 与 `agent/memory.rs`，没有在新模块复制编排或持久化职责。
- 保持 `crate::ai::*` 和 `agent::llm::*` 的既有调用入口、序列化结构、错误文案与 Responses 降级策略兼容，没有修改前端 IPC 契约。
- 新增 5 个 LLM 纯逻辑测试，覆盖严格 JSON 请求、普通聊天请求、LF/CRLF SSE 分帧、cached token 映射和 Responses 完成文本提取；AI 原有 8 个端点与分组策略测试随职责迁移。
- R-01 完成后全量 Rust 测试为 41 passed / 0 failed，超预算 Rust 文件从 9 个降至 7 个。

#### R-02 实施结果

- `everything/ipc.rs` 从 1139 行降至 90 行，仅保留跨平台数据类型、Windows 子模块声明和稳定 facade；非 Windows 的既有错误入口保持不变。
- 新增 `everything/ipc/api.rs` 314 行，集中负责 Everything SDK 动态符号绑定、排序协议映射、运行状态探测和运行次数更新。
- 新增 `everything/ipc/reply_window.rs` 172 行，集中负责 Win32 消息窗口注册、查询回复状态和 SDK 查询启动/清理。
- 新增 `everything/ipc/query.rs` 365 行，集中负责查询参数写入、结果提取、首屏缓存以及活动请求的完成、超时和取消语义。
- 新增 `everything/ipc/worker.rs` 286 行，集中负责工作线程、命令通道、消息泵、连接探测、查询分发和关闭握手。
- `everything/runtime.rs` 从 544 行降至 485 行；新增 `everything/debug_log.rs` 62 行，将日志轮转与文件写入从运行时状态编排和 IPC 适配器中分离。
- 保持 `everything::*` 对外调用入口、搜索请求响应结构、错误字符串、超时值、首屏缓存策略和 Everything 启动流程兼容，没有修改前端 IPC 契约。
- 新增 1 个纯协议测试，覆盖全部 27 个 `SearchSort` 变体到 Everything SDK 排序值的映射；聚合门禁实测为 42 passed / 0 failed。
- R-02 完成后超预算 Rust 文件从 7 个降至 5 个，剩余文件均属于 R-03 与 R-04 范围。

#### R-03 实施结果

- 网站图标子批次已完成，`icons/website.rs` 从 1885 行降至 18 行，仅保留模块声明、稳定导出和异步 operation 委派入口。
- 新增 `icons/website/candidate.rs` 279 行，集中负责候选类型、URL 解析、Manifest/BrowserConfig/Link Header 候选、去重和质量排序。
- 新增 `icons/website/document.rs` 303 行与 `document_assets.rs` 293 行，分别负责页面元数据/重定向解析，以及图片、CSS、前端资源和内联 SVG 候选发现。
- 新增 `icons/website/http.rs` 96 行、`image.rs` 227 行和 `operation.rs` 281 行，分别负责受限网络读取、SVG/位图解码与优化、异步发现编排。
- 原有 14 项网站图标测试迁入 332 行的 `icons/website/tests.rs`，覆盖页面解析、Manifest、Link Header、候选排序、SVG、透明度和优化。
- 保持 `extract_website_icon`、`optimize_icon_data_uri`、URL 规范化、网络限制、候选上限、并发数和前端 IPC 数据结构兼容。
- `icons/catalog_windows.rs` 从 724 行降至 11 行，仅保留模块声明、测试模块和 `get_path_icon_base64_windows` 稳定导出；`catalog_windows/operations.rs` 从 752 行降至 16 行，仅保留操作模块声明和服务入口导出。
- 新增 `catalog_windows/source.rs` 32 行、`storage.rs` 203 行、`image.rs` 178 行、`item.rs` 166 行和 `view.rs` 133 行，分别负责目录来源、快照迁移与持久化、图像提取与缓存、扫描条目建模以及查询视图转换。
- 新增 `catalog_windows/operations/mutation.rs` 169 行、`import.rs` 105 行、`create.rs` 215 行、`update.rs` 241 行和 `query.rs` 87 行，分别负责隐藏/恢复/删除、拖放导入、创建、更新和查询操作。
- 4 项 Windows 目录兼容性测试迁入 101 行的 `catalog_windows/tests.rs`，覆盖旧快照单图标迁移、旧尺寸桶识别和按文件内容解码自定义图标；全量 Rust 测试仍为 42 passed / 0 failed。
- 保持 Tauri 服务入口、快照 JSON 结构、显示顺序、缓存路径、错误文案和创建/更新失败清理行为兼容；Clippy、check、test、diff 与变更文件预算门禁通过。
- R-03 完成后超预算 Rust 文件从 5 个降至 2 个，仅剩 R-04 范围内的 `lib.rs` 与 `commands.rs`。

#### R-04 实施结果

- `lib.rs` 从 1547 行降至 149 行，仅保留模块声明、稳定内部导出、插件/状态装配、command 注册和退出时搜索运行时清理。
- 新增 `app_state.rs` 37 行、`startup.rs` 191 行、`console_exit.rs` 56 行、`tray.rs` 362 行、`window.rs` 346 行和 `window_style.rs` 409 行，分别负责窗口状态、开机启动、Windows 控制台退出、托盘与语言、窗口生命周期以及窗口样式策略。
- `commands.rs` 从 550 行降至 11 行，仅保留领域命令模块声明和统一导出。
- 新增 `commands/icon.rs` 127 行、`layout.rs` 34 行、`search.rs` 45 行、`updater.rs` 24 行和 `window.rs` 321 行，command handler 继续保持参数转换和 operation 委派职责。
- 保持全部 Tauri command 名称、参数/返回类型、`generate_handler!` 注册顺序、窗口事件名和错误文案兼容；窗口几何与原生激活策略测试随职责迁移。
- 聚合门禁实测为 42 passed / 0 failed，Clippy 零告警，变更文件预算通过；全仓 272 个源码文件的预算扫描首次全部通过。

#### R-05 当前进度

- 静态收尾已经完成：没有全局 Clippy 例外、没有新告警、没有超预算 Rust 文件，统一质量脚本和 CI 门禁保持通过。
- 根据项目进程所有权约束，本批未启动 DesktopGo、Tauri 或 Vite；R-05 仅剩 Windows 主窗口、设置窗口、托盘、全局快捷键、启动和退出流程的用户侧真实运行回归。

### 每批质量门禁

```powershell
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
node .codex/skills/maintain-modular-code/scripts/check-changed-files.mjs
```

- 涉及 IPC 契约时，同时运行前端类型检查、全量测试与生产构建。
- 涉及 Windows Shell、注册表、动态库、Everything 进程或窗口生命周期时，补充平台定向测试和错误路径验证。
- 全仓债务盘点使用 `check-changed-files.mjs --all`；允许尚未处理的既有文件继续报告，但数量和最大规模必须逐批下降。
- 每批执行 `git diff --check`，确认没有无关格式化、生成产物、凭据或环境文件进入差异。

### 手工回归范围

- Everything 未安装、未运行、自动启动、查询超时、空结果和进程退出后的恢复。
- 网站图标发现中的重定向、无 favicon、无效 HTML/CSS、SVG/ICO/PNG 候选、网络失败和缓存回退。
- Windows 应用与快捷方式图标扫描、提取失败、重复候选、目录写入失败和刷新恢复。
- AI 普通对话、图标整理、流式输出、工具调用、配置缺失、网关失败和运行记录写入。
- 主窗口、设置窗口、托盘、全局快捷键、单实例唤醒、启动就绪通知和退出清理。

### D-003 完成标准

- `cargo fmt --check`、`cargo clippy -- -D warnings`、`cargo check` 与 `cargo test` 均通过并进入 CI。
- 9 个既有超预算 Rust 文件全部进入 500 行预算，且没有新增超预算模块。
- `lib.rs` 和中央 commands 模块只负责装配、注册与导出，不再承载跨领域完整业务实现。
- Everything、AI、网站图标和 Windows 图标目录具有清晰的 command、operation、domain 与 adapter 边界。
- Rust 错误能够跨 IPC 返回类型化、可操作的信息，不泄露敏感路径、令牌或不受信任原始内容。
- Windows 真实运行回归、前端联动检查和全仓文件预算扫描全部通过。
