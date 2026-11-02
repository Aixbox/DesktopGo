# ColorOS 大图标取色、纹理合成与 DesktopGo 对比

分析日期：2026-11-02。目标：本机 `OplusLauncher.apk` 17.3.12。本文依据 REA/JADX 静态反编译、APK 内的原始 PNG 数据和必要的 DEX 指令核对；未运行 Launcher、模拟器或 DesktopGo，未使用截图测试。

## 1. 核心结论

ColorOS 普通应用大图标的兜底背景由 **尺寸对应的二维灰度纹理 + 178/255 不透明度的主色覆盖层** 合成，随后叠加居中的应用图标。这解释了背景中柔和的明暗变化。

这条兜底链不是单层纯色，也不是把原图模糊后铺满背景。明暗分布已保存在 APK 的三张 PNG 中，并非根据每个应用重新生成。主色决定色调，底图保留约 30.2% 的空间亮度变化。

但不能将此结论推广到所有大图标：专用大图标素材、用户选择的图标包、第三方主题、单色主题以及深色重绘有独立分支。其中确实存在使用 `GradientDrawable` 生成线性渐变的分支，也存在完全不透明的纯色背景。

改造前的 DesktopGo 只有一个主色填充层，没有这三张纹理及对应的合成步骤；取色算法也与 ColorOS 不同。2026-11-02 已按普通兜底路径完成颜色改造，具体实现、验证与兼容差异见第 11 节。

## 2. 分析对象与可复查证据

| 项目               | 值                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| APK                | `D:/Project/other/ColorOS-AVD/work/rom-root/system_ext/priv-app/OplusLauncher/OplusLauncher.apk` |
| 包名 / 版本        | `com.android.launcher` / `17.3.12`，versionCode `170030012`                                      |
| APK SHA-256        | `4a91e6e1e25efd0486095a658ca71ecf8e5cd50422232e02d35ee93f3decf828`                               |
| 工具               | REA CLI `6.8.0`，JADX headless MCP JAR `0.7.1`，Java `24.0.2`                                    |
| 包内规模           | 19,803 个顶层类，5,862 个资源条目                                                                |
| 本轮 REA 输出      | 56 份完整 Evidence JSON，另存已获取的方法源码                                                    |
| DesktopGo 对比版本 | `3889dd1be04c0285f73a10a6e008bf2c23d60dae`                                                       |

本次会话未连接 REA MCP，使用已安装的公开 REA CLI 完成分析，没有修改客户端注册配置。

证据目录：`D:/Project/other/ColorOS-AVD/work/rea-large-icon-20261102`。

- [完整证据索引](D:/Project/other/ColorOS-AVD/work/rea-large-icon-20261102/evidence-index.json)：记录每份 Evidence 的 ID、参数、APK 哈希和源码可用状态。
- [纹理数据统计](D:/Project/other/ColorOS-AVD/work/rea-large-icon-20261102/texture-analysis.json)：直接解析 APK 内 PNG，记录尺寸、灰度范围、二维采样和文件哈希。
- [DEX 算术核对](D:/Project/other/ColorOS-AVD/work/rea-large-icon-20261102/dominant-color-dex-arithmetic.txt)：补充验证 JADX 易混淆的浮点除法和邻域循环。
- 目录中的 `query.ps1`、`analyze-textures.py`、`dex-math.py` 保存取证步骤。PNG 和 DEX 解析属于普通工具的补充静态证据，不冒充 REA Evidence。

## 3. 从大图标加载到兜底背景的调用链

已定位的关键链路如下，符号 `vr.m` 和 `vr.b` 是此 APK 中的混淆类名，方法职责来自方法体和日志字符串。

```text
vr.m.n0(context, morphIconInfo)      // loadMorphUxIcon
  ├─ 按主题、图标包、编辑状态选择专用素材 loader
  └─ 普通应用专用素材未得到结果
       vr.m.s(context, info)       // createMorphCoverup
         ├─ D → k → j             // 取得图标、压缩、透明边缘处理
         ├─ vr.m.q(...)           // createCoverupBgDrawable
         │    ├─ 选择 ux_icon_mt_layer_<span>.png
         │    ├─ 缩放纹理并画入 ARGB_8888 bitmap
         │    ├─ vr.m.l(drawable)  // compressBeforeGetColor
         │    ├─ vr.b.a(bitmap)    // getDominantColor
         │    └─ drawColor(0xB2000000 | (color & 0x00FFFFFF))
         ├─ 生成居中的前景 bitmap
         └─ q.b → q.a → UxMorphAdaptiveIconDrawable
              先画背景，再画前景，统一按外形路径裁剪
```

