# DesktopGo 归档时实现证据摘录

归档日期：2026-11-11。保留原始行号及引用附近上下文；不是完整反编译副本，不代表运行观察。全文 SHA-256、摘录范围及来源见 [sources.json](sources.json)。较长 shader 字符串保留原始 Java 转义。

## source-060

原文件：`D:/Project/SelfProject/DesktopGo/src/lib/folderMaterialColor.ts`  
全文 SHA-256：`9794617cabd250a513a3bb91df6c34a7698172db0065e72a19ef20ba688096ac`  
原始引用行：14, 50

原文件第 8–42 行：

```text
    8 |  * Port of BlurDrawableShader.mappingBgBlendParams + doBlend (modes 3/4).
    9 |  * First MIX(blendColor/A), then DODGE_BG or OVERLAY(mixColor/B).
   10 |  * Native DODGE_BG divides without clamping before alpha interpolation; Canvas
   11 |  * color-dodge clamps earlier and produces different highlights. Clamp only on output.
   12 |  * The input is an opaque, already blurred wallpaper. Geometry and blur stay outside.
   13 |  */
   14 | export function applyFolderMaterialColors(
   15 |   pixels: Uint8ClampedArray,
   16 |   dark: boolean,
   17 |   tone: FolderBackdropTone
   18 | ): void {
   19 |   const layers = getColorOsMaterialLayers(dark, tone)
   20 |   const base = rgba(layers.blend)
   21 |   const effect = rgba(layers.mix)
   22 |   // Both shader stages are separable by channel: only 768 evaluations per texture.
   23 |   const lookup = new Uint8ClampedArray(256 * 3)
   24 |   for (let channel = 0; channel < 3; channel++) {
   25 |     for (let value = 0; value < 256; value++) {
   26 |       const mixed = (value / 255) * (1 - base[3]) + base[channel] * base[3]
   27 |       const blended =
   28 |         layers.mode === 'color-dodge'
   29 |           ? mixed / (1 - effect[channel] + 1e-8)
   30 |           : mixed < 0.5
   31 |             ? 2 * effect[channel] * mixed
   32 |             : 1 - 2 * (1 - effect[channel]) * (1 - mixed)
   33 |       lookup[channel * 256 + value] = 255 * (mixed * (1 - effect[3]) + blended * effect[3])
   34 |     }
   35 |   }
   36 |   for (let index = 0; index + 3 < pixels.length; index += 4) {
   37 |     pixels[index] = lookup[pixels[index]]
   38 |     pixels[index + 1] = lookup[256 + pixels[index + 1]]
   39 |     pixels[index + 2] = lookup[512 + pixels[index + 2]]
   40 |   }
   41 | }
   42 |
```

原文件第 44–63 行：

```text
   44 |  * DesktopGo light-theme soft-mist finish, applied after the native color transform.
   45 |  * Blur preserves a uniform color. This restrained, neutral coat reduces wallpaper
   46 |  * chroma even on flat blue regions, without depending on surface size or position.
   47 |  * Dark mode keeps the native transform: another gray coat washes out its colors.
   48 |  * The light neutral at 18% is an adaptation, not an Oplus value.
   49 |  */
   50 | export function applyFolderMaterialVeil(pixels: Uint8ClampedArray, dark: boolean): void {
   51 |   if (dark) return
   52 |   const gray = 224
   53 |   const opacity = 0.18
   54 |   const lookup = new Uint8ClampedArray(256)
   55 |   for (let value = 0; value < 256; value++) {
   56 |     lookup[value] = value * (1 - opacity) + gray * opacity
   57 |   }
   58 |   for (let index = 0; index + 3 < pixels.length; index += 4) {
   59 |     pixels[index] = lookup[pixels[index]]
   60 |     pixels[index + 1] = lookup[pixels[index + 1]]
   61 |     pixels[index + 2] = lookup[pixels[index + 2]]
   62 |   }
   63 | }
```

## source-061

原文件：`D:/Project/SelfProject/DesktopGo/src/lib/folderMaterialTexture.ts`  
全文 SHA-256：`5a9434406124efe872dc5c3a3e21ed713023e4b1552442e5903e5e20598edf23`  
原始引用行：15

原文件第 9–43 行：

```text
    9 |   overlay: number
   10 |   backgroundBlur: number
   11 |   scrim: string
   12 | }
   13 |
   14 | // Desktop CSS adaptation of the native 800 blur setting, not an Android-pixel conversion.
   15 | const MATERIAL_BLUR_PX = 32
   16 | const MAX_TEXTURE_EXTENT = 1024
   17 |
   18 | function canvasWithContext(width: number, height: number) {
   19 |   const canvas = document.createElement('canvas')
   20 |   canvas.width = width
   21 |   canvas.height = height
   22 |   const context = canvas.getContext('2d')
   23 |   if (!context) throw new Error('Folder material canvas unavailable')
   24 |   return { canvas, context }
   25 | }
   26 |
   27 | /** Edge clamping avoids translucent/dark seams at the wallpaper's four edges. */
   28 | function padTexture(source: HTMLCanvasElement, padding: number) {
   29 |   const { width, height } = source
   30 |   const { canvas, context } = canvasWithContext(width + padding * 2, height + padding * 2)
   31 |   const xBands = [
   32 |     [0, 1, 0, padding],
   33 |     [0, width, padding, width],
   34 |     [width - 1, 1, width + padding, padding],
   35 |   ]
   36 |   const yBands = [
   37 |     [0, 1, 0, padding],
   38 |     [0, height, padding, height],
   39 |     [height - 1, 1, height + padding, padding],
   40 |   ]
   41 |   for (const [sx, sw, dx, dw] of xBands) {
   42 |     for (const [sy, sh, dy, dh] of yBands) {
   43 |       context.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh)
```

## source-062

原文件：`D:/Project/SelfProject/DesktopGo/src/styles/folder-material.css`  
全文 SHA-256：`16261940161a5e53e35b878fbf20d586c40503d277927c21c6cc5984f9191a4d`  
原始引用行：1

原文件第 1–29 行：

```text
    1 | /* ColorOS 16 material blur + mix/blend, without an always-on decorative outline.
    2 |  * Folders, Dock and search share this surface. Geometry stays with their existing styles.
    3 |  * A shared Canvas texture replaces backdrop-filter on the transparent WebView2 surface. */
    4 | [data-folder-material='coloros'] {
    5 |   --coloros-folder-fill: #a6a6a666;
    6 |   --folder-material-shading: linear-gradient(
    7 |     180deg,
    8 |     rgb(255 255 255 / 7%) 0%,
    9 |     rgb(255 255 255 / 0%) 44%,
   10 |     rgb(0 0 0 / 5.5%) 100%
   11 |   );
   12 | }
   13 |
   14 | [data-folder-material='coloros'][data-folder-backdrop='dark'] {
   15 |   --coloros-folder-fill: #e0e0e066;
   16 | }
   17 |
   18 | :root.dark[data-folder-material='coloros'] {
   19 |   --coloros-folder-fill: #0000004c;
   20 |   /* Preserve the wallpaper's lighting instead of imposing a white-to-black surface. */
   21 |   --folder-material-shading: none;
   22 | }
   23 |
   24 | [data-folder-material='coloros'] :is(.folder-icon-surface, .launchpad-material-surface) {
   25 |   transition-property:
   26 |     transform, translate, scale, rotate, opacity, left, top, width, height, border-radius,
   27 |     box-shadow;
   28 |   background-color: var(--coloros-folder-fill);
   29 |   /* Surface-local lighting sits above the wallpaper-aligned mist texture. */
```
