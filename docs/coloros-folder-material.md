# 柔雾文件夹材质

设置入口：设置 → 语言与外观 → 文件夹材质 → 柔雾。旧设置继续使用默认玻璃。此次只调整文件夹图标表面的材质和边缘效果，圆角、连续曲率、尺寸、内部图标和留白均保留。

## 已核实的原生绘制路径

目标为 `D:/Project/other/ColorOS16/analysis/extracted/system_ext/priv-app/OplusLauncher/OplusLauncher.apk`，版本 16.6.13，SHA-256 `3b023e0211f8660988ff1cf7bb4c37129e07d3ce506e8047f8542fbfa64ba3cf`。复用了 `analysis/launcher-findings.md`、`analysis/focused/launcher`、`analysis/focused/launcher-material`，并以既有 FocusedJadx 工具追加检查以下类：

- `OplusPreviewBackground.initBlurDrawable`：文件夹创建 `LayerBlurDrawable`，读取 `getBlurColorParams`，调用 `setBlurParams(800, blendMode, blendColor, mixColor)`。
- `OplusBlurProperties.prepareBlur/setBlurParams`：普通文件夹灰色值用于 `setPlaceHolderColor`，材质参数单独传入 `BlurParam.setMaterialParams`。因此不能把普通背景 XML 当作完整材质。
- `OplusBlurProperties.toUXMode`：模式 3 为 DODGE，模式 4 为 OVERLAYER。`BlurMaterialColor` 在日间亮壁纸使用 mix `#00000000`、blend `#1A000000`；日间普通壁纸使用 mix `#FF37393E`、blend `#3D2E3033`；夜间使用 mix `#A3737373`、blend `#33999999`，以上为 Android ARGB。
- `LayerBlurDrawable.refreshBlurDrawableParam`：仅在系统纹理描边开关开启且允许当前对象绘制时，调用 `setGradientStrokeLineParams`；否则明确清空描边参数。`mTempShowTextureStroke` 初始为 true，但不能据此认定某台设备常态下存在明显边框。
- `AGSLGradientStrokeParam`：默认白色描边，nearLineAlpha=0.35、farLineAlpha=0.20，沿边和向内部衰减；具体空间参数依赖尺寸、半径与原生 shader。
- 普通 XML 的 `#66A6A6A6`、`#66E0E0E0` 和夜间 `#4C000000` 保留为解码/渲染不可用时的回退底色，不再承担完整材质。

本次定向反编译文件保存在被 Git 忽略的 `build-script/coloros-folder-material-reference-20261111` 和 `build-script/coloros-folder-material-detail-20261111`。这些是普通 JADX 静态输出，不是 REA Evidence，也不是设备运行观察；工具提示存在未知 Android 类型及其他关联方法的结构警告。

## DesktopGo 实现

1. `folderMaterialTexture.ts` 用 Canvas 生成共享壁纸纹理：与桌面相同的居中 cover 取景、背景蒙版、边缘扩展、模糊，再按日夜分支进行 color-dodge/overlay 和 blend 叠色。纹理最长边限制为 1024，避免每个文件夹重复解码或模糊。
2. `folderMaterialSurfaceSync.ts` 按桌面壁纸层与文件夹的实际矩形对齐背景，补偿拖拽/缩放的局部比例。支持网格各尺寸、Dock、创建预览、拖拽门户以及右键菜单复制的前景；处理复制样式中的 important 值，避免浮层冻结旧背景。滚动/尺寸/主题变化触发更新，CSS 动画期间连续更新，静止时无常驻刷新循环。更换壁纸或材质会清理观察器、事件和纹理。
3. `folder-material.css` 不绘制常驻高光环、内描边或外投影，也不在 Dock 打开/创建预览时额外添加白色边框。保留透明边框占位，不修改任何圆角和几何参数。拖拽接收、调整大小、键盘焦点等独立交互提示沿用现有实现；强制颜色模式仍保留系统色边界以便辨识。
4. 保留全局 WebView2 `backdrop-filter: none !important` 防撕裂规则。实际柔雾来自已模糊的普通背景图片，即使 backdrop 被关闭仍可工作。
5. `folderMaterialAppearance.ts` 继续负责壁纸解码和明暗采样；设置保存、主窗口同步及语言切换复用原有外观链路。

## 平台适配边界

实现采用已核实的材质层次和混色参数。Android BlurService/PostEffect 的 native shader 没有在 WebView 中执行：32 CSS px 模糊与 Canvas 混色顺序属于 DesktopGo 适配参数，不宣称与厂商 GPU 输出逐像素相同。原生高光的 35%/20% 是 shader 输入，还需经过空间衰减与合成，不能直接映射成固定透明度的 CSS 边框，因此当前不模拟这一可选分支。整图亮度采用 alpha 加权 60% 阈值，也不等同于 ColorOS 的设备取色算法。无壁纸或 Canvas 不可用时使用半透明回退底色。

打开后的文件夹内容面板保留现有面板材质，本选项针对桌面文件夹图标。

## 验证

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
