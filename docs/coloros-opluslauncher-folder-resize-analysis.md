# ColorOS OplusLauncher 文件夹预览与缩放手柄静态分析

## 当前结论与分析边界

本报告按本机 OplusLauncher.apk 的 JADX 反编译代码核对了桌面文件夹图标预览、堆叠小图标、缩放手柄绘制与显隐、拖动阈值、临时占位和提交/回退分支。分析范围是 Launcher 工作区里的 FolderInfo / FolderIcon；TaskbarFolderIcon、隐藏文件夹和打开文件夹后的内容页单独列出，不能把它们的规则混作同一套预览逻辑。

当前能从 APK 静态代码确定控制流、尺寸计算公式、颜色和尺寸资源名、模式开关、页面边界及拖动分支。本机同一 SHA-256 APK 已通过 JADX 资源解码目录取得这些资源的默认值；REA 的 `decode_android_resources` 仍因当前环境缺少 Apktool 启动器而不能直接产生资源 Evidence。资源值来源、限定符和静态代码 Evidence 分开记录，不能把默认 `res/values` 值误写成所有设备运行时的最终值。

按照用户要求，本轮先完成 APK 分析和文档核对，随后已把闭合预览和基础 resize frame 接入 DesktopGo；没有启动 DesktopGo、Tauri、Vite 或浏览器。实现范围和运行时边界在本文末尾单独记录。

## APK 与证据来源

| 项目        | 值                                                                                             |
| ----------- | ---------------------------------------------------------------------------------------------- |
| APK         | D:\Project\other\ColorOS-AVD\work\rom-root\system_ext\priv-app\OplusLauncher\OplusLauncher.apk |
| 包名 / 版本 | com.android.launcher / 17.3.12，versionCode 170030012                                          |
| APK SHA-256 | 4a91e6e1e25efd0486095a658ca71ecf8e5cd50422232e02d35ee93f3decf828                               |
| REA 分析器  | JADX headless 0.7.1                                                                            |
| 证据性质    | shipped-artifact 静态反编译；没有运行 APK、模拟器回放或设备截图                                |

REA 证据 ID 与 APK 哈希绑定。JADX 的反编译代码可证明 APK 中的静态分支和资源引用，但不能单独证明特定 ColorOS 设备当前选择的 LauncherIconConfig、半径模式、主题、语言方向或运行时开关。资源解码工具这次返回 capability_unavailable，原因是没有找到 Apktool launcher；这不等于 APK 中没有资源。

### 资源默认值（同一 SHA-256 APK 的 JADX 解码目录）

以下值来自 `C:\Users\aixbox\AppData\Local\Temp\codex-coloros-folder-resources-20261031\res` 下的 `res/values/dimens.xml`、`res/values/colors.xml` 和 `res/values-night/colors.xml`。它们与上表 APK SHA-256 `4a91e6e1e25efd0486095a658ca71ecf8e5cd50422232e02d35ee93f3decf828` 对应，不是猜测值。

| 资源                                              |                  默认值 |
| ------------------------------------------------- | ----------------------: |
| `bf_Stacked_sub_icon_preview_padding`             |                   `2dp` |
| `big_folder_content_padding` / `_min`             |             `6dp / 6dp` |
| `smallest_padding_in_big_folder` / `_four_grid`   |           `4.5dp / 6dp` |
| `handel_radius_1xx` / `handel_radius_2x2`         |           `16dp / 18dp` |
| `item_Handle_hot_region` / `_1X1`                 |           `46dp / 32dp` |
| `item_resize_frame_horizontal_background_padding` |                  `10dp` |
| `item_resize_frame_vertical_background_padding`   |                  `16dp` |
| `item_resize_frame_stroke_width_min/middle/max`   |       `2dp / 3dp / 4dp` |
| `item_handle_stroke_width_min/max`                |             `6dp / 8dp` |
| `item_resize_frame_bright_color` / `_dark_color`  | `#33000000 / #99ffffff` |
| `item_resize_handle_bright_color` / `_dark_color` | `#ff808080 / #ffffffff` |
| night 覆盖 `item_resize_frame_dark_color`         |             `#4dffffff` |

这些是资源表的默认/夜间限定值。最终绘制还会叠加 density、DeviceProfile、`LauncherIconConfig.radiusType`、主题、night icon、themed icon、RTL 和 resize 状态动画；因此不能只拿某一台设备的像素截图反推实现。

## 桌面文件夹预览网格：2×2 占位是桌面跨度，预览默认是 3×3

FolderInfo 的预览行列根据桌面跨度和选项计算。普通扩展网格中，2×2 桌面文件夹默认按 3 列 × 3 行预览；2×1 按 3×1，1×2 按 1×3。2×2 文件夹只有在 option 16（four-grid）开启时才改为 2×2 预览。option 32（highlight）也要求跨度为 2×2，但保留 3×3 网格，改变的是首屏可见位和页间 rank 偏移。Simple mode 则读取设备 profile 中的 mFolderMaxColOrRow，不能套用普通扩展网格的默认值。