`vr.m.D` 优先读取 Activity 图标，其次 Application 图标，最后使用传入的备用 bitmap。通用兜底并不意味着只读取 Android AdaptiveIconDrawable 的背景层；此处传入取色的是已绘制的图标 drawable。

`vr.m.s` 将前景与背景分开生成。其布局常量包含长条尺寸短边的 `0.74`、2×2 尺寸高度的 `0.49`，之后居中绘制；这与 DesktopGo 将原图 `object-contain` 到整个表面不同。该方法的 JADX 输出有重复控制流，本文只将这两个常量和独立前景合成作为静态观察，不将其描述为所有主题、设备的最终屏幕尺寸。

## 4. 明暗变化的真正来源：三张灰度 PNG

`vr.m.q` 明确按跨度选择下列资源，然后缩放到 `vr.m.P(iconFormat)` 给出的实际目标尺寸。

| 桌面跨度 | APK 成员                                           | 原始像素尺寸 | 灰度范围 | 不同灰度值数量 |
| -------- | -------------------------------------------------- | ------------ | -------- | -------------- |
| 1×2      | `res/drawable-xxxhdpi-v4/ux_icon_mt_layer_1x2.png` | 240×820      | 166–255  | 90             |
| 2×1      | `res/drawable-xxxhdpi-v4/ux_icon_mt_layer_2x1.png` | 820×240      | 166–248  | 83             |
| 2×2      | `res/drawable-xxxhdpi-v4/ux_icon_mt_layer_2x2.png` | 704×704      | 166–255  | 90             |

三张资源均为 **8-bit、不透明灰度 PNG**，不是带透明度的高光遮罩。PNG 原始尺寸也不是桌面最终显示尺寸。

`vr.m.P` 优先采用 `iconFormat` 的有效宽高；没有有效值时，三种跨度分别回退到 `108×288`、`288×108`、`288×288` 的内部画布尺寸。该回退值由 `q.<clinit>` 的 smali 直接证实，不能当作固定 dp 或实际设备像素。

以下是 2×2 资源在横纵 0%、25%、50%、75%、100% 位置的灰度采样，行代表从上到下，列代表从左到右：

| Y / X |  0% | 25% | 50% | 75% | 100% |
| ----- | --: | --: | --: | --: | ---: |
| 0%    | 220 | 253 | 242 | 192 |  166 |
| 25%   | 212 | 246 | 234 | 188 |  166 |
| 50%   | 180 | 199 | 194 | 173 |  166 |
| 75%   | 166 | 177 | 194 | 190 |  170 |
| 100%  | 167 | 188 | 220 | 212 |  177 |

同一行有多个灰度值，中间列也会先暗后亮，所以不能准确等价为一个普通的上下线性渐变。三种跨度各有底图，也不能假设 1×2 与 2×1 是同一纹理简单旋转。

资源 SHA-256：

```text
1x2 60e6dacc74a7bba70ce404f3d71113fbdb869b4f5b87d79fc58f1e96d32cea32
2x1 a2783fe013876cbdaa5cf1b9377a67ca5ae088b5caaaec6c842d5c9bf854a908
2x2 9b6f64432e7ae29df81548a62839023714cd0145c165b1ddec05370b701f7dd8
```

## 5. 主色怎样与底图合成

`vr.m.q` 先画纹理，随后执行：

```java
int primaryColor = b.a(l(drawable));
int alphaFgColor = (primaryColor & 0x00FFFFFF) | 0xB2000000;
canvas.drawColor(alphaFgColor);
```

反编译中的有符号常量 `-1308622848` 对应 `0xB2000000`。Alpha 是 `178 / 255 ≈ 69.804%`，不是精确的 70%。

