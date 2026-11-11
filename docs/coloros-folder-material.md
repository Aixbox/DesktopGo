# 柔雾启动台材质

> 2026-11-11 深入分析已归档至 [ColorOS 材质研究入口](research/coloros16-materials/README.md)。当前两种主题都采用模糊壁纸与半透明中性色混合：浅色罩浅灰，深色罩近黑，保留背景明暗和颜色。深色已根据“不同背景看起来都是同一灰色”的反馈移除亮度压缩与额外降饱和。原生日夜公式单独保留用于参照，当前适配参数不声称是手机的原生配方。

设置入口：设置 → 语言与外观 → 启动台材质 → 柔雾。旧设置继续使用默认玻璃。文件夹图标、Dock 栏和顶部搜索框共用同一材质设置与纹理。已有圆角、连续曲率、尺寸、内部图标和留白均保留。持久化键与取值不变，已选择柔雾的用户无需重新选择。

## 已核实的原生绘制路径

目标为 `D:/Project/other/ColorOS16/analysis/extracted/system_ext/priv-app/OplusLauncher/OplusLauncher.apk`，版本 16.6.13，SHA-256 `3b023e0211f8660988ff1cf7bb4c37129e07d3ce506e8047f8542fbfa64ba3cf`。复用了 `analysis/launcher-findings.md`、`analysis/focused/launcher`、`analysis/focused/launcher-material`，并以既有 FocusedJadx 工具追加检查以下类：

- `OplusPreviewBackground.initBlurDrawable`：文件夹创建 `LayerBlurDrawable`，读取 `getBlurColorParams`，调用 `setBlurParams(800, blendMode, blendColor, mixColor)`。
- `OplusBlurProperties.prepareBlur/setBlurParams`：普通文件夹灰色值用于 `setPlaceHolderColor`，材质参数单独传入 `BlurParam.setMaterialParams`。因此不能把普通背景 XML 当作完整材质。
- `OplusBlurProperties.toUXMode`：模式 3 为 DODGE，模式 4 为 OVERLAYER。`BlurMaterialColor` 在日间亮壁纸使用 mix `#00000000`、blend `#1A000000`；日间普通壁纸使用 mix `#FF37393E`、blend `#3D2E3033`；夜间使用 mix `#A3737373`、blend `#33999999`，以上为 Android ARGB。
- `BlurParam.setMaterialParams(mode, blendColor, mixColor)` 将 blend 存入 A、mix 存入 B；`BlurDrawableShader.mappingBgBlendParams` 在模式 3 依次执行 `MIX(A) → DODGE_BG(B)`，模式 4 执行 `MIX(A) → OVERLAY(B)`。这纠正了此前先 dodge/overlay 再普通叠色的反向顺序。
- `BlurDrawableShaderBlendStringKt` 的 DODGE_BG 是 `d / (1 - s + 1e-8)`，先按源 alpha 插值，再由输出通道裁剪；Canvas 的 color-dodge 提前裁剪，不能直接作为完全相同的实现。普通文件夹模式 3/4 不使用 `setBlurProgress` 那条动画路径里的 LUMINOSITY。
- `WallpaperResolver.resolveWorkspaceEditModeForStatic` 按整图亮度 `>= 196` 选择亮壁纸分支。`WallpaperUtil.calculateWallpaperColor` 委托 `ImageProcess.getBitmapBrightnessValue`；后者为 JNI 方法，当前未解析它的 native 亮度公式。
- `LayerBlurDrawable.refreshBlurDrawableParam`：仅在系统纹理描边开关开启且允许当前对象绘制时，调用 `setGradientStrokeLineParams`；否则明确清空描边参数。`mTempShowTextureStroke` 初始为 true，但不能据此认定某台设备常态下存在明显边框。
- `AGSLGradientStrokeParam`：默认白色描边，nearLineAlpha=0.35、farLineAlpha=0.20，沿边和向内部衰减；具体空间参数依赖尺寸、半径与原生 shader。
- 普通 XML 存在浅色 `#66A6A6A6`、`#66E0E0E0` 和夜间 `#4C000000`。这些是原生普通/回退背景的证据，不是完整材质必须再叠一层的依据；当前 DesktopGo 两种主题的回退均已另作适配。