| FolderInfo 桌面跨度 | 模式条件               | 闭合文件夹图标预览网格 |
| ------------------- | ---------------------- | ---------------------- |
| 2×2                 | 普通扩展网格           | 3×3                    |
| 2×2                 | option 16 且跨度为 2×2 | 2×2                    |
| 2×2                 | option 32 且跨度为 2×2 | 3×3 highlight 排列     |
| 2×1                 | 非 four-grid           | 3×1                    |
| 1×2                 | 非 four-grid           | 1×3                    |
| Simple mode         | profile 提供行列数     | 按设备 profile         |

BigFolderGridOrganizer 构造时默认 3×3，但每次 calculateGridSize 都会重新使用 FolderInfo.getPreviewColumn / getPreviewRow。是否扩展网格由跨度决定，核心条件是 spanX > 1 或 spanY > 1。option 16 的识别条件是 option 16 与 span 2×2 同时成立；highlight 的识别条件是 option 32 与 span 2×2 同时成立。

这解释了用户指出的关键区别：2×2 是文件夹在桌面上占的格子范围；它内部闭合状态显示的应用不是 2×2 个，而默认是 3×3 个预览位。打开文件夹后的分页网格由另一条 OplusFolderPagedView / DeviceProfile 路径决定，不能用闭合预览网格代替。

## 预览项和末格堆叠的所有主要分支

普通 2×2 预览的 3×3 共九个位中，最后一个逻辑位是堆叠位。普通模式下，最多八个应用按普通预览图标绘制；额外应用从第九个位置开始汇入末格的 StackedDrawable。StackedDrawable 内部最多绘制四个小图标，按 2×2 排列，所以视觉上会看到“3×3 网格的右下格里有四个更小的图标”。

| 该页剩余内容数 | 普通 3×3 闭合预览                      | 堆叠组                               |
| -------------- | -------------------------------------- | ------------------------------------ |
| 1–8            | 显示对应数量的普通预览项               | 无                                   |
| 恰好 9         | 九个位置全部绘制普通预览项             | 无；不能把第九项误当成堆叠组         |
| 10             | 前 8 个普通项，末格显示 2 个缩小项     | 2 个                                 |
| 11             | 前 8 个普通项，末格显示 3 个缩小项     | 3 个                                 |
| 12 或更多      | 前 8 个普通项，末格显示最多 4 个缩小项 | 4 个；rank 12 之后不进入本页闭合预览 |

堆叠组只有在 stackedItems 数量大于 1 时才建立。也就是说，末格不会因“有一个额外项目”就改成一组；恰好 9 项时会走完整九格分支，10 项时才形成包含两项的堆叠组。页码、closing 动画和当前预览页会改变起始 rank；普通非 highlight 页的默认步长是 8，closing animation 使用 mMaxItemsPerPage。

option 32 的 highlight 是另一套项选择分支，不能硬编码成普通的“8 个普通图标 + 4 个堆叠图标”。第一页面的普通可见上限由 8 减 3 得到 5；首屏的堆叠从 rank 5 开始。若首屏恰好剩余 6 项，previewItemsForPage 的完整占位特判允许六项进入；若首屏超过 6 项，则按五个普通项加堆叠位处理，堆叠组仍需至少两项。后续页起点按 8 × page − 3 偏移，使前页末格中已缩小的项目能在后续页作为普通预览项重新出现。该分支必须同时结合 previewItemsForPage、getStackedItems、isItemInBigFolderPreview 和 BigFolderPreviewItemManager.buildParamsForPage 阅读；不能只根据一处 rank 计算推断页面显示。

option 16 的 2×2 预览遵循同一个“满格无堆叠、剩余至少两项才堆叠”的基本原则：三项普通预览加一个末格；恰好四项填满四格；达到五项后末格可由两项组成堆叠组。1×2、2×1 的 1×3 / 3×1 也按格子总数减一计算普通位，实际可见范围依该页 rank 与 mode 分支确定。

主题也影响堆叠末格是否补占位 drawable：只有 OplusUIEngine.isDefaultTheme 为 true、不是 night icon 且 themed icon 未启用时，buildParamsForPage 会补 holder，直到四个子位；实际子图标不足四个时可能以 holder 填充。非该主题组合不能假设固定画满四个可识别应用图标。StackedDrawable 对 hidden 项、空 drawable 和 holder drawable 走 placeholder 绘制路径，正常 drawable 则在单独的 save/translate/scale 层内绘制，并按堆叠 alpha 和 drop 动画状态处理。

## 预览的尺寸、位置、RTL 与外观算法

闭合大文件夹的预览图标尺寸不是常量，也不是“把四个图标缩到 1/4”。OplusClippedFolderIconLayoutRule.init 会从 SizeSpacingConfig 读取设备 profile、文件夹跨度、背景 padding、内容 padding、baseline icon size 和预览列行数，再计算各预览位的位置。

普通扩展网格的基线图标大小由 getPreviewIconSize 计算；水平、垂直间距分别是可用宽高减去两侧 padding 与总图标宽高后，再除以两倍列数或行数。预览坐标由行列、padding、gap、动画偏移和 base preview offset 组合。RTL 下列号通过 RTL-aware 映射反转。2×2 普通模式因此是三行三列的均匀排布；九号位被替换为堆叠 drawable。RTL 时预览项顺序镜像，末位对应的屏幕边角也随列映射镜像。

