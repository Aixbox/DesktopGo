import type { HoverZone } from '../model'

const CENTER_RATIO = 0.45

export const classifyZone = (rect: DOMRect, x: number, y: number): HoverZone => {
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  const dx = x - centerX
  const dy = y - centerY
  const halfW = (rect.width * CENTER_RATIO) / 2
  const halfH = (rect.height * CENTER_RATIO) / 2

  if (Math.abs(dx) <= halfW && Math.abs(dy) <= halfH) return 'center'
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'left' : 'right'
  return dy < 0 ? 'up' : 'down'
}

export const clampNumber = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

export const getRectArea = (rect: DOMRect): number =>
  Math.max(0, rect.width) * Math.max(0, rect.height)

export const getRectIntersection = (a: DOMRect, b: DOMRect): DOMRect | null => {
  const left = Math.max(a.left, b.left)
  const top = Math.max(a.top, b.top)
  const right = Math.min(a.right, b.right)
  const bottom = Math.min(a.bottom, b.bottom)
  const width = right - left
  const height = bottom - top
  if (width <= 0 || height <= 0) return null
  return new DOMRect(left, top, width, height)
}