首轮定向反编译文件保存在被 Git 忽略的 `build-script/coloros-folder-material-reference-20261111` 和 `build-script/coloros-folder-material-detail-20261111`。这些是普通 JADX 静态输出，不是 REA Evidence，也不是设备运行观察；工具提示存在未知 Android 类型及其他关联方法的结构警告。

后续颜色核对复用相同 APK（已重新核对 SHA-256），追加输出到以下被忽略目录：

- `build-script/coloros-material-shader-20261111`：`BlurParam`、`ShaderBlendParam`、`BlurDrawableShader` 与 shader 字符串。
- `build-script/coloros-material-path-20261111`：`BaseDrawable` 与 `WallpaperResolver`。
- `build-script/coloros-material-brightness-20261111`、`build-script/coloros-material-metric-20261111`：`WallpaperUtil` 与 `ImageProcess`。

REA doctor 显示当前 Codex 未注册工具、现有 JADX 可用，因此使用已有 FocusedJadx 进行普通静态分析，没有修改全局配置。关联类分析报告了一处 `LauncherBitmapManager.makeLauncherRootView` 结构错误及其他类型/结构警告；本文引用的参数映射、shader 字符串、阈值方法均有完整输出，但静态结果不代表设备实际启用的所有分支。

## DesktopGo 实现

1. `folderMaterialTexture.ts` 用 Canvas 生成共享壁纸纹理：与桌面相同的居中 cover 取景、用户背景蒙版、边缘扩展、模糊，再交给 `folderMaterialColor.ts` 执行对应主题的混色。成功输出包含壁纸的合成纹理，不在其上重复叠色。纹理最长边限制为 1024，避免每个文件夹重复解码或模糊。
2. `folderMaterialSurfaceSync.ts` 按桌面壁纸层与文件夹的实际矩形对齐背景，补偿拖拽/缩放的局部比例。支持网格各尺寸文件夹、Dock 栏、顶部搜索框、创建预览、拖拽门户以及右键菜单复制的前景；处理复制样式中的 important 值，避免浮层冻结旧背景。滚动/尺寸/主题变化触发更新，CSS 动画期间连续更新，静止时无常驻刷新循环。更换壁纸或材质会清理观察器、事件和纹理。
3. `folder-material.css` 不绘制常驻高光环、内描边或外投影，也不在 Dock 打开/创建预览时额外添加白色边框。保留透明边框占位，不修改任何圆角和几何参数。拖拽接收、调整大小、键盘焦点等独立交互提示沿用现有实现；强制颜色模式仍保留系统色边界以便辨识。
4. 保留全局 WebView2 `backdrop-filter: none !important` 防撕裂规则。实际柔雾来自已模糊的普通背景图片，即使 backdrop 被关闭仍可工作。
5. Dock 栏和顶部搜索框通过 `launchpad-material-surface` 显式加入共享表面，文件夹继续使用 `folder-icon-surface`。复用同一次纹理生成、坐标对齐与清理逻辑，搜索结果面板和下拉菜单不加入。搜索框由外层容器绘制材质，输入框使用 appearance-none 和透明背景。三者使用相同的柔雾纹理与回退底色，搜索框没有专属中性填色；不同位置仍会随各自下面的壁纸颜色变化。切回默认玻璃时统一清除纹理覆盖。筛选按钮保留原有玻璃底色、边框和悬停样式，清除继承的壁纸文字投影。容器保留输入焦点轮廓，偏移为 0，直接贴合表面边缘；筛选按钮保留键盘焦点提示。自定义壁纸下搜索文字跟随图标标题颜色，减少透明度和强制颜色模式恢复相应前景色。
6. `folderMaterialColor.ts` 独立负责颜色变换：`applyLauncherFolderMaterialColors` 保留已提取的 MIX → DODGE_BG/OVERLAY，仅作为原生参照；产品入口 `applyFolderMaterialColors` 共用同一混合公式，浅色以 40% 中性浅灰混合，深色以 50% 近黑混合。两种主题都不会先叠原生灰色再处理，也没有独立 `applyFolderMaterialVeil`。共用一次 Canvas 读写，滚动和拖动不重复处理，也不在 CSS 上重复叠色。读取失败时浅色回退为半透明 `#E0E0E066`，深色为 `rgb(16 16 16 / 50%)`；回退色不额外叠在成功纹理上方。
7. `folderMaterialAppearance.ts` 继续负责壁纸解码和明暗采样；设置保存、主窗口同步及语言切换复用原有外观链路。
8. `folder-material.css` 和同步器恢复为单一壁纸纹理层，浅深色均不添加固定纵向明暗渐变；background-image、size、position 的层数一致。右键副本仍清除旧的局部纹理及明暗变量，避免旧复制样式冻结背景。减少透明度及强制颜色模式关闭纹理并使用相应系统/实色表面。圆角和边框规则不变。