StackedDrawable 中每个子图标由 computeStackedPreviewItemDrawingParams 另外计算。子位 row = index / 2；列号在两列间按 RTL 镜像；子位平移按子图标 real size 与 stacked gap 排列，scale 使用 mStackedBaselineSubIconScale。子图标基线尺寸由 mStackedBaselineSubIconSize 推导，其中包含 bf_Stacked_sub_icon_preview_padding；real-size 转换还依赖 preview baseline scale 与 workspace icon size。因此资源值、屏幕 profile、主题、设备方向和 RTL 都会改变最终像素外观。

SizeSpacingConfig 的源码还包含按 LauncherIconConfig radiusType 选 scale 的分支：扩展的三格布局使用 0.63 或 0.67 的 icon scale；单格分支使用 0.20 或 0.18；具体分支分别受 radiusType 2 或 radiusType 0 控制。four-grid 的 2×2 项使用整尺寸 bubbleIconSize。这里是打开/文件夹尺寸参数的辅助计算，不应把这些比例直接当成闭合预览末格中每个小图标的最终缩放比例。

## 缩放能力、手柄位置与显隐条件

FolderInfo 构造时 itemType 为 3。FlexibleFolderIcon 的 span 范围为 1×1 至 2×2，并声明 canResize、canShowResizeFrame、shouldDrawResizeFrame 为 true，disableResizeFrame 为 false。这些只表示具备缩放能力，不表示手柄常驻显示。

手柄由 FolderIcon.dispatchDraw 调用 IResizeFramePainter.drawResizeFrame 绘制。FolderIcon 会在 Launcher 环境、虚拟 frame 未禁用时进入此调用；但只有有效 stroke manager 存在、ItemResizeFrame.q 条件通过且 manager 所属 host 就是当前 FolderIcon 时，才走实际描边和手柄绘制。没有 manager、host 不匹配或 q 拒绝时只走其他 fallback；FolderIcon 的 drawHandleInView 返回 true，因此 ItemResizeFrame overlay 会跳过重复绘制，由 FolderIcon 自身绘制一次。

手柄不是常驻装饰：ItemsRippleAnimator 正在动画时绘制路径提前返回；Toggle Bar、Overview、Page Preview、ToggleBar manager 忙碌和 Workspace 状态切换分支不绘制普通手柄；工作区不在允许状态、Simple mode、非 workspace container、resize frame 被强制隐藏、页面不可见、已有 frame 活动、当前布局不支持 resize、没有正确 CellLayoutLayoutParams、FolderIcon 设置了 disable-virtual-frame 等条件会阻止或延迟 frame 创建。OplusWorkspace.tryShowItemResizeFrame 还检查正常 launcher 状态、稳定/过渡状态、拖动来源、页切换、overlay、目标 CellLayout、multi-window、drag cancel、高温保护等条件。能力位与可见状态必须分开实现。

热区与绘制位置也不是固定贴在 tile 的某个百分比上。FolderIcon.getResizeHot 以当前 folder background bounds 为基准，叠加 item_resize_frame_horizontal_background_padding 与 item_resize_frame_vertical_background_padding，再按当前跨度选择 item_Handle_hot_region 或 item_Handle_hot_region_1X1 生成矩形。LTR 命中区位于右下侧，RTL 镜像到左下侧。ItemResizeFrame.setHandleHotRegion 同样按当前跨度选用 1×1 或扩展尺寸资源。真实绘制边界可能使用 ConvertBgParams 的动态 x/y/size；否则读取当前 OplusPreviewBackground bounds。圆角半径在转换中读取 ConvertBgParams.radius，否则使用背景当前 mRadius。

| 视觉属性     | APK 中的实现                                                                                                                                 |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 手柄形状     | 绘制圆角路径的一段 arc；Paint.Style.STROKE，Paint.Cap.ROUND                                                                                  |
| 位置         | LTR 文件夹底边右侧；RTL 文件夹底边左侧                                                                                                       |
| 手柄圆弧半径 | spanX/spanY 选择 handel_radius_1xx 或 handel_radius_2x2，再乘当前 icon size / badge baseline 比例                                            |
| 手柄颜色     | Launcher 根据明暗主题选择 item_resize_handle_bright_color 或 item_resize_handle_dark_color                                                   |
| 文件夹外框   | 跟随 folder 当前 bounds/radius 绘制圆角轮廓；颜色取 item_resize_frame_bright_color 或 item_resize_frame_dark_color                           |
| 描边宽度     | ResizeFrameStrokeManager 从 item_resize_frame_stroke_width_min / middle / max 与 item_handle_stroke_width_min / max 读取，并在状态动画中变更 |
| 可视 alpha   | stroke manager 状态控制；隐藏状态把外框、手柄 alpha 推到 0                                                                                   |

