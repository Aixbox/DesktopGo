# ColorOS 16 控制中心与 COUI 卡片材质深入分析（2026-11-11）

> 项目内归档：2026-11-11。原报告来自 `D:/Project/other/ColorOS16/analysis/qs-material-deep-findings-20261111.md`；正文保留调查时的结论与限制，源码链接改为项目内带原始行号的证据摘录。历史语境中的“本轮”指分析阶段；此归档没有实施材质变更。阅读入口见 [README](README.md)，后续方案见 [实现方案](implementation-plan.md)。

本次只分析既有固件和新增定向反编译结果，没有修改 DesktopGo 材质代码，没有运行 APK、桌面或服务，没有截图或图像回归。下文色值均为 Android **AARRGGBB**。SystemUI.apk SHA-256 已重新核对为 `376e29fe98139720c8d696cfdc0f48d9c3494ed92cecbfcfb0323e33d6fb86e2`；版本为既有清单记录的 16.99.12。普通 JADX 输出不伪称 REA Evidence。

## 1. 结论

控制中心存在多种材质路径，不能从一个灰色 token 还原全局样式：

- 平台模糊磁贴使用**整块面板的两步混色，再加磁贴自己的两步混色**。暗色磁贴有明确的深灰亮度混合参数，和桌面文件夹的 MIX/OVERLAY 配方不同。
- `topLayerColor` / `bottomLayerColor` 表示混色参数层，不表示卡片屏幕上方与下方的颜色。此处没有证据支持给卡片画固定“上白下黑”渐变。
- `FluidGlass` 设置另有一套直接引用 WebP 高光背景的皮肤。资源绑定已核实，不能把所有名称含 FluidGlass 的组件都解释成实时折射。
- COUI 设置页普通卡片是另一类表面：显式 Dark 主题以黑色页面和低透明度白卡片形成很深的中性色，与壁纸驱动的模糊文件夹不是同一个配方。

## 2. 平台模糊 QS 配方

`QSBlurConfigProvider` 使用 `MixColorWithShader(topMode, topColor, bottomMode, bottomColor)`；构造器明确将四参数保存为对应字段。来源：

