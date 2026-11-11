# ColorOS 16 深浅色材质：桌面、文件夹与系统卡片

> 项目内归档：2026-11-11。原报告来自 `D:/Project/other/ColorOS16/analysis/material-light-dark-deep-findings-20261111.md`；正文保留调查时的结论与限制，源码链接改为项目内带原始行号的证据摘录。历史语境中的“本轮”指分析阶段；此归档没有实施材质变更。阅读入口见 [README](README.md)，后续方案见 [实现方案](implementation-plan.md)。

本轮为静态调查，未修改 DesktopGo 的材质、组件、样式或暂存区，未启动 APK、DesktopGo、浏览器或模拟器，未截图。新增文件仅为分析报告及定向反编译输出。

## 范围与证据身份

沿用本目录分析的 OnePlus PKR110 固件 `PKR110_16.0.9.401(CN01)`，不泛化到全部 ColorOS 16 设备。

- OplusLauncher 16.6.13，SHA-256 `3b023e0211f8660988ff1cf7bb4c37129e07d3ce506e8047f8542fbfa64ba3cf`。
- SystemUI 16.99.12，本轮重新读取 APK 完整哈希：`376e29fe98139720c8d696cfdc0f48d9c3494ed92cecbfcfb0323e33d6fb86e2`。
- 复用既有 REA 包身份与类清单：`ev_59653a8ac8b7c6724d0787354dd2a4a0ce551f83d9bf212d71281f81e0ccac97`、`ev_c98b842b1586e63b200b9bd83e010e32c9c20afe1a9ec50121fec40ff1d9fda8`；桌面身份为 `ev_09b4165d1f105e2a2dc1122818182d79dbcc6945d58d8fdf0cab03430f4876d1`。
- 本轮 REA MCP 工具未连接；复用已经核实可用的 FocusedJadx 和 JADX 0.7.1 JAR，不更改 MCP 或系统配置。新增 Java 为普通 JADX 静态输出，不冒称新增 REA Evidence。
- 下文 8 位颜色全部使用 Android **AARRGGBB**；百分比指该颜色参数的 alpha，不代表表面整体透明度，也不代表最终像素。

分项调查：[桌面和图标详细证据](launcher.md)、[QS 与 COUI 详细证据](systemui.md)。

## 核心结论

ColorOS 没有一套覆盖所有对象的“统一毛玻璃”。本次核实至少要分开普通应用图标、桌面文件夹、普通手机 Dock、系统通知卡片、QS 卡片和 COUI 常规卡片。它们的取样源、混色规则、深色目标、描边条件和回退路径不同。

用户所说“系统卡片更黑”有明确的参数依据：普通通知深色分支采用 `LUMINOSITY(#CC262626)` 和 `OVERLAY(#66383838)`，还组合独立的面板配方。桌面文件夹的正常深色路径则是 `MIX(#33999999) → OVERLAY(#A3737373)`，没有同一组压低亮度的通知参数。

因此，通知深色材质可以解释系统卡片的深色倾向，却不能直接证明文件夹也应增加同样的黑色层。文件夹真机比 DesktopGo 更黑的具体原因，仍需识别该设备实际走的是模糊、普通背景、主题图标还是其他能力分支。

| 对象          | 浅色/通常处理                                     | 深色处理与区别                                                                                 |
| ------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 普通应用图标  | 每个应用/主题自己的前景与底图                     | 符合条件的暗色重绘使用 `#FF383838 → #FF151515`；NightShadow 主题使用 `#FF0F0F0F`，不是壁纸模糊 |
| 桌面文件夹    | 按壁纸亮度选 MIX + DODGE_BG                       | MIX + OVERLAY，继续保留壁纸亮度和颜色；无模糊时另有约30%黑色背景                               |
| 普通手机 Dock | 约30%白色或约12%黑色底色                          | 约12%黑色，且有自己的白色描边；大屏完整模糊另走能力分支                                        |
| 普通通知卡片  | 面板 + 卡片四步，卡片 LUMINOSITY 目标 `#CCCCCC`   | 卡片 LUMINOSITY 目标 `#262626`，结合深灰 OVERLAY，明暗更受控                                   |
| QS 未激活磁贴 | 局部 LUMINOSITY `#4D8C8C8C` + OVERLAY `#80B2B2B2` | 局部 LUMINOSITY `#66262626` + OVERLAY `#66383838`，另组合面板配方                              |
| COUI 普通卡片 | 白卡片配 `#F0F1F2` 页面                           | 黑色页面上约10.2%白色卡片，合成约 `#1A1A1A`；普通浮起表面 `#1E1E1E`                            |

