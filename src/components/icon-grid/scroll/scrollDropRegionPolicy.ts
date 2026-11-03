import type { PageAnchorEntry } from '../domain/topLevelLayout'

export const SCROLL_ICON_REORDER_EDGE_RATIO = 0.2
export const SCROLL_ICON_REORDER_OUTSET_PX = 8

type Direction = 'left' | 'right' | 'up' | 'down'

/** Use logical footprints: scrolling and neighbor animations cannot reverse the approach. */
export function resolveScrollReorderDirection(
  source: PageAnchorEntry | undefined,
  target: PageAnchorEntry | undefined
): Direction | null {
  if (!source || !target) return null
  const dx = target.col + target.span.cols / 2 - source.col - source.span.cols / 2
  const dy = target.row + target.span.rows / 2 - source.row - source.span.rows / 2
  if (dx === 0 && dy === 0) return null
  return Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down'
}

/** Three edges override merging; only the edge facing the source protects the approach. */
export function resolveScrollIconDropRegion(
  point: { x: number; y: number },
  rect: { left: number; top: number; width: number; height: number },
  direction: Direction | null
): 'center' | 'edge' | 'approach' | null {
  if (!direction || rect.width <= 0 || rect.height <= 0) return null
  const x = (point.x - rect.left) / rect.width
  const y = (point.y - rect.top) / rect.height
  const edge = SCROLL_ICON_REORDER_EDGE_RATIO
  // Keep exact boundaries stable after fractional scaling and large scroll offsets.
  const epsilon = 1e-9
  if (
    x >= edge - epsilon &&
    x <= 1 - edge + epsilon &&
    y >= edge - epsilon &&
    y <= 1 - edge + epsilon
  )
    return 'center'
  const horizontal = direction === 'left' || direction === 'right'
  const across = horizontal ? y : x
  const along = horizontal ? x : y
  const progress = direction === 'left' || direction === 'up' ? 1 - along : along
  // Assign corners to their nearest normalized edge; ties protect the near side.
  // Overlap hits may extend beyond 8px; the separate no-overlap fallback is capped at 8px.
  const nearestOtherEdge = Math.min(1 - progress, across, 1 - across)
  return progress < edge - epsilon && progress <= nearestOtherEdge + epsilon ? 'approach' : 'edge'
}