- [QSBlurConfigProvider.java](evidence/systemui.md#source-054)
- [MixColorWithShader.java](evidence/systemui.md#source-053)
- SystemUI 自己的 [ShaderBlendParam.java](evidence/systemui.md#source-045) 确认 mode 5=`LUMINOSITY`、2=`OVERLAY`、4=`DODGE`、3=`DODGE_BG`，4 与 3 不能混同。

| 对象/模式                     | 第一步参数（top）               | 第二步参数（bottom）         | 来源行                         |
| ----------------------------- | ------------------------------- | ---------------------------- | ------------------------------ |
| 整体面板，浅色                | LUMINOSITY `#99333333`（60%）   | OVERLAY `#80999999`（50.2%） | NotifiAndQsPlatformBlurExKt:17 |
| 整体面板，深色                | LUMINOSITY `#A6404040`（65.1%） | OVERLAY `#80999999`（50.2%） | 同文件:18                      |
| 未激活磁贴，浅色              | LUMINOSITY `#4D8C8C8C`（30.2%） | OVERLAY `#80B2B2B2`（50.2%） | QSBlurConfigProvider:31–40     |
| 未激活磁贴，深色              | LUMINOSITY `#66262626`（40%）   | OVERLAY `#66383838`（40%）   | 同文件:35–40                   |
| 激活磁贴，浅/深均用此局部配方 | LUMINOSITY `#B3E6E6E6`（70.2%） | DODGE `#80CCCCCC`（50.2%）   | 同文件:20、59                  |
| 分离模式空占位，浅色          | LUMINOSITY `#1AE6E6E6`（10.2%） | OVERLAY `#14838383`（7.8%）  | 同文件:41–46                   |
| 分离模式空占位，深色          | LUMINOSITY `#5C1F1F1F`（36.1%） | OVERLAY `#3D383838`（23.9%） | 同文件:43–46                   |

整体面板参数来源：[NotifiAndQsPlatformBlurExKt.java](evidence/systemui.md#source-026)。`panelElementPlatformMixWithShaderConfig` 第78–86行按日夜选择面板参数，构建 `BlurMixMultiWithShader(组件, 面板)`。

混色数组构建顺序已核实为：面板 top → 面板 bottom → 组件 top → 组件 bottom。`ShaderBlendParamHelper.updateMixMultiShaderParams` 第20–43行把这四项按序装入数组；其中只有面板两项随传入 `f` 缩放 alpha，组件两项保留原 alpha。独立 lambda 明确使用 `ColorUtils.setAlphaComponent(color, (int)(Color.alpha(color)*f))`，并非 RGB 乘法。

证据：[ShaderBlendParamHelper.java](evidence/systemui.md#source-059)、[alpha lambda](evidence/systemui.md#source-052)。

`QSBlurConfigProvider.getSepEmptyHolderBlurDrawable` 第158–165行真实创建 `BlurDrawable(context, SurfaceControl)`、设置 shader 数组、模糊参数与圆角；默认平台模糊整数来自 [integers.xml:19](evidence/systemui.md#source-015)，值为450，尚不能换算成 CSS px。`getStd/ Sep/SeekBar Active/Inactive` 均委托共用方法，因此此配方不限于一个占位控件；各组件是否在具体设备启用这条路径仍取决于配置和调用状态。

## 3. Shader 与绘制链边界

SystemUI 中 `BlurDrawable → ContinuousBlurDrawable → BlendDrawable → BaseDrawable`，其 shader 类型是 `com.oplus.posteffect.agsl.DrawableShader`。Launcher 先前分析的 `BlurDrawableShader` 类名在这个 APK 中不存在，不能直接把另一个 APK 的实现当作本包实现。

- [BaseDrawable.java:31](evidence/systemui.md#source-046) 导入 DrawableShader；第209行实例化；第445–447行用 shader paint 绘制圆角路径。
- [BlendDrawable.java:111](evidence/systemui.md#source-047) 在 enableShader 时将数组交给 `setMultiBlendParams`；第50–62行有图像缺失占位、shader、普通 bitmap 三条绘制分支。
- [ContinuousBlurDrawable.java:127](evidence/systemui.md#source-048) 将 SurfaceControl、drawable ID 和模糊参数注册到 BlurDrawableManager；第195–214行根据 shader 状态更新背景/前景混色。
- [PlatformBlurDrawable.java:124](evidence/systemui.md#source-028) 对 MultiWithShader 调用 helper 后传数组，并同步模糊参数。

这建立了代码接线关系；实际设备是否使用该配置、BlurService 生成的底图、GPU 内核和最终色彩管理未运行观测。本报告不提供“手机最终像素”的承诺，不把混色参数直接解释成 source-over CSS 底色。

## 4. FluidGlass 另有静态资源皮肤

[FluidGlassResPool.java:93](evidence/systemui.md#source-050) 的 `tileConfig` 直接为激活、未激活、不可用状态选择以下 drawable：

- `status_bar_qs_tile_active_fluid_glass_bg.webp`
- `status_bar_qs_tile_active_colorful_fluid_glass_bg.webp`
- `status_bar_qs_tile_inactive_fluid_glass_bg.webp`
- `status_bar_qs_tile_unavailable_fluid_glass_bg.webp`

它们确实是 APK 解码得到的 WebP，位于 `analysis/decoded/SystemUI/resources/res/drawable/`。本轮直接查看了原始 inactive 资源：灰色圆形填充、周边白色高光。这是资源观察，不是运行截图或图像测试。未把某一张资源断言为当前机型所选的最终背景。

[status_bar_qs_highlighttile_active_icon_fluid_glass_bg.xml:8](evidence/systemui.md#source-012) 为 `#3282F9`、alpha0.8 的圆形矢量，且 FluidGlassResPool 第122行实际引用。说明这套材质也包含状态色，并非统一灰玻璃。

手电筒控件另有可明确核实的边缘设计：[bg_flashlight_brightness_levelbase_fluid_glass_bg.xml:10](evidence/systemui.md#source-011) 定义黑色填充alpha0.22与宽度1的描边；引用的[渐变描边资源:8](evidence/systemui.md#source-010) 从白色到 `#0CFFFFFF` 再回白色。这是局部控件的边缘效果，不能迁移为所有文件夹必有明显白框的依据。

开关条件也已向前追了一层：

- `qs_settings_fluid_glass_switch` 的 bit0 控制经典、bit1控制分离；支持时默认值为 `sLowMemoryGlassModeOn ? 3 : 0`。来源：[QSFluidGlassRepository.java:39](evidence/systemui.md#source-058)、第96、204–213行；分离分支独立 [map lambda:60](evidence/systemui.md#source-051) 直接验证右移1位。
- 支持判定要求 `FlavorOneFeatureOption.isFlavorOneDevice()`；若为4GB内存，还要求 `sLowMemoryGlassModeOn`。来源：[FluidGlassResPool lambda:21](evidence/systemui.md#source-049)。没有读取真机开关值或最终设备能力。

## 5. COUI 普通卡片为什么会显得更黑

Settings 的显式 `Theme.COUI.Dark` 与透明模糊表面不同：

| 用途         | 普通浅色    | 显式 Dark   | 资源/主题绑定证据                                    |
| ------------ | ----------- | ----------- | ---------------------------------------------------- |
| 卡片页面底色 | `#FFF0F1F2` | `#FF000000` | Settings values/colors.xml:888–890；styles.xml:11956 |
| 卡片填色     | `#FFFFFFFF` | `#1AFFFFFF` | colors.xml:902–904；styles.xml:11961                 |
| 浮起表面     | `#FFFFFFFF` | `#FF1E1E1E` | colors.xml:1222–1224；styles.xml:12026               |
| 更高表面     | `#FFFFFFFF` | `#FF333333` | colors.xml:1225–1227；styles.xml:12027               |

证据：[Settings colors.xml](evidence/systemui.md#source-008)、[Theme.COUI.Dark](evidence/systemui.md#source-009)。`#1AFFFFFF` 是10.2%白色，若位于黑底上，普通 source-over 合成即约 `#1A1A1A`；这解释了这类设置卡片有很深的中性外观，但不能拿来断言桌面文件夹的最终颜色。

`values-night/coui_color_background_with_card` 仍存在白色值，而显式 Dark 绑定专用 `_dark` 颜色。必须追主题绑定，不宜只搜 `values-night` 就归纳运行中的深色背景。资料位置：[values-night/colors.xml:287](evidence/systemui.md#source-007)。

传统 QS 资源也与平台模糊不同：未激活磁贴浅色 `#FFFFFFFF`，night引用 `coui_color_card_pressed_dark = #33FFFFFF`（20%白）；来源 SystemUI [values/colors.xml:2043](evidence/systemui.md#source-014)、[values-night/colors.xml:596](evidence/systemui.md#source-013)、[values/colors.xml:562](evidence/systemui.md#source-014)。它们是资源分支，不应覆盖上面的真实 shader 配方。

## 6. 覆盖与限制

已回答：QS日夜混色参数、面板和磁贴四项组合关系、模式编号、alpha随展开量变化、FluidGlass静态资源绑定和设置位、COUI深色卡片绑定。部分回答：本包具体shader内部执行（追加文件见下一节）、平台模糊服务输入和最终合成。未知：用户手机正在启用哪个分支、具体背景像素、GPU/显示色彩管理、所有overlay和动态主题覆盖。

定向 JADX 使用现有 FocusedJadx 和现有引擎，输出分别保存在 DesktopGo 的 `build-script/coloros-qs-*-analysis-20261111`。不同轮次出现 unknown Android references、Kotlin Flow结构警告；没有用这些有警告的协程结构推算实际时序。两次尝试的类名不存在，已有生成文件保留，之后按真实继承链继续；没有把失败调用声称成功。没有安装工具或修改全局配置。

## 7. 补充：已找到 SystemUI 本包的实际 shader 执行顺序

追加定向反编译输出在 `D:/Project/SelfProject/DesktopGo/build-script/coloros-qs-renderer-analysis-20261111/com/oplus/posteffect/agsl/`。这次定位了本包的 `DrawableShader`，不再依赖另一个 APK 的同类实现。

- [DrawableShader.java:319](evidence/systemui.md#source-057) 清空 summary，按背景/前景旧 BlendParam 模式追加兼容步骤；第361–363行随后 `addAll(multiBlendParam)`，保持传入四项的顺序；第481行转成 float 数组上传。
- [BlurDrawableShaderBlendStringKt.java:50](evidence/systemui.md#source-056) 实际生成 `for(i=0; i<N*5; i+=5)`，每一步把 outputCol 作为下一步的输入调用 doBlend。
- 同文件第12–13行有完整 LUMINOSITY 和 OVERLAY 公式；第70–87行确认 mode2与mode5都按该颜色的alpha在原色和混合结果间插值。LUMINOSITY按 `.3R+.59G+.11B` 求亮度，调整输入颜色亮度，并做超出范围的色域修正；所以暗色配置不是简单灰蒙版。
- [BlurDrawableShaderBaseStringKt.java:112](evidence/systemui.md#source-055) 从 uBitmap 采样 RGB，令alpha=1，执行混色，再处理可选metaball、描边及裁剪。普通数值配方分析应以“已进入shader的模糊RGB”为输入，不能假设它等于原始壁纸像素。

因此面板→磁贴四步顺序既有参数构建依据，也有本包shader循环依据。兼容背景/前景 BlendParam 可能在 multi 之前追加步骤，最终画面还受输入底图、paint alpha、可选描边、裁剪和显示链影响；若提供公式计算例子，应明确仅计算所选四步配方，不能称为真机测色。

最后这次反编译退出码0，相关输出已生成；工具报告一个 Kotlin 标准库 zipWithNext 的 RegionMaker 溢出及四个关联结构警告，所引用 shader 字符串与顺序方法完整保留。全部本次 Java 分析命令已结束，没有常驻服务或监听端口。