弧线不是所有设备都固定 90 度。LauncherIconConfig.getRadiusType 的 0/1/2 分支在代码中分别被 d6.M / d6.L / d6.N 使用；这三个 helper 已核实为 radiusType 等值判断。普通 FolderInfo 的 itemType 是 3，ItemResizeFrameAnimUtils.c 对默认主题的 FolderInfo 返回 true。对普通 2×2 文件夹，基础 arc 仍为 90 度、offset 0；不同 radiusType 和 1×1 ↔ 扩展跨度的转换动画可将角度与 offset 插值。50° / 20° 分支由 radiusType 2 与特定首尾跨度触发；70° / 10° 分支由 radiusType 1 与特定首尾跨度触发。非默认主题、SmoothRounded V2、OPExp 特殊主题等条件会改走固定或不同的分支。不能把面向其他 itemType 的 50° / 70° 分支误写成所有文件夹的静态样式。

## 拖动候选、阈值、临时占位与提交/回滚

文件夹最大跨度是 2×2、最小跨度是 1×1。ItemResizeFrame 根据当前 span 把指针坐标限制在允许变化的相邻 cell 区域；RTL 时水平 delta 镜像。1×1 在右/下方向扩展；2×2 向左/上方向收缩；1×2 和 2×1 分别组合一个轴扩展、另一个轴收缩。

手势几何使用 cell stride，而不是裸 cell 宽高：

threshold = ((cellWidth + spacingX) + (cellHeight + spacingY)) / 2
deadZone = threshold / 2

点到当前 anchor 的平方距离严格小于 deadZone² 时保持原跨度。超出死区后，源码用 tan(22.5°) 与 tan(67.5°) 的边界划分拖动方向；若当前跨度为非正方形，会反转斜率符号。区域参数更新另用 0.8 × deadZone 判定，这个比例不是第二个跨度阈值。候选范围和 CellLayout 尺寸检查通过后，才调用 resize area 流程。

| 当前跨度 | 两条角度谓词都为 true | 两条都为 false | 只有一条为 true |
| -------- | --------------------- | -------------- | --------------- |
| 1×1      | 1×2                   | 2×1            | 2×2             |
| 2×2      | 1×2                   | 2×1            | 1×1             |
| 1×2      | 2×2                   | 1×1            | 2×1             |
| 2×1      | 2×2                   | 1×1            | 1×2             |

表中的 true / false 是经过 stride 限制后的指针坐标与两条斜率边界比较结果，不是简单的“向右就是加列”。碰到边界、越过当前布局可用行列或命中 dead zone 时，候选可能保持不变。

ItemResizeFrame 的 ACTION_DOWN 先验证热区、可调整方向和 popup；多指事件拒绝。ACTION_MOVE 更新候选尺寸并创建临时 resize 方案。VelocityTracker 会记录和计算速度，但在本次文件夹 resize 调用链中没有读取速度作为 folder 阈值，不能把 800 px/s 写成文件夹的 fling 阈值。ACTION_UP 与 ACTION_CANCEL 都会按最后 delta 再做一次预览计算；两者不等于“必然提交”或“立即恢复”。

候选 resize 调用 OplusCellLayout.createAreaForResizeVariableSizeHostView(..., commit=false)。CellLayout 先检查新矩形是否可放置；必要时恢复此前隐藏项并重新尝试；与目标冲突的相邻项目会尝试迁移。成功方案写入临时 cell/span 与 mLastResizeToCellSpan；失败时恢复最后有效 resize 方案，没有有效方案时回到开始 cell/span。resize frame 关闭后再调用 commitViewResizeState：最终状态无效就将 folder span 重置并 revertTempState；有效才提交临时位置并整理空格。因此临时显示值、最后有效候选与最终持久布局是不同阶段，不能在每次 pointer move 直接写最终 folder size。

## 与当前 DesktopGo 的差异

实现前的静态检查发现，工作区中没有 docs 曾声称已存在的 folderResizePolicy.ts 或 FolderResizeHandle.tsx，当前文件夹尺寸只能通过 OuterFolderTile 的 ContextMenuRadioGroup 改变。现在已新增 `folderResizePolicy.ts` 与 `FolderResizeHandle.tsx`：编辑态才显示状态化底角手柄，pointermove 只保留临时候选，pointerup 才调用 `onResizeFolder`，取消会清除临时候选。

实现前的静态检查发现，关闭文件夹的 2×2 分支错误地复用了 `FOLDER_LAYOUT_PROFILES.big` 的 4×4 内容 profile，`FolderIconVisual` 还按最多 2×2 摆放并只取两个 stacked 图标。现在 `folderPreviewPolicy.ts` 提供独立的 3×3 闭合预览组织器：1–9 项为普通位，10/11/12+ 项分别在右下第九位绘制 2/3/4 个 2×2 缩小图标；`OuterFolderTile.tsx` 与 `DragOverlays.tsx` 共用同一策略和 RTL 位置映射。打开文件夹仍继续使用原有 4×4 内容 profile。

实现前拖动 ghost 的 `DragOverlays.tsx` 通过另一套 2×2 逻辑组织预览，导致拖动中与静止桌面文件夹不一致。现在静止磁贴和 ghost 都使用 `getClosedFolderPreviewItems`；打开后 modal 的每页容量仍由原有内容页 profile 决定，没有被改成 3×3。

当前现有 FOLDER_LAYOUT_PROFILES.big 是 4×4，影响文件夹内容页/分页策略。ColorOS 的打开文件夹页由 DeviceProfile 和 FolderPagedView 路径决定，与闭合图标 3×3 预览分开。下一步应先确认 DesktopGo 的打开文件夹容量产品需求，再拆分“内容页 profile”与“closed-folder preview profile”，不能只为修复桌面图标而把 modal 每页容量一起改掉。