## 平台适配边界

原生参照函数的混色顺序、RGB/alpha 参数和 DODGE_BG/OVERLAY 公式按 APK 内 shader 对齐；当前产品两种主题均不再直接使用这套参照输出。Android BlurService 的模糊内核、屏幕色彩管理没有在 WebView 中执行。32 CSS px 模糊仍属于 DesktopGo 适配参数，不宣称与厂商 GPU 输出逐像素相同。原生高光的 35%/20% 是 shader 输入，还需经过空间衰减与合成，不能直接映射成固定透明度的 CSS 边框，因此当前不模拟这一可选分支。

### 用户提供的文件夹外观参考

用户随后提供真实 ColorOS 文件夹的裁图：底板呈厚实、低饱和的深暖灰，内部壁纸明暗变化很弱，没有清晰白框或固定上白下黑。此图只作为外观方向参考，没有做截图取色、像素比对或图像回归，也不能仅凭裁图确定设备所选后端或恢复原始壁纸。

用户补充明确的浅色参考（`codex-clipboard-c7ac04da-a545-40d0-a89a-d85b3260678b.png`）后，可以直接观察到：左侧纵向文件夹上部偏灰、下部偏暖，顶部小文件夹和右下文件夹也有不同的背景色调；壁纸细节被模糊，但大范围明暗与色彩仍明显参与表面。没有明显白框。此图只用于外观判断，没有取色、像素比较或图像测试，也未据此确定设备实际启用的 shader 分支。

上一版浅色把中性黑到白压缩到 `#ACACAC..#D7D7D7`，仅保留 20% 色差，导致可见背景变化太弱，用户反馈像不透明底板。本次移除浅色指数曲线，改成模糊后的壁纸与半透明中性浅灰直接混合；固定方向的渐变仍不参与绘制。

浅色适配：

```text
输入：模糊后的 RGB，数值范围 0..255
输出通道 = 输入通道 × 0.60 + 224 × 0.40
```

60% 的模糊壁纸参与输出，恢复背景的明暗与色差；40% 的 `#E0E0E0` 提供浅色雾面。这个颜色和透明度也存在于已提取的普通浅色回退资源中，但将其应用在模糊壁纸上是本项目按参考图作出的适配，不是证明手机完整材质就在使用该回退配方。

用户随后指出深色在不同背景下仍像同一颜色。此前的深色曲线将中性黑到白压缩到 `24..108`，并只保留 24% 色差；亮背景之间的明暗差异还会进一步被指数曲线收敛。当前深色移除这两项压缩，复用浅色的透明罩色混合逻辑，但使用近黑色和独立透明度：

