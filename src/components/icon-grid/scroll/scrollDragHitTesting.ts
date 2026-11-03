import type { GridItem } from '../model'
import { getGridItemSpan } from '../model'
import type { DragState, OuterOverlapHit } from '../state/types'
import type { PageAnchorEntry } from '../domain/topLevelLayout'
import { classifyZone } from '../domain/geometry'
import {
  findOuterMaxOverlapHitByMetrics,
  resolveOverlapTargetRect,
  resolveStableOverlapTargetRect,
} from '../domain/dragMovePolicy'
import { resolveScrollGroupHitLayout } from './scrollGroupHitLayout'
import {
  resolveScrollIconDropRegion,
  resolveScrollReorderDirection,
  SCROLL_ICON_REORDER_OUTSET_PX,
} from './scrollDropRegionPolicy'

interface ScrollGroupHitParams {
  state: DragState
  gridElement: HTMLElement | null
  columns: number
  itemWidth: number
  itemHeight: number
  gridGap: number
  iconImageSize: number
  items: GridItem[]
  tileRefs: Map<string, HTMLDivElement>
}

function resolveDragSurfaceSize(params: ScrollGroupHitParams, scale: number) {
  const { state, tileRefs, iconImageSize, itemWidth, itemHeight, gridGap } = params
  const span = getGridItemSpan(state.draggingItem)
  const smallIcon = state.draggingItem.kind === 'icon' && span.cols === 1 && span.rows === 1
  const sourceNode = tileRefs.get(state.draggingId)
  const sourceSurface =
    state.draggingItem.kind === 'icon' && !smallIcon && sourceNode
      ? resolveOverlapTargetRect(sourceNode)
      : null
  // Icon ghosts render just their surface, without the title/padding footprint.
  // They live outside the scaled grid, so convert source dimensions back to CSS pixels.
  const dragWidth = sourceSurface
    ? sourceSurface.width / scale
    : smallIcon
      ? iconImageSize
      : span.cols * itemWidth + (span.cols - 1) * gridGap
  const dragHeight = sourceSurface
    ? sourceSurface.height / scale
    : smallIcon
      ? iconImageSize
      : span.rows * itemHeight + (span.rows - 1) * gridGap
  return { dragWidth, dragHeight }
}

export function findScrollGroupOverlapHit(params: ScrollGroupHitParams): OuterOverlapHit | null {
  const { state, gridElement, columns, itemWidth, itemHeight, gridGap, items, tileRefs } = params
  const order = state.scrollGroupOrder
  if (!order || order.length === 0 || !gridElement) return null
  const safeColumns = Math.max(1, columns)
  const { entries, rowCount } = resolveScrollGroupHitLayout(items, order, safeColumns)
  const slots = Array<string | null>(rowCount * safeColumns).fill(null)
  const draggedIds = new Set(state.draggingIds)
  const gridRect = gridElement.getBoundingClientRect()
  const scale = gridElement.offsetWidth > 0 ? gridRect.width / gridElement.offsetWidth : 1
  const { dragWidth, dragHeight } = resolveDragSurfaceSize(params, scale)
  entries.forEach(entry => {
    if (draggedIds.has(entry.id)) return
    const left = gridRect.left + entry.col * (itemWidth + gridGap) * scale
    const top = gridRect.top + entry.row * (itemHeight + gridGap) * scale
    const width = (entry.span.cols * (itemWidth + gridGap) - gridGap) * scale
    const height = (entry.span.rows * (itemHeight + gridGap) - gridGap) * scale
    // Reject distant footprints before the shared hit test measures DOM surfaces.
    if (Math.abs(state.pointerX - left - width / 2) > (width + dragWidth) / 2 + gridGap) return
    if (Math.abs(state.pointerY - top - height / 2) > (height + dragHeight) / 2 + gridGap) return
    slots[entry.globalIndex] = entry.id
  })
  // The rendered ghost follows the pointer center. Reuse paged visual rectangles and
  // stable layout anchors so pointer-down offsets and FLIP motion cannot shift the hit area.
  const hit = findOuterMaxOverlapHitByMetrics({
    state: { ...state, workingOrder: slots },
    gridElement,
    columns: safeColumns,
    rows: rowCount,
    itemWidth: itemWidth * scale,
    itemHeight: itemHeight * scale,
    gridGap: gridGap * scale,
    dragWidth,
    dragHeight,
    pageSize: slots.length,
    currentPage: 0,
    tileRefs,
    items,
  })
  // Compact ordering consumes an item index, while the shared hit test consumes cell anchors.
  const selected =
    hit ??
    findScrollEdgeHit({
      state,
      entries,
      gridRect,
      columns: safeColumns,
      itemWidth: itemWidth * scale,
      itemHeight: itemHeight * scale,
      gridGap: gridGap * scale,
      tileRefs,
    })
  if (!selected) return null
  return applyIconDropRegion(state, entries, {
    ...selected,
    targetIndex: order.indexOf(selected.targetId),
  })
}

