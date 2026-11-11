# 桌面图标、文件夹与 Dock 明暗材质深查

> 项目内归档：2026-11-11。原报告来自 `D:/Project/other/ColorOS16/analysis/launcher-material-deep-findings-20261111.md`；正文保留调查时的结论与限制，源码链接改为项目内带原始行号的证据摘录。历史语境中的“本轮”指分析阶段；此归档没有实施材质变更。阅读入口见 [README](README.md)，后续方案见 [实现方案](implementation-plan.md)。

日期：2026-11-11。仅静态分析，没有修改 DesktopGo 材质或任何产品代码，也未启动手机系统、DesktopGo、浏览器或截图测试。

## 范围与身份

分析目标为当前固件的 OplusLauncher 16.6.13；本轮重新计算 APK SHA-256，结果为 `3b023e0211f8660988ff1cf7bb4c37129e07d3ce506e8047f8542fbfa64ba3cf`，与既有记录一致。普通 JADX 输出与已有 REA Evidence 分开看待；本轮新增内容没有 REA Evidence ID，不伪称运行观察。

结论：**普通应用图标的暗色重绘、文件夹图标的壁纸模糊材质、打开后的文件夹内容背景、手机 Dock 不是一套无条件通用材质。** 普通图标确有接近黑色的背景生成路径；文件夹的完整深色材质在已找到的普通分支中使用 MIX + OVERLAY，并非额外叠一层纯黑。不能从“系统某卡片更黑”推出文件夹应使用同样的黑色不透明度。

## 1. 普通应用图标：独立图标资产与暗色背景生成

