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