```text
输入：模糊后的 RGB，数值范围 0..255
输出通道 = 输入通道 × 0.50 + 16 × 0.50
```

| 主题 | 中性黑/中灰/白输入的输出          |
| ---- | --------------------------------- |
| 浅色 | `#5A5A5A` / `#A6A6A6` / `#F3F3F3` |
| 深色 | `#080808` / `#484848` / `#888888` |

浅色中性输出范围由原来的 43 级扩展为 153 级，色差保留从 20% 增加到 60%；深色色差保留从 24% 增加到 50%，中性输出范围扩展为 128 级，明暗变化不再随输入亮度逐渐衰减。近黑罩色仍使常见壁纸变暗。没有写死肤色或暖棕底色；冷暖变化由对应位置的模糊壁纸提供。50% 近黑是本项目为兼顾透色与深色外观选择的适配值，不是截图取色或 APK 原生配方。

对于合成暖色 `[170,140,110]`，浅色输出 `[192,174,156]`，深色输出 `[93,78,63]`。这些只是算法示例，不是截图像素或视觉验收结果。

**预合成纹理的 alpha=1 不等于材质没有透色。** 背景已作为输入参与混色，因此无需降低整个表面或纹理的 opacity；再次降低会让未模糊的壁纸细节穿透，降低容器 opacity 还会影响应用图标和文字。两种主题在纹理不可用时使用各自的半透明罩层作为回退，此时只有透色、没有模糊；减少透明度和强制颜色模式仍显式使用实色。

此前在原生混色后附加的 18% 浅色雾色和整面明暗渐变已在 Launcher 基准阶段移除；当前直接混合浅灰与模糊壁纸，不再叠加原生配方。高斯模糊会保留均匀颜色，继续增加模糊半径不能让无纹理区域自动产生雾感。对于没有蒙版、周围均匀的 `#096692`，纯数值计算结果如下；这不是截图测量或真机颜色承诺：

| 主题与整图分支     | 原生公式输出 | 当前共享纹理值 |
| ------------------ | ------------ | -------------- |
| 浅色主题、普通壁纸 | `#1773A3`    | `#5F97B1`      |
| 浅色主题、亮壁纸   | `#085C83`    | `#5F97B1`      |
| 深色主题           | `#23698D`    | `#0C3B51`      |

当前两种主题均保留模糊壁纸的透色，深色用近黑罩色控制亮度，均属于 DesktopGo 适配；不是通知四步 LUMINOSITY，也不声称已还原该手机的全部运行态。

已有解码流程仍保留32×32采样、alpha加权亮度和196/255的明暗标签，原生参照函数也保留对应分支。当前产品颜色入口不再接收该标签，两种主题都按局部模糊 RGB 连续处理，回退底色也不随壁纸明暗标签切换。`ImageProcess` 的 native 计算未解析，因此不能宣称标签与设备分类完全一致。取景与用户蒙版继续影响输入颜色，无壁纸或 Canvas 不可用时使用各主题的回退底色。

打开后的文件夹内容面板、搜索结果面板及筛选菜单保留现有面板材质。

## 验证

2026-11-11 深色透色修正：28 项相关测试、`pnpm.cmd test` 全量 660 项、`pnpm.cmd build`（含 TypeScript）、相关 TypeScript 文件严格 lint、Prettier、文件规模与 diff 检查通过。新增/更新断言覆盖不同色相的背景仍有明显色差、深色明暗连续变化、深色半透明回退、主题切换时三种表面共享新纹理，并保留浅色数值回归。全项目 lint 本轮未重复运行；上一轮记录的 16 个错误、3 个警告为已知存量。构建仍有 Browserslist、layoutStore 混合导入和大块体积提示。未启动应用；验证采用合成数值和 DOM/CSS/绘制命令断言，不做截图或像素比较，不据此声称真机观感一致。

