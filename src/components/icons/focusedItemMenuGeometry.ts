import { getRoundedRectContour } from '../../lib/roundedRectContour'

export interface MenuRect {
  left: number
  top: number
  width: number
  height: number
}
export interface FocusedItemVisual extends MenuRect {
  radius: number
  exponent: number
  padding: number
}
export const ITEM_MENU_HIT_CLEARANCE = 14
export const ITEM_MENU_GAP = ITEM_MENU_HIT_CLEARANCE + 6
type MenuSide = 'right' | 'left' | 'bottom' | 'top'
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max))

/** Choose an entire side of the item, including its resize hit area, never the pointer point. */
export function placeItemMenu(
  item: MenuRect,
  viewport: MenuRect,
  size: { width: number; height: number }
) {
  const edge = 8
  const left = viewport.left + edge,
    top = viewport.top + edge
  const right = viewport.left + viewport.width - edge
  const bottom = viewport.top + viewport.height - edge
  const sides: { side: MenuSide; width: number; height: number }[] = [
    { side: 'right', width: right - item.left - item.width - ITEM_MENU_GAP, height: bottom - top },
    { side: 'left', width: item.left - ITEM_MENU_GAP - left, height: bottom - top },
    {
      side: 'bottom',
      width: right - left,
      height: bottom - item.top - item.height - ITEM_MENU_GAP,
    },
    { side: 'top', width: right - left, height: item.top - ITEM_MENU_GAP - top },
  ]
  const area = (entry: (typeof sides)[number]) =>
    Math.max(0, Math.min(size.width, entry.width)) *
    Math.max(0, Math.min(size.height, entry.height))
  const chosen =
    sides.find(entry => entry.width >= size.width && entry.height >= size.height) ??
    sides.reduce((best, entry) => (area(entry) > area(best) ? entry : best))
  const width = Math.max(1, Math.min(size.width, chosen.width))
  const height = Math.max(1, Math.min(size.height, chosen.height))
  const horizontal = chosen.side === 'right' || chosen.side === 'left'
  const x =
    chosen.side === 'right'
      ? item.left + item.width + ITEM_MENU_GAP
      : chosen.side === 'left'
        ? item.left - ITEM_MENU_GAP - width
        : clamp(item.left, left, right - width)
  const y =
    chosen.side === 'bottom'
      ? item.top + item.height + ITEM_MENU_GAP
      : chosen.side === 'top'
        ? item.top - ITEM_MENU_GAP - height
        : clamp(item.top, top, bottom - height)
  return {
    side: chosen.side,
    width,
    height,
    x,
    y,
    alignOffset: horizontal ? y - item.top : x - item.left,
  }
}

/** One clipped backdrop keeps the real tile and its pointer-capture target in place. */
export function itemFocusBackdropClip(visual: FocusedItemVisual, viewport: MenuRect) {
  const cutout = getFocusVisualContour(visual)
    .map(
      point => `${(point.x - viewport.left).toFixed(4)}px ${(point.y - viewport.top).toFixed(4)}px`
    )
    .join(', ')
  return `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${cutout})`
}

export function getFocusVisualContour(visual: FocusedItemVisual) {
  const { padding } = visual
  return getRoundedRectContour({
    width: visual.width + padding * 2,
    height: visual.height + padding * 2,
    radius: visual.radius + padding,
    exponent: visual.exponent,
  }).map(point => ({ x: visual.left - padding + point.x, y: visual.top - padding + point.y }))
}

export function isPointInFocusVisual(visual: FocusedItemVisual, x: number, y: number) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false
  const { padding } = visual
  const width = visual.width + padding * 2,
    height = visual.height + padding * 2
  const localX = x - visual.left + padding,
    localY = y - visual.top + padding
  if (localX < 0 || localY < 0 || localX > width || localY > height) return false
  const radius = Math.min(visual.radius + padding, width / 2, height / 2)
  if (radius <= 0) return true
  const dx = Math.max(radius - localX, localX - (width - radius), 0)
  const dy = Math.max(radius - localY, localY - (height - radius), 0)
  return (dx / radius) ** visual.exponent + (dy / radius) ** visual.exponent <= 1
}