按默认 source-over 合成关系，每个颜色通道可近似写为：

```text
背景(x, y) ≈ (178/255) × 主色 + (77/255) × 纹理灰度(x, y)
```

底图完全不透明，因此合成后的背景也完全不透明。不能把这一过程实现为“整个图标 opacity=0.7”；那会透出壁纸，而 ColorOS 此处透出的内容是灰度纹理。

以 1×2 / 2×2 的灰度范围举例，忽略整数舍入和缩放插值差异：

| 提取的主色 | 合成结果的大致范围        | 解释                                           |
| ---------- | ------------------------- | ---------------------------------------------- |
| `#000000`  | `#323232` 至 `#4D4D4D`    | 普通兜底分支得到带明暗变化的深灰，而非整块纯黑 |
| `#FFFFFF`  | `#E4E4E4` 至 `#FFFFFF`    | 白色仍能保留柔和的阴影层次                     |
| `#FF0000`  | 约 `#E43232` 至 `#FF4D4D` | 保持红色倾向，同时产生亮度变化并降低饱和度     |

这不是 HSV 调色造成的最终色差；此处的最终调色来自灰度底图与半透明主色的叠加。HSV 类饱和度计算用于下面的主色选择评分。

## 6. ColorOS 的主色算法

### 6.1 采样

`vr.m.l` 先将 drawable 绘制到 bitmap；超过 60px 的输入会缩小，目标最大边为 60px，已小于等于 60×60 的输入直接使用。它不同于改造前 DesktopGo 的 32px 采样。

### 6.2 排除局部颜色变化大的像素

`vr.b.a` 对每个 alpha 非零的像素，检查 X/Y 偏移 `-3…3` 的邻域，即 7×7 范围：

- 跳过中心像素、越界邻点、完全透明邻点。
- 两点 RGB 距离平方 `< 1936`（即距离 `< 44`）时记为相似。
- 有效邻点数非零且相似比例 `< 0.85` 时，不让中心像素参与取色。
- 没有有效邻点时不会仅因此剔除中心像素。

这会降低颜色边界、细碎细节对取色结果的影响。这里只检查局部邻域，并没有分析整张图的连通区域或做语义前景分割。

### 6.3 粗量化、饱和度与评分

保留像素的 RGB 每通道按 64 为步长分桶：`floor(channel / 64) × 64`，每通道 4 档，最多 64 个颜色桶。每桶累计实际 RGB、像素数和饱和度。

```text
S(pixel) = maxRGB > 0 ? (maxRGB - minRGB) / maxRGB : 0
score(bucket) = (1 + 0.15 × averageS) × ln(pixelCount + 1)
```

选择得分最高的桶，输出桶内实际 RGB 的算术平均，转整数时取整截断。不是直接输出量化桶的 0/64/128/192 色值，也不是只选像素数量最多的桶。相同数量下，饱和度高的桶会得到最多 15% 的额外权重。

此处 alpha 非零像素按数量参与，未采用 DesktopGo 的 alpha 加权。黑、白、灰色没有被统一排除。

`bitmap` 为 null 或已回收时返回黑色；没有有效获胜桶或计算异常时，代码使用 `WallpaperColors.fromBitmap(bitmap).getPrimaryColor().toArgb()` 回退。这里处理的是传入的图标 bitmap，并不表示读取当前桌面壁纸来配色。

### 6.4 反编译误差核对

JADX 在饱和度处显示的 `(iMax - iMin) / iMax` 看起来像整数除法，邻域循环也有重复代码。直接照抄这段 Java 会产生错误。

已用 APK `classes7.dex` 的原始指令补充核对 `Lvr/b;->a(Landroid/graphics/Bitmap;)I`：

- `code_item` 文件偏移 `0xc0c74`。
- 指令 code-unit 偏移 `0x016b/0x016c` 是 `int-to-float`，`0x016d` 是 `div-float/2addr`：饱和度确实按浮点计算。
- `0x00f2…0x00f5` 验证邻域相似比例使用浮点除法和 `0.85f`。
- `0x01c5` 常量是 `0.15f`；`0x01ca` 调用 `androidx.compose.ui.platform.j0.a(FFFF)F`。
- REA 对该 helper 的独立反编译确认公式是 `((a × b) + c) × d`，据此还原上述评分公式。

