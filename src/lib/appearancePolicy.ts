export const DEFAULT_THEME_ACCENT_COLOR = ''
export const MAX_BACKGROUND_DATA_URI_LENGTH = 1_600_000

export const THEME_ACCENT_PRESETS = [
  '#2563eb',
  '#0f766e',
  '#4f46e5',
  '#a21caf',
  '#be123c',
  '#c2410c',
] as const

export function normalizeThemeAccentColor(value: string): string | null {
  const normalized = value.trim().toLowerCase()
  if (!/^#[0-9a-f]{6}$/.test(normalized)) return null
  return normalized
}

export function isLaunchpadBackgroundDataUri(value: string): boolean {
  return (
    value.length <= MAX_BACKGROUND_DATA_URI_LENGTH &&
    /^data:image\/(?:jpeg|png|webp);base64,/i.test(value)
  )
}

function parseHexColor(color: string): [number, number, number] {
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ]
}

function toLinearChannel(value: number): number {
  const channel = value / 255
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

export function getAccentForegroundColor(color: string): '#ffffff' | '#111827' {
  const normalized = normalizeThemeAccentColor(color)
  if (!normalized) return '#ffffff'
  const [red, green, blue] = parseHexColor(normalized)
  const luminance =
    0.2126 * toLinearChannel(red) + 0.7152 * toLinearChannel(green) + 0.0722 * toLinearChannel(blue)
  const whiteContrast = 1.05 / (luminance + 0.05)
  const darkContrast = (luminance + 0.05) / 0.057
  return whiteContrast >= darkContrast ? '#ffffff' : '#111827'
}

export type AccentPalette = {
  selectedForegroundLight: string
  selectedForegroundDark: string
}

function getOklchComponents(color: string): { chroma: number; hue: number } | null {
  const normalized = normalizeThemeAccentColor(color)
  if (!normalized) return null
  const [red, green, blue] = parseHexColor(normalized).map(toLinearChannel)
  const long = 0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue
  const medium = 0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue
  const short = 0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue
  const longRoot = Math.cbrt(long)
  const mediumRoot = Math.cbrt(medium)
  const shortRoot = Math.cbrt(short)
  const a = 1.9779984951 * longRoot - 2.428592205 * mediumRoot + 0.4505937099 * shortRoot
  const b = 0.0259040371 * longRoot + 0.7827717662 * mediumRoot - 0.808675766 * shortRoot
  const chroma = Math.sqrt(a * a + b * b)
  const hue = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360
  return { chroma, hue }
}

function formatOklch(lightness: number, chroma: number, hue: number): string {
  return `oklch(${lightness.toFixed(3)} ${chroma.toFixed(3)} ${hue.toFixed(1)})`
}

export function deriveAccentPalette(color: string): AccentPalette | null {
  const components = getOklchComponents(color)
  if (!components) return null
  return {
    selectedForegroundLight: formatOklch(0.42, Math.min(components.chroma, 0.16), components.hue),
    selectedForegroundDark: formatOklch(
      0.82,
      Math.min(components.chroma * 0.72, 0.12),
      components.hue
    ),
  }
}

function channelToHex(value: number): string {
  return Math.round(value).toString(16).padStart(2, '0')
}

function normalizeExtractedRgb(red: number, green: number, blue: number): string {
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const lightness = (max + min) / 510
  const targetLightness = Math.min(0.62, Math.max(0.36, lightness))
  if (Math.abs(lightness - targetLightness) < 0.01) {
    return `#${channelToHex(red)}${channelToHex(green)}${channelToHex(blue)}`
  }
  const scale = targetLightness / Math.max(lightness, 0.01)
  return `#${channelToHex(Math.min(255, red * scale))}${channelToHex(
    Math.min(255, green * scale)
  )}${channelToHex(Math.min(255, blue * scale))}`
}

export function extractAccentColorFromPixels(pixels: Uint8ClampedArray): string | null {
  const buckets = new Map<string, { score: number; red: number; green: number; blue: number }>()

  for (let index = 0; index + 3 < pixels.length; index += 4) {
    const alpha = pixels[index + 3]
    if (alpha < 160) continue
    const red = pixels[index]
    const green = pixels[index + 1]
    const blue = pixels[index + 2]
    const max = Math.max(red, green, blue)
    const min = Math.min(red, green, blue)
    const saturation = max === 0 ? 0 : (max - min) / max
    const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255
    if (saturation < 0.2 || luminance < 0.1 || luminance > 0.9) continue

    const key = `${Math.round(red / 32)}-${Math.round(green / 32)}-${Math.round(blue / 32)}`
    const score = saturation * (1 - Math.min(0.8, Math.abs(luminance - 0.5)))
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.score += score
      bucket.red += red * score
      bucket.green += green * score
      bucket.blue += blue * score
    } else {
      buckets.set(key, {
        score,
        red: red * score,
        green: green * score,
        blue: blue * score,
      })
    }
  }

  const best = [...buckets.values()].sort((left, right) => right.score - left.score)[0]
  if (!best) return null
  return normalizeExtractedRgb(
    best.red / best.score,
    best.green / best.score,
    best.blue / best.score
  )
}