## 分析完成状态与实现边界

与文件夹闭合预览和右下角缩放手柄相关的静态实现、分支、默认资源值和限制已经核对完成；DesktopGo 已完成闭合预览、共享 ghost 组织器、RTL 映射、主题 holder 策略和状态化手柄接入。2×2 文件夹拖入目标只保留整体接收态背景，不再额外绘制 3×3 背景网格；resize 的临时邻居迁移/提交回滚规划已抽成纯事务。后续实现必须保留以下边界：

1. **闭合预览与打开文件夹分页分离。** 普通 2×2 文件夹闭合时是 3×3；打开后的页面容量仍由 `OplusFolderPagedView` / `DeviceProfile` 决定，不能把 modal 的 4×4 内容网格直接当作闭合预览。
2. **预览组织器统一。** `folderPreviewPolicy.ts`、`OuterFolderTile.tsx` 和 `DragOverlays.tsx` 已使用同一套闭合预览与 RTL-aware 几何策略；普通 3×3 的第九位只有在剩余项目至少 2 个时才替换成最多 4 个的 2×2 `StackedDrawable`。
3. **手柄是状态化的 resize frame。** `FolderResizeHandle.tsx` 只在编辑态且文件夹未打开/未作为拖入目标时显示，LTR/RTL 分别落在右下/左下，保留 10/16 容器外扩。点击热区改为沿可见手柄四周额外扩展 10px 的透明 HTML 按钮（按钮边界随热区扩展，避免裁掉外侧范围），使用同一条弧线生成窄带 clip-path，不再使用整块 32/46 矩形或 SVG 透明描线命中；文件夹中心和其他边角不参与缩放命中。按照用户要求，DesktopGo 的边框与手柄同时出现，静止和拖动时均固定为 2px 边框、6px 手柄。`FolderResizeOutline.tsx` 读取文件夹圆角的实际 CSS 值，由 `folderResizeOutlineGeometry.ts` 生成共用中心线，使用 SVG 等宽描线；手柄居中截取原 16/18 半径四分之一圆对应的弧长（约 25.13/28.27px，不含圆头），不随背景圆角变大而加长。圆头使用 `strokeLinecap="round"`，替代 CSS 边界与遮罩拼接，避免端点与中段粗细不一致。边框位于背景内侧，容器外扩不作为描边边界。APK 的状态线宽与半径仍保留在上文取证数据中，这里的固定线宽及定长共线描线是 DesktopGo 的交互适配。页面可见性等 Android 专属条件仍由宿主状态边界负责。
4. **拖动使用临时布局。** `folderResizePolicy.ts` 在 pointermove 生成候选尺寸，`folderResizeTransaction.ts` 基于 source snapshot 生成临时邻居迁移和占用结果；pointerup 才调用布局提交，pointercancel/无变化丢弃临时方案并恢复原快照。完整 Android 的原生 CellLayout 动画仍属于平台适配边界。
5. **主题 holder 由显式策略控制。** `folderPreviewThemePolicy.ts` 复现默认主题、night icon、themed icon 三个条件；默认主题补齐 holder，night/themed 分支保留空槽。

剩余未知量只属于运行时选择，而不是实现缺口：目标设备实际采用的 density、DeviceProfile、`LauncherIconConfig.radiusType`、主题/night/themed icon、RTL 和动态资源覆盖需要运行时状态才能确定。上述条件会改变最终像素位置、圆弧角度或占位图，但不会改变本报告已经核实的分支结构。

### DesktopGo 接入结果（2026-10-31）

- `folderPreviewPolicy.ts`：独立维护闭合预览网格；2×2 默认 3×3，末位 stacked 只在溢出至少两个子项时启用，最多四个子位。
- `FolderVisuals.tsx`：普通项按共享网格定位，末位 stacked 固定 2×2 子格，缺少的子位保留 holder 槽位；RTL 镜像列号。
- `OuterFolderTile.tsx` 与 `DragOverlays.tsx`：静止磁贴和拖动 ghost 共用同一组织策略；打开文件夹的 4×4 内容页逻辑不变。
- `folderResizePolicy.ts` / `folderResizeTransaction.ts` / `FolderResizeHandle.tsx`：实现 cell stride、threshold/deadZone、22.5°/67.5°方向判定、资源几何、LTR/RTL 手柄、临时邻居迁移和 pointerup 提交/取消回滚。
- `folderPreviewThemePolicy.ts`：按默认主题、night icon、themed icon 条件决定 stacked holder 是否补位。
- `FolderDropReceiverBackdrop`：拖入 2×2 文件夹时只显示整体接收态背景；`getClosedFolderDropPreview` 仍保留为纯策略和回归测试，不在磁贴上绘制额外 3×3 网格。
- 验证：`pnpm test` 全部通过（174 项）；`pnpm exec tsc --noEmit` 通过；`check-changed-files.mjs` 文件预算通过。`pnpm lint:strict` 在当前依赖安装中被 ESLint 缺失的 `@eslint/config-array/std__path/windows.cjs` 阻断，属于工具链环境问题。