`LauncherIconConfig.isDarkModeIcon` 按图标配置判断，不是把全部桌面表面统一改成黑色。[LauncherIconConfig.java:201](evidence/launcher.md#source-019)

`BuildInThemeIconLoaderFactory.assembleDrawable` 先解析图标样式前景/背景；满足 `isDarkRedraw` 时改用夜间前景，再生成夜间底图；NightShadow 也有独立底图分支。[BuildInThemeIconLoaderFactory.java:218](evidence/launcher.md#source-040)

| 分支                 | 颜色（统一写 Android ARGB）   | 触发/含义                                                                                  | 直接代码证据                                                                                                                             |
| -------------------- | ----------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 普通图标暗色重绘     | `#FF383838` → `#FF151515`     | `theme == 2`，图标暗色开关打开，且系统处于 dark；使用 `rec_night` 前景和生成的线性渐变背景 | [条件:2400](evidence/launcher.md#source-039)、[颜色常量:83](evidence/launcher.md#source-039)、[调用:73](evidence/launcher.md#source-040) |
| NightShadow 图标主题 | `#FF0F0F0F`                   | `theme == 7` 且默认主题资源；不是单纯“系统夜间模式”的同义词                                | [条件:2434](evidence/launcher.md#source-039)、[调用:77](evidence/launcher.md#source-040)                                                 |
| 普通日间图标         | 每个应用/主题自己的前景与背景 | 当前 loader 从资源路径装载，不是全局白色雾面叠层                                           | [装载:238](evidence/launcher.md#source-040)                                                                                              |

[StylePrefixAdapter.java:32](evidence/launcher.md#source-038) 明确把夜间前景名设为 `rec_night`。`createBg` 创建 `GradientDrawable`、设置线性渐变，单色数组用 `setColor`，多色用 `setColors`；该方法没有显式设渐变方向，本文不据此承诺屏幕上的渐变方向。[UxIconLoaderUtil.java:2804](evidence/launcher.md#source-039)

OS16 图标根目录识别与 `hdpi` 选择由路径代码确认，实际固件也有对应资源树；这不是只依据 `darkrectangle` 等文件名猜测功能。[UxIconResPathUtil.java:16](evidence/launcher.md#source-041)

边界：这里证明一个具体的内建变形图标装载路径。第三方原始图标、在线主题、单色图标、动态图标与缺失资源回退并未逐一完全跟踪。`loadUxIcon` 的一个重载发生 JADX 类型推断失败，因此不宣称覆盖全部图标；上表所引短方法和常量均有完整输出。

## 2. 文件夹图标：完整材质与普通底色必须区分

`OplusPreviewBackground.initBgDrawable` 在支持新模糊时创建模糊背景，否则使用普通 drawable。[OplusPreviewBackground.java:732](evidence/launcher.md#source-032)

支持条件含系统材质开关、BlurService 包是否存在及设备能力分级，不能仅凭 APK 存在就判断用户手机运行该分支。[OplusBlurProperties.java:350](evidence/launcher.md#source-022)

完整材质初始化使用 `setBlurParams(800, mode, blendColor, mixColor)`。800 是厂商 blur 参数，未核实物理单位，不能当 CSS 800px 或已知 sigma。[OplusPreviewBackground.java:263](evidence/launcher.md#source-032)

| 主题/壁纸分支  | blendColor / A（Android ARGB） | mixColor / B（Android ARGB） | 混色顺序                               |
| -------------- | ------------------------------ | ---------------------------- | -------------------------------------- |
| 浅色，普通壁纸 | `#3D2E3033`（23.9% 深灰）      | `#FF37393E`（100% 蓝灰）     | MIX(A) → DODGE_BG(B)                   |
| 浅色，亮壁纸   | `#1A000000`（10.2% 黑）        | `#00000000`（透明）          | MIX(A) → DODGE_BG(B)，第二步 alpha 为0 |
| 深色，普通壁纸 | `#33999999`（20% 灰）          | `#A3737373`（63.9% 灰）      | MIX(A) → OVERLAY(B)                    |
| 深色，亮壁纸   | 同上                           | 同上                         | 同上                                   |

参数直接来自 [BlurMaterialColor.java:10](evidence/launcher.md#source-018)。[OplusBlurProperties.getBlurColorParams](evidence/launcher.md#source-022) 根据系统主题选择 mode3/4，再选壁纸分支。`isExtremeDark` 形参在当前反编译的该方法主体中未消费，不能凭参数名补造“极暗壁纸加黑”的规则。

普通手机文件夹底色/无模糊回退为：

| 条件                                  | Android ARGB | 语义与来源                                                                         |
| ------------------------------------- | ------------ | ---------------------------------------------------------------------------------- |
| 浅色，亮壁纸                          | `#66A6A6A6`  | 40% 中灰，[values/colors.xml:2379](evidence/launcher.md#source-006)                |
| 浅色，普通/暗壁纸                     | `#66E0E0E0`  | 40% 浅灰，[values/colors.xml:2380](evidence/launcher.md#source-006)                |
| 深色，以上两支                        | `#4C000000`  | 29.8% 黑，[values-night/colors.xml:590](evidence/launcher.md#source-005)           |
| 支持 taskbar 的大屏另一支，深色亮壁纸 | `#66404040`  | 不能套用到普通手机，[values-night/colors.xml:499](evidence/launcher.md#source-005) |
| 支持 taskbar 的大屏另一支，深色暗壁纸 | `#66999999`  | 同上，[values-night/colors.xml:500](evidence/launcher.md#source-005)               |

底色选择调用链见 [BigFolderUtil.java:36](evidence/launcher.md#source-016)，其中手机亮壁纸分支还要求默认主题资源。普通 [folder_icon_bg.xml:3](evidence/launcher.md#source-001) 是 solid + corners + smooth-weight，没有常驻高光描边。

## 3. 原生 SDK 确实是服务模糊图 + 本地 shader，不能随意叠两次颜色

本轮新增追踪补全了此前只看 shader 片段的缺口：

1. `BlurDrawable` 继承 `ContinuousBlurDrawable`，当前构造函数实际调用 `super(surfaceControl, context, true)`；默认参数桥也默认启用 shader。[BlurDrawable.java:68](evidence/launcher.md#source-034)
2. `ContinuousBlurDrawable.setBlurParamsInternal` 在 shader 启用时，把混色参数交给 `setBgAndFgBlendParams`，只有模糊参数变化才要求服务重算。[ContinuousBlurDrawable.java:83](evidence/launcher.md#source-036)
3. `BlurParam.toFloatArray` 在通常的 shader 启用分支将发送服务的混色模式和 A/B 色置0，保留模糊半径等参数。因此已有证据不支持“服务已经混一次，然后本地又叠灰一次”。debug blendType 能改分工，运行状态未观察。[BlurParam.java:346](evidence/launcher.md#source-035)
4. 收到 BlurImage 后优先绘制本地 shader；没有图才画 placeholder；shader 不可用时可走直接图像绘制。[ContinuousBlurDrawable.java:164](evidence/launcher.md#source-036)
5. `LayerBlurDrawable` 正常桌面状态取 blurAlpha=1；`setBlurAlpha` 将 defaultAlpha 设为 `1-alpha`。默认底图和模糊图主要是切换/过渡关系，不能把普通夜间 `#4C000000` 无条件叠到完整 MIX/OVERLAY 后面。[状态:116](evidence/launcher.md#source-033)、[alpha:427](evidence/launcher.md#source-033)

因此，本地 AGSL 不是仅凭名字猜到的备用实现；它是本构建中明确启用的路径。但这仍不等于已经观测到特定手机每一帧的运行状态。

## 4. Alpha、颜色空间与“为什么更黑”

`BlurDrawableShaderBaseStringKt` 的 main 取 `uBitmap.eval(mapCoords).rgb`，随后直接构造 alpha=1 的颜色。普通文件夹的 MIX/OVERLAY 只更新 RGB；本轮没有发现这一 shader 额外执行 gamma、toLinearSrgb、全局亮度乘法或末尾黑色盖层。[main:14](evidence/launcher.md#source-043)、[混色:68](evidence/launcher.md#source-042)、[doBlend:69](evidence/launcher.md#source-044)

混色常量以归一化 float 数组传入 `setFloatUniform`，并不是 `layout(color)` 类型的 A/B uniform；单独的描边色才声明 `layout(color)`。不能根据 Android 支持色彩管理就断言这里有一个确定的 gamma 校正遗漏。[BlurDrawableShader.java:218](evidence/launcher.md#source-042)

SDK 支持 brightnessScope，但默认值是 `[0,1]`；已追到的文件夹初始化没有把它设成更暗的范围。[BlurParam.java:436](evidence/launcher.md#source-035)

在假定输入为不透明 sRGB 数值、没有壁纸前置蒙层和其他运行态变换的前提下，当前普通深色公式得到：黑 `#000000 → #1D1D1D`，中灰 `#808080 → #7D7D7D`，白 `#FFFFFF → #E9E9E9`，用户提出的蓝色 `#096692 → #23698D`。这是公式数值说明，不是真机截图测量。该公式会抬高最暗部，因此无法单凭这组参数证明“全背景都应更黑”。

目前可成立的解释有明确范围：普通图标确实有很黑的独立底图；无模糊手机文件夹确实有约30%黑色普通背景。用户设备究竟使用哪个分支、服务实际采样前的壁纸亮度、BlurService 的内核/采样色彩、系统合成色域与显示管理，均尚未取得运行证据。**不能把尚未证实的这些差异直接改写为一个任意20%或25%的黑色系数。**

## 5. 文件夹高光与边缘

完整模糊材质有可选的纹理描边：`refreshBlurDrawableParam` 只有系统纹理描边开关打开且当前对象允许时才设置参数，否则明确清空。[LayerBlurDrawable.java:380](evidence/launcher.md#source-033)

开关状态初始 -1，`isTextureStrokeOpen` 要求恰好1。[TextureStrokeController.java:38](evidence/launcher.md#source-031)。描边默认白色，near/far alpha 输入分别0.35/0.20，带尺寸/圆角/向两侧与内部的衰减，不能直接等价为 CSS 35%白色边框。[AGSLGradientStrokeParam.java:583](evidence/launcher.md#source-030)

另有 `isRLMDevice` 才加独立 glassFrame 的路径，不能视为这一加固件常态必有的层。[LayerBlurDrawable.java:624](evidence/launcher.md#source-033)

本轮没有发现普通文件夹 MIX/OVERLAY 基础填色包含固定“上白下黑”纵向渐变的证据。普通应用图标的暗色渐变属于另一条路径，不能移植为文件夹明暗规则。

## 6. 打开后的文件夹内容不是桌面文件夹图标

`OplusFolder.onFinishInflate` 分别取 `folder_animator_background` 与 `folder_content_background`，动画背景使用文件夹普通 drawable；内容背景初始 alpha=0，并由独立动画管理。[OplusFolder.java:1550](evidence/launcher.md#source-037)、[OplusFolderAnimationManager.java:677](evidence/launcher.md#source-020)

普通文件夹布局中的内容背景引用 `launcher_folder_content_background`，该 XML 定义1dp描边和独立内容圆角，没有直接声明与图标相同的实心背景。[布局:63](evidence/launcher.md#source-004)、[drawable:3](evidence/launcher.md#source-003)

这足以证明图标态、展开内容、动画过渡应分开分析；它不足以推导展开时全屏壁纸 scrim 的最终暗度。本轮未完整跟踪 OPlusFolderExtV2、LauncherState/DepthController 的展开背景合成，保留为未决项，不把打开文件夹后的变暗错误归到图标材质。

## 7. Dock 也不能无条件当文件夹材质

`OplusHotseat.setDockerBackground` 仅在新模糊可用且具有大屏能力时创建完整模糊 drawable；否则使用 `ExpandUtils.getHotseatNormalBgDrawable`。[OplusHotseat.java:1500](evidence/launcher.md#source-021)

| 普通手机 Dock 条件 | Android ARGB | 含义                                      |
| ------------------ | ------------ | ----------------------------------------- |
| 浅色普通壁纸       | `#4CFFFFFF`  | 约29.8%白底                               |
| 浅色亮壁纸         | `#1E000000`  | 约11.8%黑底                               |
| 深色两类壁纸       | `#1E000000`  | night覆盖普通分支，bright分支继承默认黑底 |
| 普通 Dock 描边     | `#2EFFFFFF`  | 约18%白色，drawable确实引用描边资源       |

来源：[ExpandUtils.java:954](evidence/launcher.md#source-017)、[values/colors.xml:1744](evidence/launcher.md#source-006)、[values-night/colors.xml:522](evidence/launcher.md#source-005)、[hotseat_bg.xml:4](evidence/launcher.md#source-002)。大屏模糊分支才复用文件夹的混色参数，[OplusHotseat.java:443](evidence/launcher.md#source-021)。

DesktopGo 将文件夹、Dock、搜索框统一为柔雾，是本项目的设计选择；不能宣称这就是 ColorOS 全部表面的原始统一做法。

## 证据限制与完成状态

本次新增定向反编译保存在 DesktopGo 被忽略的 `build-script/coloros-launcher-{backend,continuous,icons,dark-icons}-analysis-20261111`。使用既有 FocusedJadx / JADX bridge，不安装工具，不修改全局配置。一次请求误填不存在的 `com.android.launcher3.folder.FolderIconType`，命令在成功输出 ContinuousBlurDrawable 后退出；随后使用实际包 `folder.icontype` 补齐。不存在的类名没有作为行为证据。

普通图标 loader 有一处 `loadUxIcon` 重载类型推断错误；关联 OplusFolder 反编译带 DesktopRepository 等依赖错误以及未知 Android 类警告。引用的短方法与常量有完整文本；全量覆盖与动态调用顺序不作保证。

已回答：文件夹完整材质日夜参数与顺序、正常状态alpha关系、服务/本地shader分工、回退底色、条件描边、普通图标暗色重绘、Dock分支差异。部分回答：文件夹展开内容层的组成。未回答：特定手机运行开关、原生模糊内核、实际色彩管理、展开全屏scrim最终合成、最终屏幕视觉一致性。没有把静态公式一致当作真机观感一致。
