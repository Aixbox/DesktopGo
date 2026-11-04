/** 图标背景使用明度适中、色相清晰的柔和预设；自定义色保留用户选择的原始 RGB。 */
export const ICON_COLOR_PRESETS = [
  { id: 'none', color: 'transparent', foreground: '#334155' },
  { id: 'ocean', color: '#638FD8', foreground: '#111827' },
  { id: 'cyan', color: '#48A6BD', foreground: '#111827' },
  { id: 'emerald', color: '#52AA85', foreground: '#111827' },
  { id: 'lime', color: '#91B354', foreground: '#111827' },
  { id: 'amber', color: '#DDA44D', foreground: '#111827' },
  { id: 'coral', color: '#DA7D6C', foreground: '#111827' },
  { id: 'pink', color: '#CB7BA1', foreground: '#111827' },
  { id: 'plum', color: '#9E80CC', foreground: '#111827' },
  { id: 'graphite', color: '#8597B0', foreground: '#111827' },
] as const

export type IconPresetColorId = (typeof ICON_COLOR_PRESETS)[number]['id']
export type CustomIconColor = `#${string}`
export type IconColorId = IconPresetColorId | CustomIconColor

export function isCustomIconColor(value: unknown): value is CustomIconColor {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
}

export function normalizeIconColor(value: unknown): IconColorId {
  if (typeof value !== 'string') return 'none'
  const normalized = value.trim()
  if (isCustomIconColor(normalized)) return normalized.toLowerCase() as CustomIconColor
  return ICON_COLOR_PRESETS.find(preset => preset.id === normalized)?.id ?? 'none'
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map(offset => {
    const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}

/** 文字和选中标记至少保持 4.5:1 的明暗对比。 */
export function getIconColorForeground(color: CustomIconColor): string {
  const backgroundLuminance = luminance(color)
  const dark = '#263244'
  const darkLuminance = luminance(dark)
  const darkContrast = (backgroundLuminance + 0.05) / (darkLuminance + 0.05)
  if (darkContrast >= 4.5) return dark
  const whiteContrast = 1.05 / (backgroundLuminance + 0.05)
  return whiteContrast >= 4.5 ? '#FFFFFF' : '#000000'
}

export function resolveIconColor(value: unknown): {
  id: IconColorId
  color: string
  foreground: string
} {
  const id = normalizeIconColor(value)
  if (isCustomIconColor(id)) return { id, color: id, foreground: getIconColorForeground(id) }
  return ICON_COLOR_PRESETS.find(preset => preset.id === id) ?? ICON_COLOR_PRESETS[0]
}
