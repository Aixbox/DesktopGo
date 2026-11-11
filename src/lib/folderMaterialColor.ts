import { getColorOsMaterialLayers, type FolderBackdropTone } from './folderMaterialPolicy'

const DARK_MIST = { tint: 16, opacity: 0.5 } as const
const LIGHT_MIST = { tint: 224, opacity: 0.4 } as const

function rgba(color: string) {
  return [1, 3, 5, 7].map(offset => Number.parseInt(color.slice(offset, offset + 2), 16) / 255)
}

/**
 * Port of BlurDrawableShader.mappingBgBlendParams + doBlend (modes 3/4).
 * First MIX(blendColor/A), then DODGE_BG or OVERLAY(mixColor/B).
 * Native DODGE_BG divides without clamping before alpha interpolation; Canvas
 * color-dodge clamps earlier and produces different highlights. Clamp only on output.
 * The input is an opaque, already blurred wallpaper. Geometry and blur stay outside.
 */
export function applyLauncherFolderMaterialColors(
  pixels: Uint8ClampedArray,
  dark: boolean,
  tone: FolderBackdropTone
): void {
  const layers = getColorOsMaterialLayers(dark, tone)
  const base = rgba(layers.blend)
  const effect = rgba(layers.mix)
  // Both shader stages are separable by channel: only 768 evaluations per texture.
  const lookup = new Uint8ClampedArray(256 * 3)
  for (let channel = 0; channel < 3; channel++) {
    for (let value = 0; value < 256; value++) {
      const mixed = (value / 255) * (1 - base[3]) + base[channel] * base[3]
      const blended =
        layers.mode === 'color-dodge'
          ? mixed / (1 - effect[channel] + 1e-8)
          : mixed < 0.5
            ? 2 * effect[channel] * mixed
            : 1 - 2 * (1 - effect[channel]) * (1 - mixed)
      lookup[channel * 256 + value] = 255 * (mixed * (1 - effect[3]) + blended * effect[3])
    }
  }
  for (let index = 0; index + 3 < pixels.length; index += 4) {
    pixels[index] = lookup[pixels[index]]
    pixels[index + 1] = lookup[256 + pixels[index + 1]]
    pixels[index + 2] = lookup[512 + pixels[index + 2]]
  }
}

/**
 * Both themes composite a translucent neutral tint over the blurred wallpaper, keeping
 * its broad light/dark and color variations. Dark mist uses a near-black tint.
 * These are reference-guided adaptations, not the native Launcher shader recipe.
 * Alpha stays intact: the texture already contains the backdrop and must cover the
 * sharp wallpaper beneath it. Fading the texture would bring sharp details back.
 */
export function applyFolderMaterialColors(pixels: Uint8ClampedArray, dark: boolean): void {
  const mist = dark ? DARK_MIST : LIGHT_MIST
  for (let index = 0; index + 3 < pixels.length; index += 4) {
    for (let channel = 0; channel < 3; channel++) {
      pixels[index + channel] =
        pixels[index + channel] * (1 - mist.opacity) + mist.tint * mist.opacity
    }
  }
}