上述 DEX SHA-256 为 `23360828ad95937ce7754ff4518042b223dc135a0a308c2bb6549ff712de9091`。这份补充证据避免把 decompiler 的类型展示误差当成实际算法。

## 7. 不同主题和素材分支

### 7.1 普通兜底背景 `vr.m.q`

此函数总是先尝试绘制尺寸对应的灰度底图，再按下表顺序覆盖颜色：

| 判断                                                            | 覆盖颜色                    | 对纹理的影响                              |
| --------------------------------------------------------------- | --------------------------- | ----------------------------------------- |
| `m0`：theme=3 且默认主题条件成立                                | `G(context, iconConfig)[0]` | 采用主题色；此函数不统一改为 `0xB2` alpha |
| `j0`：theme=7 且默认主题条件成立                                | 不透明 `#0F0F0F`            | 完全遮住纹理                              |
| `l0`：theme=2、启用 darkModeIcon，且 alwaysNight 或夜间条件成立 | 不透明 `#151515`            | 完全遮住纹理                              |
| 其余普通分支                                                    | `0xB2` alpha 的图标主色     | 保留约 30.2% 灰度纹理                     |

因此不能声称“ColorOS 所有深色大图标都按主色渐变”。

### 7.2 专用素材与真正的线性渐变

`vr.m.n0` 还会按配置选择以下 loader：

- `morphicon.g`：用户编辑选中的图标包资源，读取 `<drawable>_<spanX>x<spanY>`。
- `morphicon.j`：图标包映射与对应跨度资源。
- `morphicon.t`：第三方主题的专用图标，或 `morph_bg_<spanX>x<spanY>.png` 通用主题背景。
- `morphicon.n`：单色图标素材和主题颜色。
- `morphicon.e / r`：内置/本地素材以及下载素材的等待、重试分支。

这些分支可能直接使用设计好的彩色图片，本来就包含渐变和高光，不能把这类效果归因于主色算法。

内置素材 loader `morphicon.e.a → e.b` 的深色重绘明确调用 `vr.m.n`，传入 `#383838` 和 `#151515`。`vr.m.n` 设置 `GradientDrawable` 的 `gradientType=0`，两色以上调用 `setColors`，单色调用 `setColor`。此处确实是线性渐变；该函数没有显式设置方向，本文不把默认方向猜测成 APK 中固定的自定义角度。

`n0` 的功能大图标分支也可使用深色渐变、`#0F0F0F`、`#262C40 → #181C29`、`#F5F6F7` 或专用背景素材。这些属于相邻分支，不与普通 `createMorphCoverup → q` 混为同一套规则。

## 8. 与 DesktopGo 改造前实现的区别

| 环节     | ColorOS 普通兜底路径                                       | DesktopGo 改造前实现                       |
| -------- | ---------------------------------------------------------- | ------------------------------------------ |
| 输入     | 系统 Activity/Application drawable，含压缩和透明边缘处理链 | 已获取的 `icon_base64` 扁平图像            |
| 取色采样 | 最大边目标 60px                                            | 最大边 32px                                |
| 透明过滤 | 排除 alpha=0；保留像素不按 alpha 加权                      | 排除 alpha<32，其余按 alpha 加权           |
| 空间信息 | 7×7 邻域、距离平方<1936、相似比例≥0.85                     | 不检查邻域，直接累计整图颜色               |
| 分桶     | 每通道 4 档，最多 64 桶                                    | 每通道 16 档，最多 4096 桶                 |
| 获胜评分 | `ln(n+1) × (1+0.15×平均饱和度)`                            | alpha 总权重最大                           |
| 输出主色 | 桶内实际 RGB 算术平均                                      | 桶内 RGB 的 alpha 加权平均                 |
| 背景     | 三种跨度各有灰度纹理，再叠 `178/255` 主色                  | 一个 `backgroundColor` span                |
| 黑色效果 | 普通分支会混出深灰明暗层次                                 | 主色为黑且 opacity=1 时整块纯黑            |
| 原图大小 | 前景独立缩放、居中合成                                     | `object-contain` 填入整个图标表面          |
| 主题分支 | 专用素材、单色、深色重绘、夜色等分别处理                   | 提取色不随主题调整，底层玻璃材质随主题改变 |
| 透明度   | 取色层 alpha 是纹理合成参数，合成背景仍不透明              | 填色层和前景图分别应用用户图标透明度       |

