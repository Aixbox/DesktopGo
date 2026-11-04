import { resolveIconColor } from './iconColors'

export type TextIconColor = 'black' | 'white'

/** 历史图标没有独立文字色时，沿用原先根据背景选择的明暗方向。 */
export function resolveTextIconColor(value: unknown, background?: unknown): TextIconColor {
  if (value === 'black' || value === 'white') return value
  return resolveIconColor(background).foreground === '#FFFFFF' ? 'white' : 'black'
}

export const TEXT_ICON_COLORS: Record<TextIconColor, string> = {
  black: '#000000',
  white: '#FFFFFF',
}