function applyIconDropRegion(
  state: DragState,
  entries: PageAnchorEntry[],
  hit: OuterOverlapHit
): OuterOverlapHit {
  const target = entries.find(entry => entry.id === hit.targetId)
  if (target?.item.kind !== 'icon') return hit
  const direction = resolveScrollReorderDirection(
    entries.find(entry => entry.id === state.draggingId),
    target
  )
  const region = resolveScrollIconDropRegion(
    { x: state.pointerX, y: state.pointerY },
    hit.targetRect,
    direction
  )
  const span = getGridItemSpan(state.draggingItem)
  const pointerTargetsSurface =
    state.pointerX >= hit.targetRect.left &&
    state.pointerX <= hit.targetRect.right &&
    state.pointerY >= hit.targetRect.top &&
    state.pointerY <= hit.targetRect.bottom
  // A large ghost can cover neighbors while the pointer is in a different cell/gap.
  // Keep footprint reflow there; direction gating concerns the icon under the pointer.
  const directionalApproach = (span.cols === 1 && span.rows === 1) || pointerTargetsSurface
  return {
    ...hit,
    reorderOnly: region === 'edge',
    reorderBlocked:
      region === 'approach' &&
      directionalApproach &&
      state.draggingItem.kind === 'icon' &&
      state.draggingIds.length === 1,
  }
}

/** Accept the three reorder edges' outer 8px band without measuring distant cells. */
function findScrollEdgeHit({
  state,
  entries,
  gridRect,
  columns,
  itemWidth,
  itemHeight,
  gridGap,
  tileRefs,
}: Omit<ScrollGroupHitParams, 'gridElement' | 'items' | 'iconImageSize'> & {
  entries: PageAnchorEntry[]
  gridRect: DOMRect
}): OuterOverlapHit | null {
  const point = { x: state.pointerX, y: state.pointerY }
  const outset = SCROLL_ICON_REORDER_OUTSET_PX + 1e-6
  const source = entries.find(entry => entry.id === state.draggingId)
  const draggedIds = new Set(state.draggingIds)
  let best: OuterOverlapHit | null = null
  for (const entry of entries) {
    if (entry.item.kind !== 'icon' || draggedIds.has(entry.id)) continue
    const left = gridRect.left + entry.col * (itemWidth + gridGap)
    const top = gridRect.top + entry.row * (itemHeight + gridGap)
    const width = entry.span.cols * (itemWidth + gridGap) - gridGap
    const height = entry.span.rows * (itemHeight + gridGap) - gridGap
    if (
      point.x < left - outset ||
      point.x > left + width + outset ||
      point.y < top - outset ||
      point.y > top + height + outset
    )
      continue
    const targetRect = resolveStableOverlapTargetRect({
      node: tileRefs.get(entry.id),
      item: entry.item,
      anchorIndex: entry.globalIndex,
      pageStart: 0,
      columns,
      itemWidth,
      itemHeight,
      gridGap,
      gridRect,
    })
    if (
      point.x < targetRect.left - outset ||
      point.x > targetRect.right + outset ||
      point.y < targetRect.top - outset ||
      point.y > targetRect.bottom + outset ||
      resolveScrollIconDropRegion(
        point,
        targetRect,
        resolveScrollReorderDirection(source, entry)
      ) !== 'edge'
    )
      continue
    const distance =
      Math.abs(point.x - targetRect.left - targetRect.width / 2) +
      Math.abs(point.y - targetRect.top - targetRect.height / 2)
    if (best && best.centerManhattanDistance <= distance) continue
    best = {
      targetId: entry.id,
      targetIndex: entry.globalIndex,
      targetRect,
      overlapRect: new DOMRect(point.x, point.y, 0, 0),
      iou: 0,
      intersectionArea: 0,
      centerManhattanDistance: distance,
      zone: classifyZone(targetRect, point.x, point.y),
      reorderOnly: true,
    }
  }
  return best
}