## 证据索引

| 分析主题                            | 主要 REA Evidence ID                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 预览行列、four-grid、highlight 条件 | ev_4ed13b839e45eb71ef0936372febe802023494515786e13cdab65913be34e4b6, ev_9cafdde0ab15955ae616d95ec39891f2e0344c801935701be334da6732a4e653, ev_115d369ab352c0be220592a908ac43c5b03f2758a24f1568b271f8e12e2d3b67, ev_bb497cce738fba30b20e5359f6692f39e979030e02d0a9667c044efdbaa338d, ev_9b4bf371d4bfc60334e06f9135542bcff216d69c5ec6cbcd53ef2bef8974e7fa                                                                                                                                          |
| 预览页选择、堆叠项和边界特判        | ev_b410649a55a6a60b85b18225a3c182709eb9b34480a59b0f57c82fac7b2b6f1f, ev_50a9bab31b2ae6c2202b8328ed928c3d8cc77c0ef915e2e581bc63198b8a25d8, ev_2edd7469f3e7325b72856e5c3b11e29194e32bdbfde6a13e17645752673a21b3, ev_4d7276bdbbabc4564477e408456dad8de22e4bc28ab5cdc6b93ee3493f39ff5a, ev_76fca869097b66520b1822bc0b72539c5ba44692a6f9c25995c6220b9efe0254                                                                                                                                         |
| 图标、堆叠网格尺寸与绘制            | ev_8318f90b8b83df1ef766f457119e5ca9e7b714bdd6c8312565d30411bd6651a2, ev_652148cb9e929c3e2befb093becc1b658c0614851dbcdb2121f008c9c8263613, ev_32427b161860cb6bf3c82876910a5154c40e387d79376cf8ab954167d0fe3d44, ev_58f76cf08879619eaed28b426b9d8031b28150454c5c3a158c7be43db741a5ea, ev_eaa11799a08ccd8cc2e9c36e614ba0b4518c48ed372d8ec06149a4c79427aeab, ev_68d8888dd31f5493f0647b61d80acc381c11304bddbbd9ad7c4c5bad08142c98                                                                    |
| 手柄创建、绘制与可见性              | ev_b86d910683bcf9cef5c27fdf5dfbf2c7e64724e135a04ca5fbbe6cef0d3f8595, ev_d383fe1de79999e10949190cc9b6d75c26f27e11717dadf90b2e6065fe468b0d, ev_4167601d3698e10158107596334ab6ab69a8d111cbac3c23ce4f896ea384fe9, ev_e232a76fb502faed1b1bf307815dcfa36ad7cc672fc40d23615034589fc9715c, ev_bf7676bbdef5f09c35799b9a8ffa8b1c44db5d2344594ecc6754059733ebb0, ev_93820f64fa06beffbd4646a089e0a87fdeb89588b33a25b2b7784bc39ee0636c                                                                       |
| 热区、尺寸资源和半径辅助函数        | ev_07424df513c5cc8f2db0e97694b292f25f6e28928908d9b6b59c3a1e192f21d6, ev_ec8aaa406ef76c85c66b39a9411e432a2e2d1b3e08921d5a3199b601edea076b, ev_48299102c76eeb961fcbd3b6d6f00bd01a0b06b5e555e716cefd2a21f959073a                                                                                                                                                                                                                                                                                   |
| radiusType 与弧角分支               | ev_6d9b0060d12b1b4ac047f1b066680d49b50bf1823922a68a0cb59e8faa9fec6b, ev_616116176968e2d3a6f7762de475e56365e3eec0e56e59c4a08d1fc845e7405e, ev_7a38d85cda0b20ca8cd2c97eb981ff9c0ab075654f41e31d14474048960a5555, ev_202ed4581cedaefa817f46dad2ea93365a61683e3ec5cc97e1ff8bdaa63f9c57, ev_be9ddd16a8d1b4ff6b77031b461fd2be9edce861ea86127ccbd07257d1e5060b, ev_ffad2249618f17eb5753319d51412b8d945015bbeceb97fa85668c61dae9c8f9                                                                    |
| 手势阈值、候选和提交                | ev_25f0d080b095fd6257ce80ca52622edd3604f62ab1fdb8f9e2ddc8c6365e93, ev_c309ee7fa2f9fc6723bff0eb077f33698fb46189f24bc7a87baf594c45e4467a, ev_ff731550d1b93892f5c37a1b0682bc47492868a1f6246a6f380c2523fdcaf28b, ev_6ce646d342a8804c18cc5958628b8adbb1dd0929e11bf49a6aa77e9d1c6e324d, ev_bb18b3ee333d50753d588fd3a2c2ac15722a661949472992dab1839b040e4f89, ev_68b9ab7a415ae8cbb6386ffce61e3e4ab7c62e3db01492ad4eee20a135d52bcc, ev_ee3197f5fe7d993e080f566e67dfb2c7bf69301a2a0afbb4ac38ec75f6d53df1 |

REA Evidence 限制：静态 JADX 源码未覆盖 APK 的所有反射、运行时主题选择、未分析的动态调用或不同版本分支。若使用其他 OplusLauncher 版本、设备 profile 或动态资源覆盖，需重新对哈希、资源配置和具体运行模式取证。

