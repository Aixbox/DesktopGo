import type { EvasionDirection, HoverZone } from '../model'
import { clampNumber } from './geometry'
import { areSlotsEqual, DRAG_HOLE_ID, getSlotRowColWithinPage, isVacantSlot } from './slots'

export const getEvasionIntentSignature = (
  targetId: string,
  zone: HoverZone,
  targetIndex?: number | null
) => (targetIndex == null ? `${targetId}:${zone}` : `cell:${targetIndex}`)

export interface EvasionPreviewState {
  workingOrder: Array<string | null>
  pointerX: number
  pointerY: number
  lastEvasionSignature: string | null
  lastEvasionTriggerPointer: { x: number; y: number } | null
  lastEvasionAt: number | null
  hoverTargetId: string | null
  hoverTargetIndex?: number | null
  hoverZone: HoverZone | null
  hoverIou: number
  folderPreviewTargetId: string | null
  dockPreviewIndex: number | null
  dwellStartedAt: number | null
  evasionBaseOrder?: Array<string | null> | null
  centerStartedAt?: number | null
}

export interface EvasionPreviewHit {
  targetId: string
  targetIndex?: number | null
  zone: HoverZone
  iou: number
}

export interface CellReorderIntent {
  targetId: string
  targetIndex: number
  zone: HoverZone
}

/**
 * Finds a committed icon cell which the temporary preview has vacated.
 * ColorOS still treats that cell as occupied while the reorder is pending.
 */
export const resolveVacatedBaseIconCellIntent = (
  workingOrder: Array<string | null>,
  baseOrder: Array<string | null> | null | undefined,
  targetIndex: number | null,
  lastReorderCellIndex: number | null | undefined,
  isEligibleIcon: (id: string) => boolean
): CellReorderIntent | null => {
  if (
    !baseOrder ||
    targetIndex === null ||
    targetIndex < 0 ||
    targetIndex >= baseOrder.length ||
    targetIndex === lastReorderCellIndex ||
    !isVacantSlot(workingOrder[targetIndex])
  ) {
    return null
  }

  const targetId = baseOrder[targetIndex]
  if (!targetId || targetId === DRAG_HOLE_ID || !isEligibleIcon(targetId)) return null
  return { targetId, targetIndex, zone: 'center' }
}

/** Applies one preview transition to the candidate order selected by the caller. */
export const applyEvasionPreview = <TState extends EvasionPreviewState>(
  state: TState,
  nextOrder: Array<string | null>,
  hit: EvasionPreviewHit,
  now: number,
  dockPreviewIndex: number | null,
  intentSignature = getEvasionIntentSignature(hit.targetId, hit.zone, hit.targetIndex)
): TState => {
  if (
    state.lastEvasionSignature === intentSignature ||
    areSlotsEqual(nextOrder, state.workingOrder)
  ) {
    return state
  }

  return {
    ...state,
    workingOrder: nextOrder,
    dockPreviewIndex,
    hoverTargetId: hit.targetId,
    hoverTargetIndex: hit.targetIndex ?? null,
    hoverZone: hit.zone,
    hoverIou: hit.iou,
    folderPreviewTargetId: null,
    lastEvasionSignature: intentSignature,
    lastEvasionTriggerPointer: { x: state.pointerX, y: state.pointerY },
    lastEvasionAt: now,
    dwellStartedAt: now,
  } as TState
}

/**
 * Re-solve a new drag-over intent from the stable layout, matching CellLayout's
 * mode-1 solver: it builds each new candidate from committed occupancy instead
 * of accumulating the previous temporary coordinates.
 */
export const applyRebasedEvasionPreview = <TState extends EvasionPreviewState>(
  state: TState,
  baseOrder: Array<string | null>,
  hit: EvasionPreviewHit | null,
  nextOrder: Array<string | null> | null,
  now: number,
  dockPreviewIndex: number | null
): TState => {
  const rebasedState = {
    ...state,
    workingOrder: [...baseOrder],
    evasionBaseOrder: null,
    centerStartedAt: null,
    dwellStartedAt: null,
    dockPreviewIndex,
    hoverTargetId: hit?.targetId ?? null,
    hoverTargetIndex: hit?.targetIndex ?? null,
    hoverZone: hit?.zone ?? null,
    hoverIou: hit?.iou ?? 0,
    folderPreviewTargetId: null,
    lastEvasionSignature: null,
    lastEvasionTriggerPointer: null,
    lastEvasionAt: now,
  } as TState

  if (!hit || !nextOrder) return rebasedState

  const preview = applyEvasionPreview(rebasedState, nextOrder, hit, now, dockPreviewIndex)
  return {
    ...preview,
    evasionBaseOrder: areSlotsEqual(nextOrder, baseOrder) ? null : [...baseOrder],
  } as TState
}

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