普通应用图标暗色重绘还要求特定图标样式、图标暗色开关和系统 dark 同时满足；NightShadow 是另一个图标主题，不能当成系统夜间模式的通称。QS 的部分 FluidGlass 分支直接绑定带高光的 WebP 背景，和平台模糊 shader 分支也应分开。条件、资源和源码行号详见两个分项报告。

## 1. 桌面文件夹的正常模糊与普通背景

`BlurMaterialColor` 和文件夹构造链已核实以下参数。模糊参数为厂商 API 的 `800`，单位未证明，不能直接写作 800 CSS px。

| 文件夹状态         | 第一步                     | 第二步                         |
| ------------------ | -------------------------- | ------------------------------ |
| 浅色，普通壁纸     | MIX：`#3D2E3033`，约 23.9% | DODGE_BG：`#FF37393E`，100%    |
| 浅色，亮壁纸       | MIX：`#1A000000`，约 10.2% | 第二层 alpha 为 0，不改变颜色  |
| 深色，两类壁纸相同 | MIX：`#33999999`，20%      | OVERLAY：`#A3737373`，约 63.9% |

普通/回退背景另有浅色 `#66A6A6A6`、`#66E0E0E0`，夜间 `#4C000000`。**这些不是必须叠在上述完整材质上的额外底色。**正常材质状态的 `LayerBlurDrawable` 使用 blur alpha 1、default alpha 0。

Launcher 的 Java/AGSL 链可见：服务返回模糊图，本地 shader 混色；启用本地 shader 时，发送服务的混色参数会被清零，避免重复混色。正常路径会调用 shader，不应将这段代码描述为只用于 fallback。

这一文件夹深色公式会抬起极暗通道，而非无条件压黑。以无蒙版、均匀输入、仅计算已提取颜色公式为前提：黑色输入输出约 `#1D1D1D`，`#808080` 输出约 `#7D7D7D`，`#096692` 输出约 `#23698D`。这些是数学示例，不是手机测色。

作为不同分支的对照，单独将普通背景 `#4C000000` 合成到 `#096692`，得到约 `#064866`；这确实更黑，但不能由此宣布用户设备正在走该分支。

边缘高光属于条件分支。没有找到证据支持在每个文件夹中固定添加整面“上白下黑”渐变或常驻明显边框。完整路径与普通图标夜间重绘见桌面分项报告。

## 2. 普通通知卡片：四步 shader 参数链

新增调查超出了旧 `systemui-findings.md` 中只列 `notification_material_blur_bg` 的摘要。

入口是 `ViewBlurManager.getMixConfig`，普通通知使用 `MixColorWithShader`，再由 `panelElementPlatformMixWithShaderConfig` 组合面板背景。`ShaderBlendParamHelper.updateMixMultiShaderParams` 生成的列表顺序是：

1. 面板 top 参数。
2. 面板 bottom 参数。
3. 卡片 top 参数。
4. 卡片 bottom 参数。

这里的 top/bottom 是颜色层的字段名，**不是控件的上半部与下半部**。参数里没有纵向渐变坐标。

| 顺序        | 浅色模式                          | 深色模式                          |
| ----------- | --------------------------------- | --------------------------------- |
| 面板 top    | LUMINOSITY：`#99333333`，60%      | LUMINOSITY：`#A6404040`，约 65.1% |
| 面板 bottom | OVERLAY：`#80999999`，约 50.2%    | OVERLAY：`#80999999`，约 50.2%    |
| 卡片 top    | LUMINOSITY：`#B3CCCCCC`，约 70.2% | LUMINOSITY：`#CC262626`，80%      |
| 卡片 bottom | DODGE：`#73BFBFBF`，约 45.1%      | OVERLAY：`#66383838`，40%         |

SystemUI 自己的 `ShaderBlendParam.getModeString` 确认：2=OVERLAY、4=DODGE、5=LUMINOSITY。不要把这些编号与旧 `MixColor` 材质模式编号混用。LUMINOSITY 的用途是调整亮度并尽量保持背景色相关系；它不等价于按 alpha 普通覆盖同色灰。

这套深色配方具有明显的深炭灰亮度目标。它与文件夹先混入 20% 中灰再 OVERLAY 的行为不同，不能仅用“都是 blur + 灰色”归为同一材质。