下列路径为改造前对应模块；文件内容现已更新，旧行为以对比版本 `3889dd1be04c0285f73a10a6e008bf2c23d60dae` 为准：

- [iconDominantColor.ts](D:/Project/SelfProject/DesktopGo/src/components/icon-grid/domain/iconDominantColor.ts:2)：透明过滤、RGB 高 4 bit 分桶、alpha 加权。
- [iconColor.ts](D:/Project/SelfProject/DesktopGo/src/components/icon-grid/services/iconColor.ts:3)：32px 采样、128 项缓存、10 秒超时和失败重试。
- [IconArtwork.tsx](D:/Project/SelfProject/DesktopGo/src/components/icon-grid/views/IconArtwork.tsx:19)：主色 span 与 `object-contain` 前景。
- [IconGhostArtwork.tsx](D:/Project/SelfProject/DesktopGo/src/components/icon-grid/views/IconGhostArtwork.tsx:27)：拖拽预览复用同一 artwork。
- [folderVisualPolicy.ts](D:/Project/SelfProject/DesktopGo/src/components/icon-grid/views/folderVisualPolicy.ts:26)：底层玻璃表面；它不能替代图标内部的纹理合成。

## 9. 可采用的优化方案

以下是研究阶段提出的方案。已根据后续授权实施，最终采用 CSS 背景分层完成等价 source-over 合成，见第 11 节。

建议按以下顺序实施：

1. **先补背景合成。** 按 1×2、2×1、2×2 准备各自的二维灰度纹理，在离屏 canvas 中先画纹理，再以 `178/255` alpha 叠主色；保持合成结果不透明。这一步直接对应用户感知的色差。
2. **再调整取色。** 将空间邻域过滤、64 桶、饱和度评分做成独立的纯函数；输入必须带宽高，当前只接收 RGBA 数组的接口不足以表达邻域。对异常和没有候选的情况保留明确回退。
3. **保持清晰前景。** 前景与背景分别缩放，统一由外壳裁剪。若参考 ColorOS 的居中小前景，需要作为额外显示变更处理，不能只改取色时顺手改变图标大小。
4. **复用现有异步和缓存。** 取色结果按图像缓存；合成背景按图像、跨度、主题分支和纹理版本缓存。桌面、拖拽和落位预览继续共用 `IconArtwork`，避免各自生成不同背景。
5. **区分两种 alpha。** `178/255` 仅控制主色与纹理的内部混合；用户设置的图标透明度应用到完成的图标层，避免把底色意外变成壁纸透色。

直接增加一个 `linear-gradient(主色, 浅色)` 只能近似部分感觉，不能重现本次查明的二维纹理分布。若选择自行生成纹理，需要按三个跨度分别设计亮度分布，并明确这是 DesktopGo 的实现选择，不声称与 APK 资源完全一致。

## 10. 核心 REA Evidence 索引与边界

