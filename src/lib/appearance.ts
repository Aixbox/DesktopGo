import { getSetting } from './settingsStore'
import {
  deriveAccentPalette,
  extractAccentColorFromPixels,
  getAccentForegroundColor,
  isLaunchpadBackgroundDataUri,
  normalizeThemeAccentColor,
} from './appearancePolicy'

export {
  DEFAULT_THEME_ACCENT_COLOR,
  MAX_BACKGROUND_DATA_URI_LENGTH,
  THEME_ACCENT_PRESETS,
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

export function applyAppearance({ accentColor, backgroundImage }: AppearanceSettings): void {
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
    root.style.setProperty('--launchpad-background-image', `url("${backgroundImage}")`)
    root.dataset.launchpadBackground = 'custom'
  } else {
    root.style.removeProperty('--launchpad-background-image')
    delete root.dataset.launchpadBackground
  }
}

export async function getSavedAppearance(): Promise<AppearanceSettings> {
  const [accentColor, backgroundImage] = await Promise.all([
    getSetting('themeAccentColor'),
    getSetting('launchpadBackgroundImage'),
  ])
  return { accentColor, backgroundImage }
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