进一步从 **SystemUI 自身 APK** 提取到了 `DrawableShader` 与 `BlurDrawableShaderBlendStringKt`，不是借用 Launcher 的公式。后者的 `appendBlendMainMethodString` 按参数数组顺序迭代；LUMINOSITY 使用 `(0.3, 0.59, 0.11)` 的亮度权重及越界压缩，OVERLAY 再按各通道计算。以下只计算所选四步配方：输入是假定已经模糊、即将进入 shader 的均匀不透明 RGB，`blurAmount=1`；不含其他混色参数、可选描边、后续合成或显示色彩管理：

| 输入      | Launcher 深色文件夹两步公式 | SystemUI 深色普通通知四步公式 |
| --------- | --------------------------- | ----------------------------- |
| `#000000` | `#1D1D1D`                   | 约 `#1F1F1F`                  |
| `#808080` | `#7D7D7D`                   | 约 `#262626`                  |
| `#FFFFFF` | `#E9E9E9`                   | 约 `#2E2E2E`                  |
| `#096692` | `#23698D`                   | 约 `#012F44`                  |

这是公式说明，不是像素回归或真机测色。它揭示了重要区别：通知配方能把中性背景很宽的亮度范围收敛到深炭灰，彩色背景仍可保留深色偏色；文件夹配方仍保留很大的背景亮度变化。不能用一个固定 `background-color` 或把模糊半径加大来替代这种差异。

面板两项 alpha 会随 `blurAmount` 改变，卡片两项保持各自参数；模糊强度也乘 `blurAmount`。最大配置读取 `blur_radius_platform_config=450`。这些说明展开/收起过程也会改变材质，不宜将过渡帧当作固定终态。

`PlatformBlurDrawable.applyBlurConfig` 先清空普通 mask，再显式启用 shader、传入列表。因此在这条完整 shader 路径中，不能再把 `#CC333333` 额外叠一遍。

证据：

