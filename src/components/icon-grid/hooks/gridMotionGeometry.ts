interface GridMotionRect {
  left: number
  top: number
  width: number
  height: number
}

/** Converts a viewport rect measured during centered grid scaling to its scale-1 position. */
export function resolveRectAtUnitScale(
  rect: GridMotionRect,
  transformedGridRect: GridMotionRect,
  scaleX: number,
  scaleY: number
): GridMotionRect {
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) {
    return rect
  }

  const originX = transformedGridRect.left + transformedGridRect.width / 2
  const originY = transformedGridRect.top + transformedGridRect.height / 2

  return {
    left: originX + (rect.left - originX) / scaleX,
    top: originY + (rect.top - originY) / scaleY,
    width: rect.width / scaleX,
    height: rect.height / scaleY,
  }
}

/** Reads a grid item position as if its edit-mode scale transition had finished. */
export function resolveUnscaledGridRect(node: HTMLElement): GridMotionRect {
  const rect = node.getBoundingClientRect()
  const motionGrid = node.closest<HTMLElement>('.launchpad-edit-grid-motion')
  if (!motionGrid) return rect

  const transform = window.getComputedStyle(motionGrid).transform
  if (!transform || transform === 'none') return rect

  try {
    const matrix = new DOMMatrixReadOnly(transform)
    if (!matrix.is2D) return rect

    return resolveRectAtUnitScale(
      rect,
      motionGrid.getBoundingClientRect(),
      Math.hypot(matrix.a, matrix.b),
      Math.hypot(matrix.c, matrix.d)
    )
  } catch {
    return rect
  }
}
