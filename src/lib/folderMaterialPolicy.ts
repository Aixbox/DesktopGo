/** Shared by appearance settings, persistence validation and the folder renderer. */
export type FolderMaterial = 'glass' | 'coloros'
export type FolderBackdropTone = 'bright' | 'dark'

export const DEFAULT_FOLDER_MATERIAL: FolderMaterial = 'glass'

export function isFolderMaterial(value: unknown): value is FolderMaterial {
  return value === 'glass' || value === 'coloros'
}

/**
 * Approximate the launcher's wallpaper-brightness branch with one small image sample.
 * WallpaperResolver.resolveWorkspaceEditModeForStatic uses a 196/255 threshold.
 * Sampling/luma remain a DesktopGo approximation of the native ImageProcess metric.
 * Ignore invisible pixels so transparent image padding cannot bias the result.
 */
export function getFolderBackdropTone(pixels: ArrayLike<number>): FolderBackdropTone | null {
  let brightness = 0
  let weight = 0
  for (let index = 0; index + 3 < pixels.length; index += 4) {
    const alpha = pixels[index + 3]
    // Integer coefficients keep an exact gray 196 sample on the bright side.
    brightness +=
      (pixels[index] * 2126 + pixels[index + 1] * 7152 + pixels[index + 2] * 722) * alpha
    weight += alpha
  }
  if (weight === 0) return null
  return brightness >= weight * 196 * 10000 ? 'bright' : 'dark'
}

/** OplusLauncher BlurMaterialColor; ARGB converted to CSS RGBA.
 * BlurParam stores blend as A and mix as B: MIX(A), then DODGE_BG/OVERLAY(B).
 */
export function getColorOsMaterialLayers(dark: boolean, tone: FolderBackdropTone) {
  if (dark) return { mode: 'overlay' as const, mix: '#737373a3', blend: '#99999933' }
  return tone === 'bright'
    ? { mode: 'color-dodge' as const, mix: '#00000000', blend: '#0000001a' }
    : { mode: 'color-dodge' as const, mix: '#37393eff', blend: '#2e30333d' }
}

export interface MaterialRect {
  left: number
  top: number
  width: number
  height: number
}

/** Map wallpaper viewport coordinates into a possibly scaled folder's local paint box. */
export function getFolderTexturePlacement(
  wallpaper: MaterialRect,
  surface: MaterialRect,
  localSize: { width: number; height: number }
) {
  if (
    [
      wallpaper.width,
      wallpaper.height,
      surface.width,
      surface.height,
      localSize.width,
      localSize.height,
    ].some(value => !Number.isFinite(value) || value <= 0)
  )
    return null
  const scaleX = localSize.width / surface.width
  const scaleY = localSize.height / surface.height
  return {
    x: (wallpaper.left - surface.left) * scaleX,
    y: (wallpaper.top - surface.top) * scaleY,
    width: wallpaper.width * scaleX,
    height: wallpaper.height * scaleY,
  }
}