## 本轮补充核对：变体分派、限定条件与方法证据

### 变体分派已经分开确认

- `FolderGridOrganizerFactory.createFolderGrid`：`FolderInfo.hasExtendedGrids()` 为真时创建 `BigFolderGridOrganizer`；否则创建普通 `FolderGridOrganizer`。因此 2×2/2×1/1×2 的闭合预览不会误用普通小文件夹的 organizer。
- `FolderIconLayoutRuleFactory.createFolderIconLayoutRule`：工作区路径创建 `OplusClippedFolderIconLayoutRule`；任务栏路径创建 `TaskBarFolderIconLayoutRule`。任务栏 layout 使用独立的小文件夹比例和 padding，不应直接复用工作区大文件夹的堆叠几何。
- `AppHiddenSimpleFolderGridOrganizer` 固定 `mCountX=3`、`mCountY=3`、每页 9 项；这是隐藏应用文件夹的独立策略，不代表普通工作区文件夹的所有模式。
- `FolderPagedView.itemsPerPage()` 返回 organizer 的 `mMaxItemsPerPage`；`OplusFolderPagedView.setupContentDimensions` 只按打开后的内容页 profile 计算行列。它与闭合图标预览调用的 `getPreviewRow/getPreviewColumn` 是两条路径。

### `SizeSpacingConfig` 的限定分支

- 扩展文件夹的 `getContentPadding` 对方形网格使用宽高较小值，并按 `smallest_padding_in_big_folder` 设下限；four-grid 使用 `smallest_padding_in_big_folder_four_grid`。非方形 3×1/1×3 返回非对称的水平/垂直 padding。
- 1×1 普通小文件夹在非 preview 强制路径下返回零 padding；preview 强制路径才按 3 个位置计算。不能把小文件夹的比例套到 2×2 大文件夹。
- 构造 `SizeSpacingConfig` 时，垂直内容 padding 读取 `big_folder_content_padding`；平板的水平内容 padding 读取 `big_folder_content_padding_tablet`。横屏会让 bottom padding 复用 top padding；非横屏会结合 icon drawable padding 和 DeviceProfile 计算。
- 背景水平 padding 会被 `min_area_icon_padding_horizontal` 和设备 profile 上限夹紧；最终几何还受到 cell 宽高、DeviceProfile、RTL 和 density 影响。资源表中还存在 `big_folder_content_padding_for_col5=4dp`，但本次核对的 17.3.12 文件夹预览调用链没有读取它，不能擅自应用到 3×3 闭合预览。
- `ICON_SCALE_FACTOR` 在 `d6.N()` 分支为 `0.63`，否则为 `0.67`；`SMALL_FOLDER_ICON_SCALE_FACTOR` 在 `d6.M()` 分支为 `0.20`，否则为 `0.18`。这些是基线 icon 尺寸分支，不是末格四个子图标的最终 scale。

### 本轮新增的 REA 方法证据

