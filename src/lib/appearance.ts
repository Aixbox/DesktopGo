import { getSetting } from './settingsStore'
import {
  backgroundBlurToPixels,
  clampBackgroundOverlay,
  deriveAccentPalette,
  extractAccentColorFromPixels,
  getAccentForegroundColor,
  isLaunchpadBackgroundDataUri,
  normalizeThemeAccentColor,
} from './appearancePolicy'

export {
  BACKGROUND_BLUR_MAX,
  BACKGROUND_BLUR_MAX_PX,
  BACKGROUND_BLUR_MIN,
  BACKGROUND_OVERLAY_MAX,
  BACKGROUND_OVERLAY_MIN,
  DEFAULT_BACKGROUND_BLUR,
  DEFAULT_BACKGROUND_OVERLAY,
  DEFAULT_THEME_ACCENT_COLOR,
  MAX_BACKGROUND_DATA_URI_LENGTH,
  THEME_ACCENT_PRESETS,
  backgroundBlurToPixels,
  clampBackgroundBlur,
  clampBackgroundOverlay,
  deriveAccentPalette,
  extractAccentColorFromPixels,
  getAccentForegroundColor,
  isLaunchpadBackgroundDataUri,
  normalizeThemeAccentColor,
} from './appearancePolicy'

export const MAX_BACKGROUND_FILE_BYTES = 12 * 1024 * 1024

const BACKGROUND_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const APPEARANCE_CSS_VARIABLES = [
  '--appearance-accent',
  '--accent-selected-foreground-light',
  '--accent-selected-foreground-dark',
  '--primary',
  '--primary-foreground',
  '--ring',
  '--sidebar-primary',
  '--sidebar-primary-foreground',
] as const

export type AppearanceSettings = {
  accentColor: string
  backgroundImage: string
  /** 背景蒙版浓度百分比，越大越接近纯色底。 */
  backgroundOverlay: number
  /** 背景模糊强度百分比，渲染时换算为模糊半径。 */
  backgroundBlur: number
}

export type BackgroundImageErrorCode = 'format' | 'file-size' | 'decode' | 'output-size'

export class BackgroundImageError extends Error {
  readonly code: BackgroundImageErrorCode

  constructor(code: BackgroundImageErrorCode) {
    super(code)
    this.name = 'BackgroundImageError'
    this.code = code
  }
}

export function applyAppearance({
  accentColor,
  backgroundImage,
  backgroundOverlay,
  backgroundBlur,
}: AppearanceSettings): void {
  const root = document.documentElement
  const normalizedAccent = normalizeThemeAccentColor(accentColor)

  if (normalizedAccent) {
    const foreground = getAccentForegroundColor(normalizedAccent)
    const palette = deriveAccentPalette(normalizedAccent)
    root.style.setProperty('--appearance-accent', normalizedAccent)
    if (palette) {
      root.style.setProperty('--accent-selected-foreground-light', palette.selectedForegroundLight)
      root.style.setProperty('--accent-selected-foreground-dark', palette.selectedForegroundDark)
    }
    root.style.setProperty('--primary', normalizedAccent)
    root.style.setProperty('--primary-foreground', foreground)
    root.style.setProperty('--ring', normalizedAccent)
    root.style.setProperty('--sidebar-primary', normalizedAccent)
    root.style.setProperty('--sidebar-primary-foreground', foreground)
  } else {
    for (const variable of APPEARANCE_CSS_VARIABLES) root.style.removeProperty(variable)
  }

  if (isLaunchpadBackgroundDataUri(backgroundImage)) {
    const overlay = clampBackgroundOverlay(backgroundOverlay)
    const blurPixels = backgroundBlurToPixels(backgroundBlur)
    root.style.setProperty('--launchpad-background-image', `url("${backgroundImage}")`)
    root.style.setProperty('--launchpad-background-overlay', `${overlay / 100}`)
    root.style.setProperty('--launchpad-background-blur', `${blurPixels}px`)
    // 模糊会让图片边缘透出底色，向外扩张同等量级的绘制区域来补偿。
    root.style.setProperty('--launchpad-background-bleed', `${-blurPixels * 2}px`)
    root.dataset.launchpadBackground = 'custom'
  } else {
    root.style.removeProperty('--launchpad-background-image')
    root.style.removeProperty('--launchpad-background-overlay')
    root.style.removeProperty('--launchpad-background-blur')
    root.style.removeProperty('--launchpad-background-bleed')
    delete root.dataset.launchpadBackground
  }
}

export async function getSavedAppearance(): Promise<AppearanceSettings> {
  const [accentColor, backgroundImage, backgroundOverlay, backgroundBlur] = await Promise.all([
    getSetting('themeAccentColor'),
    getSetting('launchpadBackgroundImage'),
    getSetting('launchpadBackgroundOverlay'),
    getSetting('launchpadBackgroundBlur'),
  ])
  return { accentColor, backgroundImage, backgroundOverlay, backgroundBlur }
}

export async function applySavedAppearance(): Promise<AppearanceSettings> {
  const appearance = await getSavedAppearance()
  applyAppearance(appearance)
  return appearance
}

function canvasToDataUri(canvas: HTMLCanvasElement, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (!blob) {
          reject(new BackgroundImageError('decode'))
          return
        }
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new BackgroundImageError('decode'))
        reader.readAsDataURL(blob)
      },
      'image/webp',
      quality
    )
  })
}

function resizeCanvas(source: HTMLCanvasElement, scale: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(source.width * scale))
  canvas.height = Math.max(1, Math.round(source.height * scale))
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new BackgroundImageError('decode')
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

async function encodeBackgroundCanvas(source: HTMLCanvasElement): Promise<string> {
  let canvas = source
  for (let pass = 0; pass < 3; pass += 1) {
    for (const quality of [0.82, 0.72, 0.62]) {
      const dataUri = await canvasToDataUri(canvas, quality)
      if (isLaunchpadBackgroundDataUri(dataUri)) return dataUri
    }
    canvas = resizeCanvas(canvas, 0.8)
  }
  throw new BackgroundImageError('output-size')
}

export async function prepareLaunchpadBackground(
  file: File
): Promise<{ dataUri: string; accentColor: string | null }> {
  if (!BACKGROUND_MIME_TYPES.has(file.type)) throw new BackgroundImageError('format')
  if (file.size > MAX_BACKGROUND_FILE_BYTES) throw new BackgroundImageError('file-size')

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new BackgroundImageError('decode')
  }

  try {
    const scale = Math.min(1, 1920 / bitmap.width, 1200 / bitmap.height)
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new BackgroundImageError('decode')
    context.drawImage(bitmap, 0, 0, width, height)

    const sampleCanvas = document.createElement('canvas')
    sampleCanvas.width = 64
    sampleCanvas.height = 64
    const sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true })
    if (!sampleContext) throw new BackgroundImageError('decode')
    sampleContext.drawImage(canvas, 0, 0, 64, 64)
    const accentColor = extractAccentColorFromPixels(sampleContext.getImageData(0, 0, 64, 64).data)
    const dataUri = await encodeBackgroundCanvas(canvas)
    return { dataUri, accentColor }
  } finally {
    bitmap.close()
  }
}
