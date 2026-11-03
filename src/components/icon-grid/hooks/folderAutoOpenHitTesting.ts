import type { GridItem, HoverZone } from '../model'
import type { DragState, OuterOverlapHit } from '../state/types'
import { readFocusedItemVisual } from '../../icons/focusedItemVisual'
import { isPointInFocusVisual } from '../../icons/focusedItemMenuGeometry'

export const FOLDER_AUTO_OPEN_AREA_RATIO = 0.75

/** Use the actual rounded surface, aligned to its stable layout position during evasion. */
export function resolveFolderAutoOpenHit({
  state,
  hit,
  target,
  node,
  point = { x: state.pointerX, y: state.pointerY },
  hitRectIsTile = false,
}: {
  state: DragState
  hit: OuterOverlapHit | null
  target: GridItem | undefined
  node: HTMLElement | undefined
  point?: { x: number; y: number }
  hitRectIsTile?: boolean
}): OuterOverlapHit | null {
  if (
    !hit ||
    target?.kind !== 'folder' ||
    state.context !== 'outer' ||
    state.draggingItem.kind !== 'icon' ||
    state.draggingIds.length !== 1 ||
    !node?.querySelector('[data-folder-body-hitbox]')
  )
    return hit

  const visual = readFocusedItemVisual(node)
  // Paged multi-cell hits already describe the surface; compact hits describe the whole tile.
  const reference = hitRectIsTile || target.size === '1x1' ? node.getBoundingClientRect() : visual
  const ratio = FOLDER_AUTO_OPEN_AREA_RATIO
  const area = {
    ...visual,
    left: hit.targetRect.left + visual.left - reference.left + (visual.width * (1 - ratio)) / 2,
    top: hit.targetRect.top + visual.top - reference.top + (visual.height * (1 - ratio)) / 2,
    width: visual.width * ratio,
    height: visual.height * ratio,
    radius: visual.radius * ratio,
  }
  const dx = point.x - (area.left + area.width / 2)
  const dy = point.y - (area.top + area.height / 2)
  const zone: HoverZone = isPointInFocusVisual(area, point.x, point.y)
    ? 'center'
    : Math.abs(dx) >= Math.abs(dy)
      ? dx < 0
        ? 'left'
        : 'right'
      : dy < 0
        ? 'up'
        : 'down'
  return { ...hit, zone }
}