| 范围                                           | 证据 ID                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FolderInfo 行列、容量、four-grid/highlight     | `ev_14fa68d7213d9302f8664441982ad1ee3c13997223c5153c9083a31f154eab71`, `ev_d035300c58023ede88af5e2ff8ec6df2703946013cb4d298d31185bc0304081f`, `ev_92b2cf912da93b1e09d971bacad4550ca1cbc0f34d24ca7ce6c74e33d0285dac`, `ev_c07578d5fa57b65c626bec68fd4d8692531445d02d64843cddeb8e9baa2f42c8`, `ev_b740269b6a52c02b2d0a1cd11a1333e7a84f1caf6276b5b24f94bed8fd9ece4a`, `ev_f8da0cdc91e78aca7ab366a29043d5f5c1f8192f1b6d89d57308833b3d0f7d8d`, `ev_03c8ee783d78dca14e865c09745548168d422d7858891b10cbb33bdec9817617`, `ev_4c11af893aac7c22b6e5e8592570b20ec4d471820cbffebe6002141c1c44a7f1`, `ev_0c9d77aec38006a14e8d2e277880ad62a41f469232f7af6a27a4b7b6414cf5b9`                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Organizer、末格选择和 closing page             | `ev_0097d80059f3e39aaed9c448d21e84989931aaec5a31a79122025fec24f3dbd1`, `ev_42096b71c958ad61a1f78e4986c457c664df8ec3779db2220b16dadbd515da91`, `ev_f9859105632e5886e53fa2225fa2296effe153cd75a21e21b56b4cf01f76c692`, `ev_d02fb2ac624bbaf1a14ac23c191994846bdf63b691d8e5f69dcdb89eb28276ff`, `ev_ff503f7320f60e72c3deab644c8ab29c296d110354fac7fb623058b28f7ba0a5`, `ev_36107cfa834ed75252071e2fec091d1f3edbd06a9f68d60e0a4ad0c4f6433415`, `ev_b3631194e7be5602706b75e488390417782fd4931e92730b877c29bb3a5e9f37`, `ev_e34572947cf53f71e932d6c220449c77f1939003366b8c044c1aa3866fe42f95`, `ev_c1bede4706b9c3b553ca4c130313b99afe0d9551261e695756c0237e8a34e96e`                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| BigFolder preview 构造、布局和 StackedDrawable | `ev_7a28996a081d02aa6a6a5e3a2f84e507c425aadd87b32c559018e63380c8ac9d`, `ev_4fd09b983fc0462b7a7f07a6d90455d90842a764a6c27a47a312ec146c3be5c4`, `ev_87b6d6a6977fc7270889fd8ac68be88159a99351c971fb03d0bd4bf2afc3a98e`, `ev_250c3ec2b30cb40b20122a3facbdba30cedf7214e1ce90c03231c02e31a4648f`, `ev_8ad68e1b519b1aed71856dd85a69d9049a9bcfdee2061499d8446c4d6f4ab40d`, `ev_fe3a9b0e74a2527f30945f4a2da6eab6e36bc8bc641dfd483149633776d9ce37`, `ev_b69166bd5fc4fd68f057344cc56d86b1a1b6761a82ed60dda70eb31f7f337419`, `ev_247068bce878c37968050d3ad16b061f7794753232b9cf4648f1e379578859d5`, `ev_9277261430be42b86b6ac85a6e8aae879581215e5daca4841ef2b115525ac7fc`                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 手柄、热区、阈值和临时 resize                  | `ev_2eaad83586a90266aa214c7a5f9e7d29fe4eb1bb698cfb8693a26ab73e1165bd`, `ev_41fda5e788d92dbbbbedc157ab8d0371bb522435fd3d86195b73343bdf0188e3`, `ev_a9a8f1782bad1815baaf0840876a4ef3919d43ac6c07e94f8e3ed2a6909b7fd3`, `ev_682055a0f51bd549474adef7f25f33653c1e00582740389b719fcef8d29d2929`, `ev_7956175d442c6fa2be2c5e6a29679bb40caf4f52c8acccc586f0eb6948ac0dc8`, `ev_7299b6149cac120d906afe6eea000115f2aa9388a0399a9ec7c37e08d3cd70f9`, `ev_4a7783d10ced1a96be4b50e556e3173f15814d2dae2ed64640813f364478cd06`, `ev_3ac973cbe8a9b1c17421ed34badacce316eae754387fb7ac1c8fa2cc6f9cde22`, `ev_f26881d1ace8c507e8b19b974b2f15cc1db53cd7cfcca2cbb264ea3b3a66c4e8`, `ev_a93285f1fba5d7330ff7a15d8dc01df766c3ed1f957233ce25d611c71f27b28a`, `ev_fc705242e11a7bb5fb7243f44870149e72f4d67577d7580068b82392891a77f5`, `ev_b20a79f5403f09e15fe5fd841c8945cda99b7afaf1bfc419f93470844c857285`, `ev_3b609f8fba9c4ab0e76fb30eb3195cbe44a9615764bf567eec52f3b640709321`, `ev_9338d8ea70e68cd6aa8c48e2dfe0c30c12b74c6b2dc6f086bb15dfa915ea63f9`, `ev_b5c07fdb2bf56ea111085b386c256f64c9d5c798aadb6e557b4a6bc06df6d5f8` |
| SizeSpacingConfig 和打开页                     | `ev_1542b800d5b186c738d6d4773707b3c0da37ead9b78a14f5307972958f2830f8`, `ev_9f445d14c4562feb28e51dfc816dcd34a91bde56bd762ea42597ca59b866db51`, `ev_94b73a1f9c2fd60904d4b73f58131d1f771e6eef99c98c7550958dcf2b500338`, `ev_bea7f8e0e10a68268515d29a1a23b8f33a4fb374d3cee4a6f25d5c175de97810`, `ev_a2e98a79c557bc32f114e2b687edf6d00d7ef14e4ecb25720026bf9885dffb24`, `ev_abfa988fb4cf1a9973d1e7c59f0a37182ed91387f660ec74b0b1bb4e658ac9bd`, `ev_c4a1e982ee72ff0a0d5894308ae6f1ee8d6ffe03a3337039839dc1bac6c9f79f`, `ev_11f1f7f91bf1ee05d7ec1be43546fc9e21a0cc1910efa055bcf1ac7fa4a2f688`, `ev_12f14488a9fc075a5c0c15074eda18dc9e26d4bbdbe8d65afab3bf90f5ba3ec3`, `ev_c6731e5b4bdb882432f50f9b764caba33290893d1b664a234c4304007bd16f09c9`                                                                                                                                                                                                                                                                                                                                                                  |
| 任务栏 layout 与补充动画                       | `ev_4caf1e5fc151a1d417d456dd11f08cf11989588b33a25b2b7784bc39ee0636c`, `ev_d254983de9bc6dbf1abd7dca633bca0eb34cecd2011b8c78749a82e46a90c586`, `ev_4e544aba4cb870444efa35dbd13845d1221c9489e9af5aae11cf8f108826f557`, `ev_b69166bd5fc4fd68f057344cc56d86b1a1b6761a82ed60dda70eb31f7f337419`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

这些证据均来自同一 APK SHA-256，属于 shipped-artifact 静态证据；仍不能替代目标设备运行时对 density、DeviceProfile、主题和 RTL 选择的观测。