历史记录——2026-11-11 浅色透色修正：27 项相关测试、`pnpm.cmd test` 全量 659 项、`pnpm.cmd build`（含 TypeScript）、相关 TypeScript 文件严格 lint、Prettier、文件规模与 diff 检查通过。更新的断言覆盖浅色背景明暗和色差保留、半透明回退、材质不降低图标/文字 opacity、浅→深→浅共享纹理，当时深色数值保持原样。`pnpm.cmd lint` 当轮重新执行，仍为未修改文件中的 16 个错误、3 个警告，涉及拖拽生命周期、Dock 记忆化、右键菜单和菜单导出。构建仍有 Browserslist、layoutStore 混合导入和大块体积提示。参考图仅供外观判断；验证采用合成数值、绘制命令和 DOM/CSS 状态，不做截图或像素比较，未启动应用，也不据此声称真机观感已经一致。

历史记录——2026-11-11 浅色压缩适配（已被后续透色方案替代）：27 项相关测试、全量 659 项前端测试、`pnpm.cmd build`（含 TypeScript）、改动 TypeScript 文件严格 lint、Prettier、文件规模与 diff 检查通过。当时覆盖浅色灰色底板、亮部限制、饱和壁纸色差收敛、两种主题的灰度连续性与 alpha 保留、浅→深→浅时三种表面共享纹理，以及不透明浅色回退。全项目 lint 当轮未重复运行，之前记录的 16 个错误、3 个警告仍为已知存量；构建仍提示 Browserslist 数据过期、layoutStore 混合导入和大块体积。未启动应用或进行截图测试，测试通过未证明手机浅色最终观感一致。

历史记录——2026-11-11 深色外观适配：26项相关测试、全量658项前端测试、生产构建（含 TypeScript）、改动 TypeScript 文件严格 lint、Prettier、文件规模与 diff 检查通过。当时覆盖浅色原生配方保持、深色亮度压缩/色差收敛、灰度连续性、alpha保留、主题切换时三种表面共享新输出，以及无纹理时的不透明底色。全项目 lint 未重复运行，上一轮16个错误、3个警告为已知存量；构建有 Browserslist、混合导入和大块体积提示。没有启动应用、截图测试或声称最终观感已经与参考一致。

历史记录——2026-11-11 Launcher 基准实施：23 项相关测试与全量655项前端测试通过，生产构建（含 TypeScript）、改动 TypeScript 文件严格 lint、Prettier、文件规模与 diff 检查通过。全项目 `pnpm.cmd lint` 仍为未修改文件的16个错误、3个警告，涉及拖拽生命周期、Dock 记忆化、右键菜单 refs/effect 与菜单组件导出。构建保留 Browserslist 数据过期、layoutStore 混合导入和大块体积提示。未改 Rust/IPC，未运行 Rust 检查；未启动应用或声称完成手机视觉对照。

本次相关测试命令包括搜索框交互验证：

```powershell
node --experimental-strip-types --import ./scripts/register-ts-test-loader.mjs --test src/lib/folderMaterialColor.test.js src/lib/folderMaterialRendering.test.js src/lib/folderMaterial.test.js src/lib/settingsStore.folderMaterial.test.js src/components/launchpad/LaunchpadSearchBar.test.js
pnpm.cmd exec eslint src/lib/folderMaterialColor.ts src/lib/folderMaterialTexture.ts src/lib/folderMaterialSurfaceSync.ts --max-warnings 0
```

Launcher 基准专项测试覆盖浅深色均不叠额外灰色、不绘制固定纵向渐变，以及日夜分支、`#096692` 数值回归、灰度与彩色数值向量、连续灰度梯度、亮度 195/196 边界、模糊后混色、单层纹理坐标、共享纹理、失败回退与恢复。测试采用纯数值公式、绘制命令与 DOM 状态断言，不使用截图或图像回归。下列命令用于相关实现检查：

