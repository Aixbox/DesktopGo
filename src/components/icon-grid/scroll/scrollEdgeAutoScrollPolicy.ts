export const EDGE_SCROLL_THRESHOLD_PX = 72
export const EDGE_SCROLL_MAX_SPEED_PX = 12

export const resolveVerticalEdgeScrollSpeed = (pointerY: number, top: number, bottom: number) => {
  if (pointerY < top + EDGE_SCROLL_THRESHOLD_PX) {
    const ratio = Math.min(
      1,
      (top + EDGE_SCROLL_THRESHOLD_PX - pointerY) / EDGE_SCROLL_THRESHOLD_PX
    )
    return -Math.max(1, Math.round(EDGE_SCROLL_MAX_SPEED_PX * ratio))
  }

  if (pointerY > bottom - EDGE_SCROLL_THRESHOLD_PX) {
    const ratio = Math.min(
      1,
      (pointerY - (bottom - EDGE_SCROLL_THRESHOLD_PX)) / EDGE_SCROLL_THRESHOLD_PX
    )
    return Math.max(1, Math.round(EDGE_SCROLL_MAX_SPEED_PX * ratio))
  }

  return 0
}
