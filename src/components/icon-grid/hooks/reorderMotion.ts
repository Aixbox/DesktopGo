import { REORDER_ANIMATION_MS } from '../constants'

const MAX_REORDER_DURATION_MULTIPLIER = 1.75

/** Keep short moves familiar and give long reflows enough time to travel. */
export const getReorderAnimationDuration = (
  deltaX: number,
  deltaY: number,
  referenceDistance: number
) => {
  const distance = Math.hypot(deltaX, deltaY)
  if (!Number.isFinite(distance) || distance <= 0) return REORDER_ANIMATION_MS
  const safeReferenceDistance = Number.isFinite(referenceDistance)
    ? Math.max(1, referenceDistance)
    : 1
  const multiplier = Math.min(
    MAX_REORDER_DURATION_MULTIPLIER,
    Math.max(1, Math.sqrt(distance / safeReferenceDistance))
  )
  return Math.round(REORDER_ANIMATION_MS * multiplier)
}

/** Reads the current transform offset so an interrupted reflow can continue from its visible pose. */
export function readCurrentTranslate(node: HTMLElement | undefined): { x: number; y: number } {
  if (!node) return { x: 0, y: 0 }
  const transform = window.getComputedStyle(node).transform
  if (!transform || transform === 'none') return { x: 0, y: 0 }

  try {
    const matrix = new DOMMatrixReadOnly(transform)
    return {
      x: Number.isFinite(matrix.m41) ? matrix.m41 : 0,
      y: Number.isFinite(matrix.m42) ? matrix.m42 : 0,
    }
  } catch {
    return { x: 0, y: 0 }
  }
}