历史记录（本次 Launcher 基准实施之前）：深色模式移除额外灰色与纵向渐变后，22 项专项测试、全量 656 项前端测试、含 TypeScript 的生产构建、改动文件严格 lint、Prettier、文件规模和 diff 检查通过。此前全项目 lint 有未改动文件的 16 个错误、3 个警告；构建有 Browserslist 数据过期、layoutStore 混合导入和大块体积提示。历史结果不作为本次执行结果。切换到默认玻璃再切回柔雾会清理并重建共享纹理，未据此断言当前用户窗口存在缓存故障。

```powershell
node --experimental-strip-types --import ./scripts/register-ts-test-loader.mjs --test src/lib/folderMaterialColor.test.js src/lib/folderMaterialRendering.test.js src/lib/folderMaterial.test.js src/lib/settingsStore.folderMaterial.test.js
pnpm.cmd test
pnpm.cmd build
pnpm.cmd lint
pnpm.cmd exec eslint src/lib/folderMaterialColor.ts src/lib/folderMaterialPolicy.ts src/lib/folderMaterialTexture.ts src/lib/folderMaterialSurfaceSync.ts --max-warnings 0
pnpm.cmd exec prettier --check src/lib/folderMaterialColor.ts src/lib/folderMaterialColor.test.js src/lib/folderMaterialPolicy.ts src/lib/folderMaterialTexture.ts src/lib/folderMaterialSurfaceSync.ts src/styles/folder-material.css src/lib/folderMaterialRendering.test.js src/lib/folderMaterial.test.js docs/coloros-folder-material.md
node .codex/skills/maintain-modular-code/scripts/check-changed-files.mjs
git diff --check
```

以下为此前各阶段的验证记录。

使用状态与绘制命令断言，验证混色分支、cover 取景、边缘延展、模糊绘制顺序、坐标对齐、缩放、滚动、主题刷新、右键前景副本、取消与资源清理，以及 CSS 不依赖 backdrop、不改圆角。

```powershell
node --experimental-strip-types --import ./scripts/register-ts-test-loader.mjs --test src/lib/folderMaterial.test.js src/lib/folderMaterialRendering.test.js src/lib/settingsStore.folderMaterial.test.js src/lib/appearance.test.js src/components/icons/focusedItemForeground.test.js src/components/icon-grid/views/folderTilePreviewGeometry.test.js src/components/icon-grid/views/folderVisualPolicy.test.js
pnpm.cmd exec tsc --noEmit
pnpm.cmd build
pnpm.cmd lint
pnpm.cmd exec eslint src/lib/folderMaterialPolicy.ts src/lib/folderMaterialTexture.ts src/lib/folderMaterialSurfaceSync.ts src/lib/folderMaterialAppearance.ts src/lib/appearance.ts --max-warnings 0
node .codex/skills/maintain-modular-code/scripts/check-changed-files.mjs
git diff --check
```

未启动 DesktopGo、Vite、浏览器或 Tauri，未使用截图或像素比较。测试通过不代表已经核实 ColorOS 真机与 DesktopGo 的最终屏幕观感一致。

本轮结果：49 项相关测试通过；TypeScript、生产构建、改动文件严格 lint、Prettier 与文件规模检查通过。全项目 lint 仍报未修改文件中的 16 个错误和 3 个警告（拖拽控制、Dock 记忆化、右键菜单 refs/effect 与菜单组件导出）。生产构建的已有警告包括 Browserslist 数据过期、layoutStore 混合导入和大块体积。

Dock / 搜索框接入验证：15 项材质测试、生产构建（含 TypeScript）、以下文件的严格 lint、格式和文件规模检查通过。全项目 lint 仍为此前的 16 个错误、3 个警告；DockBar 本次仅增加共享表面类，原有记忆化规则错误仍存在。