| 用途                                        | Evidence ID                                                           |
| ------------------------------------------- | --------------------------------------------------------------------- |
| 包身份                                      | `ev_e998d9ea10513aca967c2e5a9b1404e74b3f6d72f38f95bfec152d2007865c2f` |
| 普通背景 `vr.m.q`                           | `ev_a60a5033a0ea93e8a74af72f6498d6363202420f42338db059ea29ae4a9cb95b` |
| 取色 `vr.b.a`                               | `ev_c8a8df3a52433afbbb7960c103fe9be51a8ff4e55aa3ee09a57e38dee98ecb79` |
| 60px 采样 `vr.m.l`                          | `ev_038d895591f4282c7ee12688f4569e869f8cb660b29b623682455661cf73174e` |
| 评分 helper `j0.a`                          | `ev_26c4751eacb8842c6af8e508b3efa0867b6b1e1ec05a24a403f5d96d64e69302` |
| 普通兜底组装 `vr.m.s`                       | `ev_b556f01de2ffd14870e62053558f22270dbda54d43ea0c2139dc56eba9b6d26a` |
| loader 分派 `vr.m.n0`                       | `ev_07163bb2217444a600872a83f2a2d6c75a7c86357f6b66c68323d1a7eadc4f56` |
| 渐变构造 `vr.m.n`                           | `ev_2e864ce2b3a0a9b651474474d8aee3436dc2659c9cd69574d3722d212c3574d1` |
| 内置素材与主题分支 `e.a`                    | `ev_5b7aab20162d0bce161cf14e93b83ea3f82b521392ce137e02d3ef51c845ab30` |
| 深色背景生成 `e.b`                          | `ev_fff6c0ee3f81c9d6d3cd48a24dc3769fedc53d4180b3b33cfa56499d0d1943c1` |
| 最终绘制 `UxMorphAdaptiveIconDrawable.draw` | `ev_d509133010a7f7d570dfbbc351aeb77d4fe4cf1c020dcb0ac819013a45b6540d` |
| 默认画布参数 `q.<clinit>`                   | `ev_93d95ff3d159807088ce32bc1463fbdc310f85016943757a65193fa7d46c39a6` |

本次问题的证据状态：

- 已回答：普通大图标色差来源、资源尺寸和灰度范围、覆盖 alpha、取色阈值和评分、主题相关的主要不同处理、与当前项目的差异。
- 静态推导：黑色/白色/红色合成范围。实际屏幕还受缩放插值、整数舍入、色彩管理和设备显示影响。
- 尚未观察：用户手机上具体某个应用当前选中的 loader、下载素材、主题开关与显示输出。没有设备运行时证据，不能断言每一个手机图标都走上述兜底路径。
- JADX 的复杂方法存在重复控制流和类型展示误差；取色核心数学已补充核对 DEX，其余主题加载细节不宣称逐条动态验证。
- 研究阶段的验证范围为证据身份、文件完整性、PNG 数据解析和反编译/DEX 交叉核对；后续实现的测试和构建记录见第 11 节。

## 11. DesktopGo 初版实施记录（历史方案，当前实现见第 12 节）

本次实现对应 **普通应用大图标的兜底颜色处理**。1×2、2×1、2×2 共用同一取色策略，各自采用对应纹理。

### 11.1 已完成

- [x] `iconColor.ts` 将最大采样边改为 60px；小图不放大，保留宽高比例。
- [x] `iconDominantColor.ts` 接收带宽高的 RGBA 数据，实现 7×7 邻域、距离平方严格小于 1936、相似比例至少 0.85 的筛选。
- [x] 只排除 alpha=0，不再按 alpha 加权；使用 64 个 RGB 桶、饱和度加权的对数评分、获胜桶实际 RGB 的平均值并截断整数。
- [x] 三张 APK 原始纹理收录于 `src/assets/coloros-large-icons/`，哈希与第 4 节完全一致；同目录 README 记录来源。
- [x] 新增 `iconColorFill.ts`，仅负责按跨度选择底图和生成背景样式。纹理按整个表面尺寸拉伸，叠加 `0xB2` 主色；黑色、白色等中性色也保留二维明暗变化。
- [x] 桌面、拖拽及落位预览继续复用 `IconArtwork`，显式传入网格跨度，保证选择相同底图。
- [x] 保留按源图像共享的 128 项取色缓存、请求去重、10 秒超时、失败重试和过期异步结果丢弃。切换尺寸只更换纹理，不重复取色。
- [x] 原图的显示尺寸、外壳圆角、右键轮廓和手柄保持既有实现；1×1、文件夹内预览及 Dock 不增加填色。

### 11.2 合成实现与性能

采用同一个背景元素的两层 CSS background：

```text
上层：linear-gradient(#RRGGBBb2, #RRGGBBb2)
下层：尺寸对应的 ux_icon_mt_layer_<span>.png
```

两个相同色标使上层成为均匀半透明色，不产生空间渐变；明暗分布全部来自灰度 PNG。这与 APK 先画不透明纹理、再以 `0xB2` alpha 画主色的 source-over 关系一致。浏览器负责纹理缩放及合成，因此不需要在每次 resize 或每个图标上生成离屏背景 bitmap，也不新增按尺寸缓存的 base64 图像。

