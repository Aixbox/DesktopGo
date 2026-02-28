import type { EvasionDirection } from '../model'
import type { DragHit, DragState, OuterOverlapHit } from '../state/types'
import { classifyZone, clampNumber, getRectArea, getRectIntersection } from './geometry'
import {
  DRAG_HOLE_ID,
  findNearestEmptyOnPageByManhattan,
  getPageCountBySlots,
  getPageStartBySlotIndex,
} from './slots'
import {
  applyDirectionalShift,
  evaluateDirectionalEvasion,
  resolveEvasionDirectionCandidates,
} from './evasionPolicy'

export interface DragGridMetrics {
  gridElement: HTMLElement | null
  columns: number
  rows: number
  itemWidth: number
  itemHeight: number
  pageOffset: number
}

export const findHitByMetrics = (
  state: DragState,
  x: number,
  y: number,
  metrics: DragGridMetrics,
  gridGap: number
): DragHit | null => {
  const {
    gridElement,
    columns: colCount,
    rows: rowCount,
    itemWidth: tileW,
    itemHeight: tileH,
    pageOffset,
  } = metrics
  if (!gridElement || colCount <= 0 || rowCount <= 0) return null

  const rect = gridElement.getBoundingClientRect()
  if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null

  const stepX = tileW + gridGap
  const stepY = tileH + gridGap
  if (stepX <= 0 || stepY <= 0) return null

  const relX = x - rect.left
  const relY = y - rect.top
  const col = Math.floor(relX / stepX)
  const row = Math.floor(relY / stepY)
  if (col < 0 || col >= colCount || row < 0 || row >= rowCount) return null

  const localX = relX - col * stepX
  const localY = relY - row * stepY
  if (localX < 0 || localX > tileW || localY < 0 || localY > tileH) return null

  const slotIndex = row * colCount + col
  const globalSlotIndex = pageOffset + slotIndex
  if (globalSlotIndex < 0 || globalSlotIndex >= state.workingOrder.length) return null
  const rawTargetId = state.workingOrder[globalSlotIndex]
  const targetId =
    !rawTargetId || rawTargetId === DRAG_HOLE_ID || rawTargetId === state.draggingId ? null : rawTargetId

  const targetRect = new DOMRect(rect.left + col * stepX, rect.top + row * stepY, tileW, tileH)
  return { targetId, zone: classifyZone(targetRect, x, y), globalSlotIndex }
}

export const resolveNearestSlotIndexByMetrics = (
  state: DragState,
  metrics: DragGridMetrics,
  gridGap: number,
  options?: { allowOutside?: boolean }
): number | null => {
  const {
    gridElement,
    columns: colCount,
    rows: rowCount,
    itemWidth: tileW,
    itemHeight: tileH,
    pageOffset,
  } = metrics
  if (!gridElement || state.workingOrder.length <= 0) return null

  const rect = gridElement.getBoundingClientRect()
  if (
    state.pointerX < rect.left ||
    state.pointerX > rect.right ||
    state.pointerY < rect.top ||
    state.pointerY > rect.bottom
  ) {
    if (!options?.allowOutside) return null
  }
  const stepX = tileW + gridGap
  const stepY = tileH + gridGap
  if (stepX <= 0 || stepY <= 0 || colCount <= 0 || rowCount <= 0) {
    return null
  }

  const clampedX = clampNumber(state.pointerX, rect.left, rect.right)
  const clampedY = clampNumber(state.pointerY, rect.top, rect.bottom)
  const col = clampNumber(Math.round((clampedX - rect.left - tileW / 2) / stepX), 0, Math.max(0, colCount - 1))
  const row = clampNumber(Math.round((clampedY - rect.top - tileH / 2) / stepY), 0, Math.max(0, rowCount - 1))
  const slotIndex = row * colCount + col
  const globalSlotIndex = clampNumber(pageOffset + slotIndex, 0, Math.max(0, state.workingOrder.length - 1))
  return globalSlotIndex
}

interface FindOuterMaxOverlapHitParams {
  state: DragState
  gridElement: HTMLElement | null
  columns: number
  rows: number
  iconImageSize: number
  pageSize: number
  currentPage: number
  tileRefs: Map<string, HTMLDivElement>
}

const resolveOverlapTargetRect = (node: HTMLDivElement): DOMRect => {
  const iconImage = node.querySelector<HTMLElement>('.icon-image')
  if (iconImage) return iconImage.getBoundingClientRect()
  return node.getBoundingClientRect()
}