- [ViewBlurManager：普通通知配方](evidence/systemui.md#source-023)，构造和初始化在 576、1267 行。
- [面板配方和组合](evidence/systemui.md#source-026)，组合在 78 行。
- [通知浅色资源](evidence/systemui.md#source-014)、[深色资源](evidence/systemui.md#source-013)。
- [shader 参数顺序](evidence/systemui.md#source-059)。
- [SystemUI 模式编号](evidence/systemui.md#source-045)。
- [SystemUI 自身公式与顺序迭代](evidence/systemui.md#source-056)，循环在 50 行。
- [应用参数并清空 mask](evidence/systemui.md#source-028)。

## 3. 通知的其他状态不是同一层透明度

### 锁屏堆叠

`KeyguardStackingBlurConfig` 单独配置两层堆叠卡片。浅色堆叠背景参数置空，深色堆叠保留面板配方；没有简单将同一背景整体降低透明度。

| 卡片层级   | 浅色 top / bottom         | 深色 top / bottom         |
| ---------- | ------------------------- | ------------------------- |
| 正常卡片   | `#B3CCCCCC` / `#73BFBFBF` | `#CC262626` / `#66383838` |
| 第一堆叠层 | `#99999999` / `#73BFBFBF` | `#99262626` / `#66383838` |
| 第二堆叠层 | `#5E737373` / `#73BFBFBF` | `#66404040` / `#66383838` |

来源：[KeyguardStackingBlurConfig](evidence/systemui.md#source-025)；色值来自上述 values/values-night 资源。

### 悬浮通知、低高斯与回退

悬浮通知另用 motion blur：浅色 top `#B2A8A8A8`、bottom `#FF333333`；深色 top `#B3262626`、bottom `#FF808080`。这里进入的是旧 `MixColor` 和 framework `BackgroundBlurDrawable`/`OplusBlurParam` 路径，不将旧 mode 4/5 按 shader mode 4/5 解读。

低高斯分支也有独立参数，部分路径增加由壁纸主色计算的 Material3 颜色。`ViewBlurManager.access$updateColorValues` 为卡片请求的 tone 参数是日间 95、夜间 30，为按钮请求日间 70、夜间 40；这些是配色输入，不能解读为百分比灰度。

`notification_material_blur_bg` 的浅色 `#CCFFFFFF`、深色 `#CC333333` 确实存在：静态模糊路径使用它作为 mask；motion 路径在没有专门混色配置时使用它；完整 platform shader 路径不必再叠该色。旧报告中的数值没有错，但不足以描述普通通知的全部实际绘制链。

设备动画档位、第三方主题、超级省电、系统是否禁用高斯模糊都会影响分支。`decideBlurType` 明确可选择普通 drawable、壁纸混合或 platform blur；悬浮通知也受高/中高斯能力条件限制。

证据：

- [motion / static 参数消费](evidence/systemui.md#source-029)，静态 mask 在 382 行附近。
- [悬浮通知模式](evidence/systemui.md#source-023)。
- [动态配色](evidence/systemui.md#source-023)、[能力分支](evidence/systemui.md#source-023)。

### 边缘高光

通知具有独立 `BlurStroke`，构造近/远两组线参数，alpha 上限约 0.4/0.2，并随绑定状态调整。`NotificationEffectRepository` 读取 `system_material_stroke_enable`，未设时默认 0；普通 drawable 分支还会禁止相应能力。因此只能说“支持条件式边缘高光”，不能说每张通知都常驻清晰白边。

来源：[BlurStroke](evidence/systemui.md#source-024)、[设置与条件](evidence/systemui.md#source-027)。

## 4. 与当前 DesktopGo 柔雾的对应关系

本轮只读了现状，没有修改：

- `folderMaterialColor.ts` 采用 Launcher 文件夹的 MIX → DODGE_BG/OVERLAY 公式；它不是通知的四步 LUMINOSITY 链。
- 当前深色 `applyFolderMaterialVeil` 直接返回，没有额外灰层；CSS 深色 `--folder-material-shading: none`，也没有固定纵向明暗层。仍觉得不够黑，不能再归因于已经移除的灰层或渐变。
- 当前浅色仍有 DesktopGo 自加的 RGB224、18% 中性层，以及顶部白色7%、底部黑色5.5%的渐变。这些没有被证实属于 Launcher 原生文件夹参数。
- 当前使用最长边1024的共享 Canvas 壁纸纹理与32 CSS px模糊；这些是适配值，不能等同 Android BlurService 的输入、内核、取样区域和设备显示结果。
- 文件夹、Dock、搜索共用材质是 DesktopGo 的产品选择；原生普通手机 Dock、浏览器提供的搜索小组件与文件夹并非自动采用同一原生材质。

对应位置：[颜色转换](evidence/desktopgo.md#source-060)、[浅色附加层](evidence/desktopgo.md#source-060)、[纹理生成](evidence/desktopgo.md#source-061)、[CSS 明暗层](evidence/desktopgo.md#source-062)。

后续若继续实现，应先明确目标是“Launcher 文件夹正常模糊分支”还是“通知式深色卡片观感”，再确定配方。直接继续加黑色透明层会构成新的 DesktopGo 调整，不能标为本轮提取到的 ColorOS 文件夹原生规则。

## 5. 覆盖与尚未证明的部分

已回答：桌面文件夹日夜参数、普通背景与模糊状态区别；普通图标与文件夹类别区别；通知普通/堆叠/悬浮/低高斯参数和选择条件；QS/COUI 的材质区别；条件式描边；当前 DesktopGo 使用哪类配方及哪些层是自加的。

部分回答：SystemUI shader 参数已追到其自身 `DrawableShader`、参数顺序与 AGSL 混色公式；厂商模糊服务的实际取样、native实现和设备运行态仍未观察。已读取的本地 shader 不代表所有低能力、motion、主题分支都使用同一后端。

未证明：用户手机当前活跃主题/图标包、动画能力档位、描边开关、模糊后端实际状态、壁纸服务输入、全部运行态 overlay 合并结果、屏幕色彩管理。因此本轮不能宣布真机视觉已与 DesktopGo 一致，也不能把“更黑”唯一归因为 gamma、缺失蒙版或某个 fallback。

新增 `focused/notification-material-20261111` 反编译报告11处警告、`focused/notification-pipeline-20261111` 报告7处警告，涉及未知Android类型、重复代码等；`NotificationBackgroundViewExtImp.draw` 出现可疑空值条件及未初始化局部变量，不用它作为完整运行分支的可靠还原依据。本文普通通知配方的主证据来自结构完整的 `getMixConfig`、参数helper、资源和 `PlatformBlurDrawable.applyBlurConfig`。新增输出未执行APK。

所有分析命令完成即退出，没有启动服务或监听端口。未改产品代码，因此未运行产品测试；静态调查结果不作为视觉测试通过的证明。