PNG 加载完成后，背景合成本身不透明；加载前使用不透明主色兜底。现有 `--launchpad-icon-opacity` 在背景完成内部合成后生效，前景图仍按现有设置应用用户透明度。内部 `178/255` 混合参数与用户设置相互独立。

新增静态资源共 127,021 字节（约 124 KiB）；Vite 使用带哈希的独立资源文件，三个尺寸的图标复用浏览器资源缓存。

### 11.3 明确的兼容差异

1. **无候选回退**：Android 的 `WallpaperColors.fromBitmap` 不属于 Web API。若局部筛选没有留下候选，DesktopGo 在全部 alpha 非零像素上重用 64 桶和相同评分，避免直接混合不同色相。全透明、无效数据或解码失败仍返回空结果，保留原有表面。这是本项目的回退选择，不声称与 Android 的回退完全相同。
2. **平分与数值精度**：相同得分时保留先遇到的桶，计算使用 JavaScript 浮点；未模拟 Android HashMap 的遍历顺序、全部 float32 舍入和图像缩放插值细节。
3. **输入与前景**：仍读取现有 `icon_base64`，没有复制 Android Activity/Application drawable 的获取和透明边缘处理链；本次只修改颜色，不引入 0.74 / 0.49 的前景缩放规则。
4. **主题**：没有将 DesktopGo 的深浅色模式映射为 ColorOS 的 theme ID、darkModeIcon 或下载素材状态。专用主题素材与深色重绘不在本次普通兜底颜色实现中。

### 11.4 验证

- 聚焦测试：`node --experimental-strip-types --import ./scripts/register-ts-test-loader.mjs --test --test-reporter=spec src/components/icon-grid/domain/iconDominantColor.test.js src/components/icon-grid/services/iconColor.test.js src/components/icon-grid/views/iconColorFill.test.js src/components/icon-grid/hooks/gridItemResize.test.js src/components/icon-grid/views/folderDropGeometry.test.js`，27 项通过。
- `pnpm.cmd test`：342 项通过，0 失败。
- `pnpm.cmd build`：TypeScript 检查和 Vite 生产构建通过；三张纹理均进入构建产物。构建仍提示既有的 Browserslist 数据过期、混合静态/动态导入和较大 chunk。
- `pnpm.cmd lint`：仍有 17 个既有错误、8 个警告；错误位于 `usePagedDragLifecycle.ts`、`DockBar.tsx`、`OuterGridView.tsx`、`FocusedItemMenu.tsx`、`useFocusedItemMenu.ts`，本次未修改这些文件。
- 修改过的 TypeScript/TSX 文件单独 ESLint 检查通过；`node .codex/skills/maintain-modular-code/scripts/check-changed-files.mjs` 通过。

测试覆盖取色边界、透明处理、细碎颜色筛选、评分、无候选回退、60px 采样及不放大小图、共享缓存/淘汰/重试、异步过期结果、各尺寸纹理选择和桌面/拖拽的一致性。遵循项目约束，未启动应用或浏览器，也未使用截图验证；最终设备显示效果尚未做运行时确认。

## 12. 当前实现：柔和明暗层次，不使用灰度纹理

根据用户最新反馈，保留原来的 32px 采样和 alpha 加权取色，在 `IconArtwork` 的大图标主色填充层上增加平滑的 CSS 明暗渐变。

- 左上方径向提亮：中心位于宽度 20%、高度 0%，白色 alpha 从 14% 平滑降至 0%，渐隐终点为 70%。
- 下方向下压暗：黑色 alpha 从高度 35% 处的 0% 平滑增加到底部的 9%。
- 两层渐变覆盖整块背景，不平铺颗粒，也不加载灰度纹理图片；这是 DesktopGo 的柔和明暗处理，不是 APK 纹理复刻。
- 桌面、拖拽及落位预览共用 `IconArtwork`，继续应用现有用户透明度设置，前景图保持清晰。

验证：17 项相关测试通过；`pnpm.cmd exec tsc --noEmit`、修改文件 ESLint、文件行数检查和 `git diff --check` 均通过。未启动应用或使用截图验证。