export const findOuterMaxOverlapHitByMetrics = ({
  state,
  gridElement,
  columns,
  rows,
  iconImageSize,
  pageSize,
  currentPage,
  tileRefs,
}: FindOuterMaxOverlapHitParams): OuterOverlapHit | null => {
  if (state.context !== 'outer') return null
  if (!gridElement || columns <= 0 || rows <= 0) return null

  const dragRect = new DOMRect(
    state.pointerX - iconImageSize / 2,
    state.pointerY - iconImageSize / 2,
    iconImageSize,
    iconImageSize
  )
  const dragArea = getRectArea(dragRect)
  if (dragArea <= 0) return null

  const safePageSize = Math.max(1, pageSize)
  const pageCount = getPageCountBySlots(state.workingOrder, safePageSize)
  const activePage = clampNumber(currentPage, 0, Math.max(0, pageCount - 1))
  const pageStart = activePage * safePageSize
  const pageEnd = pageStart + safePageSize

  let best: OuterOverlapHit | null = null
  for (let index = pageStart; index < pageEnd; index += 1) {
    if (index < 0 || index >= state.workingOrder.length) continue
    const rawTargetId = state.workingOrder[index]
    if (!rawTargetId || rawTargetId === DRAG_HOLE_ID || rawTargetId === state.draggingId) continue
    const targetId = rawTargetId
    const node = tileRefs.get(targetId)
    if (!node) continue
    const targetRect = resolveOverlapTargetRect(node)
    const overlapRect = getRectIntersection(dragRect, targetRect)
    if (!overlapRect) continue
    const intersectionArea = getRectArea(overlapRect)
    if (intersectionArea <= 0) continue
    const targetArea = getRectArea(targetRect)
    const unionArea = dragArea + targetArea - intersectionArea
    if (unionArea <= 0) continue
    const iou = intersectionArea / unionArea
    const targetCenterX = targetRect.left + targetRect.width / 2
    const targetCenterY = targetRect.top + targetRect.height / 2
    const centerManhattanDistance =
      Math.abs(state.pointerX - targetCenterX) + Math.abs(state.pointerY - targetCenterY)
    const candidate: OuterOverlapHit = {
      targetId,
      targetIndex: index,
      targetRect,
      overlapRect,
      iou,
      intersectionArea,
      centerManhattanDistance,
      zone: classifyZone(targetRect, state.pointerX, state.pointerY),
    }
    if (!best) {
      best = candidate
      continue
    }
    if (candidate.iou > best.iou) {
      best = candidate
      continue
    }
    if (candidate.iou < best.iou) continue
    if (candidate.intersectionArea > best.intersectionArea) {
      best = candidate
      continue
    }
    if (candidate.intersectionArea < best.intersectionArea) continue
    if (candidate.centerManhattanDistance < best.centerManhattanDistance) {
      best = candidate
      continue
    }
    if (candidate.centerManhattanDistance > best.centerManhattanDistance) continue
    if (candidate.targetIndex < best.targetIndex) best = candidate
  }

  return best
}

export const applyOuterEvasionPolicy = (
  order: Array<string | null>,
  hit: OuterOverlapHit,
  pageSize: number,
  columns: number,
  directionTieBreakByOverlap: boolean
): { order: Array<string | null>; direction: EvasionDirection | null } => {
  const safePageSize = Math.max(1, pageSize)
  const safeColumns = Math.max(1, columns)
  const pageStart = getPageStartBySlotIndex(hit.targetIndex, safePageSize)
  const directions = resolveEvasionDirectionCandidates(hit.overlapRect, hit.targetRect)
  const evaluated = directions.candidates.map(direction =>
    evaluateDirectionalEvasion(order, hit.targetIndex, direction, pageStart, safePageSize, safeColumns)
  )
  const feasible = evaluated.filter(item => item.emptyIndex !== null)
  if (feasible.length > 0) {
    feasible.sort((a, b) => {
      if (b.releaseScore !== a.releaseScore) return b.releaseScore - a.releaseScore
      if (directionTieBreakByOverlap && a.axis !== b.axis) {
        if (a.axis === directions.preferredAxis) return -1
        if (b.axis === directions.preferredAxis) return 1
      }
      const priority: EvasionDirection[] = ['left', 'up', 'right', 'down']
      return priority.indexOf(a.direction) - priority.indexOf(b.direction)
    })
    const chosen = feasible[0]
    if (chosen && chosen.emptyIndex !== null) {
      return {
        order: applyDirectionalShift(order, hit.targetIndex, chosen.emptyIndex, chosen.direction, safeColumns),
        direction: chosen.direction,
      }
    }
  }

  const fallbackIndex = findNearestEmptyOnPageByManhattan(
    order,
    pageStart,
    safePageSize,
    safeColumns,
    hit.targetIndex
  )
  if (fallbackIndex === null) return { order, direction: null }
  const next = [...order]
  next[fallbackIndex] = next[hit.targetIndex]
  next[hit.targetIndex] = null
  return { order: next, direction: null }
}
