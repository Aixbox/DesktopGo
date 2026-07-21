import type { EvasionDirection, HoverZone } from '../model'
import { clampNumber } from './geometry'
import { DRAG_HOLE_ID, getSlotRowColWithinPage, isVacantSlot } from './slots'

export const getEvasionIntentSignature = (targetId: string, zone: HoverZone) =>
  `${targetId}:${zone}`

export const getEvasionReadyDelay = ({
  now,
  dwellStartedAt,
  dwellMs,
  lastEvasionAt,
  cooldownMs,
}: {
  now: number
  dwellStartedAt: number
  dwellMs: number
  lastEvasionAt: number | null
  cooldownMs: number
}) => {
  const dwellRemaining = Math.max(0, dwellMs - (now - dwellStartedAt))
  const cooldownRemaining =
    lastEvasionAt === null ? 0 : Math.max(0, cooldownMs - (now - lastEvasionAt))
  return Math.ceil(Math.max(dwellRemaining, cooldownRemaining))
}

const collectDirectionalIndices = (
  targetIndex: number,
  direction: EvasionDirection,
  pageStart: number,
  pageSize: number,
  columns: number
): number[] => {
  const safeColumns = Math.max(1, columns)
  const pageEnd = pageStart + Math.max(1, pageSize)
  const targetPos = getSlotRowColWithinPage(targetIndex, pageStart, safeColumns)
  const rowStart = pageStart + targetPos.row * safeColumns
  const rowEndExclusive = Math.min(pageEnd, rowStart + safeColumns)
  const indices: number[] = []

  if (direction === 'left') {
    for (let index = targetIndex - 1; index >= rowStart; index -= 1) indices.push(index)
    return indices
  }

  if (direction === 'right') {
    for (let index = targetIndex + 1; index < rowEndExclusive; index += 1) indices.push(index)
    return indices
  }

  if (direction === 'up') {
    for (let index = targetIndex - safeColumns; index >= pageStart; index -= safeColumns) {
      indices.push(index)
    }
    return indices
  }

  for (let index = targetIndex + safeColumns; index < pageEnd; index += safeColumns) {
    indices.push(index)
  }
  return indices
}

export interface DirectionalEvasionCandidate {
  direction: EvasionDirection
  axis: 'horizontal' | 'vertical'
  emptyIndex: number | null
  releaseScore: number
}

export const evaluateDirectionalEvasion = (
  slots: Array<string | null>,
  targetIndex: number,
  direction: EvasionDirection,
  pageStart: number,
  pageSize: number,
  columns: number
): DirectionalEvasionCandidate => {
  const indices = collectDirectionalIndices(targetIndex, direction, pageStart, pageSize, columns)
  const emptyCount = indices.reduce(
    (count, index) => (isVacantSlot(slots[index]) ? count + 1 : count),
    0
  )
  const emptyIndex = indices.find(index => isVacantSlot(slots[index])) ?? null
  const releaseScore = emptyCount * 100 + indices.length
  return {
    direction,
    axis: direction === 'left' || direction === 'right' ? 'horizontal' : 'vertical',
    emptyIndex,
    releaseScore,
  }
}

export const resolveEvasionDirectionCandidates = (
  overlapRect: DOMRect,
  targetRect: DOMRect
): { candidates: EvasionDirection[]; preferredAxis: 'horizontal' | 'vertical' } => {
  const overlapCenterX = overlapRect.left + overlapRect.width / 2
  const overlapCenterY = overlapRect.top + overlapRect.height / 2
  const targetCenterX = targetRect.left + targetRect.width / 2
  const targetCenterY = targetRect.top + targetRect.height / 2
  const dx = overlapCenterX - targetCenterX
  const dy = overlapCenterY - targetCenterY
  const horizontal: EvasionDirection = dx >= 0 ? 'left' : 'right'
  const vertical: EvasionDirection = dy >= 0 ? 'up' : 'down'
  const horizontalDominant = Math.abs(dx) >= Math.abs(dy)
  const preferredAxis = horizontalDominant ? 'horizontal' : 'vertical'
  const ordered = horizontalDominant ? [horizontal, vertical] : [vertical, horizontal]
  return {
    candidates: Array.from(new Set(ordered)),
    preferredAxis,
  }
}

export const applyDirectionalShift = (
  slots: Array<string | null>,
  targetIndex: number,
  emptyIndex: number,
  direction: EvasionDirection,
  columns: number
): Array<string | null> => {
  const safeColumns = Math.max(1, columns)
  const step =
    direction === 'left'
      ? -1
      : direction === 'right'
        ? 1
        : direction === 'up'
          ? -safeColumns
          : safeColumns
  const next = [...slots]
  const vacancy = next[emptyIndex] ?? null
  for (let index = emptyIndex; index !== targetIndex; index -= step) {
    next[index] = next[index - step]
  }
  next[targetIndex] = vacancy
  return next
}

export const moveDragHoleToIndex = (
  order: Array<string | null>,
  targetIndex: number
): Array<string | null> => {
  const holeIndex = order.indexOf(DRAG_HOLE_ID)
  if (holeIndex < 0) return order
  const boundedIndex = clampNumber(targetIndex, 0, order.length - 1)
  if (boundedIndex === holeIndex) return order

  const next = [...order]
  next.splice(holeIndex, 1)
  const insertIndex = clampNumber(boundedIndex, 0, next.length)
  next.splice(insertIndex, 0, DRAG_HOLE_ID)
  return next
}