```powershell
node --experimental-strip-types --import ./scripts/register-ts-test-loader.mjs --test src/lib/folderMaterial.test.js src/lib/folderMaterialRendering.test.js src/lib/settingsStore.folderMaterial.test.js
pnpm.cmd exec eslint src/components/launchpad/LaunchpadSearchBar.tsx src/lib/folderMaterialSurfaceSync.ts src/components/settings/AppearanceSettingsCards.tsx src/lib/i18n/appearanceMessages.ts --max-warnings 0
pnpm.cmd exec prettier --check src/components/launchpad/LaunchpadSearchBar.tsx src/lib/folderMaterialSurfaceSync.ts src/styles/folder-material.css src/components/settings/AppearanceSettingsCards.tsx src/lib/i18n/appearanceMessages.ts src/lib/folderMaterialRendering.test.js docs/coloros-folder-material.md
```

搜索栏整体表面修正：17 项相关测试通过，新增组件语义测试覆盖三种搜索来源的单一材质容器以及输入、焦点、键盘、筛选回调。执行 `pnpm.cmd exec eslint src/components/launchpad/LaunchpadSearchBar.tsx --max-warnings 0`、改动文件 Prettier、文件规模检查及生产构建；未启动应用进行实机验证。

搜索栏材质一致性与焦点环修正：移除搜索栏独有的雾面填色，纹理同步恢复单层背景；焦点轮廓的 `outline-offset` 从 2px 改为 0。回归检查覆盖三种表面共享同一纹理及回退色、禁止搜索栏单独覆盖材质、焦点环无外间距、辅助显示模式，以及筛选按钮玻璃样式不被覆盖。验证命令如下；测试检查结构、绘制命令与状态，不代表实机观感验证。

```powershell
node --experimental-strip-types --import ./scripts/register-ts-test-loader.mjs --test src/components/launchpad/LaunchpadSearchBar.test.js src/lib/folderMaterialRendering.test.js src/lib/folderMaterial.test.js src/lib/settingsStore.folderMaterial.test.js
pnpm.cmd exec eslint src/components/launchpad/LaunchpadSearchBar.tsx src/lib/folderMaterialSurfaceSync.ts --max-warnings 0
pnpm.cmd exec prettier --check src/styles/folder-material.css src/lib/folderMaterialSurfaceSync.ts src/lib/folderMaterialRendering.test.js src/components/launchpad/LaunchpadSearchBar.test.js docs/coloros-folder-material.md
pnpm.cmd build
node .codex/skills/maintain-modular-code/scripts/check-changed-files.mjs
git diff --check
```

以上检查通过。全项目 lint 未重复运行；此前记录的存量错误仍待处理，生产构建仍有上述既有警告。

## 2026-11-11 运行实例只读检查（混色顺序修正前）

经用户授权，在现有开发实例通过临时热更新诊断读取 DOM、计算样式和 Canvas 绘制命令，并写入本机日志；没有截图、像素比较、启动或重启应用。诊断模块和临时导入已移除，检查时打开的 DevTools 已关闭。

- 搜索框、文件夹、Dock 的计算背景图片均与根节点共享纹理完全一致；纹理解码尺寸为 1024×576，三个表面均为 opacity 1、background-blend-mode normal，无额外 filter。
- 壁纸绘制区域为 1280×720，左上角为 (16,16)。搜索框为 (344,40,624,44)，其背景位置为 (-328,-24)、背景尺寸为 1280×720，坐标与壁纸吻合。
- 当前为浅色主题、普通壁纸分支，背景蒙版和背景模糊设置均为 0；三者回退底色都是 rgba(224,224,224,0.4)。搜索框输入元素为透明背景，由外层容器承载纹理。
- 重新生成纹理时，运行中的 Canvas 接受并在 drawImage 时使用 blur(25.6px)，按 0.8 的纹理缩放对应 32 CSS px；重新生成的 PNG 与当前共享纹理完全一致。
- 以上排除了缺少纹理、解码失败、坐标错位和搜索框单独透明覆盖等假设。不同区域取样是事实，但尚不能单凭计算样式和绘制命令认定它就是用户感知差异的全部原因；此次检查没有声称最终屏幕观感已修复，也没有再次调整填色。
