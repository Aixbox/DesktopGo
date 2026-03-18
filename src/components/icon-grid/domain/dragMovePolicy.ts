import type { EvasionDirection, GridItem, GridSpan } from '../model'
import type { DragHit, DragState, OuterOverlapHit } from '../state/types'
import { getGridItemSpan, getId } from '../model'
import { classifyZone, clampNumber, getRectArea, getRectIntersection } from './geometry'
import {
  DRAG_HOLE_ID,
  findNearestEmptyOnPageByManhattan,
  getPageCountBySlots,
  getPageStartBySlotIndex,
  getSlotRowColWithinPage,
} from './slots'
import { getFootprintIndices } from './topLevelLayout'
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
    !rawTargetId || rawTargetId === DRAG_HOLE_ID || rawTargetId === state.draggingId
      ? null
      : rawTargetId

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
  const col = clampNumber(
    Math.round((clampedX - rect.left - tileW / 2) / stepX),
    0,
    Math.max(0, colCount - 1)
  )
  const row = clampNumber(
    Math.round((clampedY - rect.top - tileH / 2) / stepY),
    0,
    Math.max(0, rowCount - 1)
  )
  const slotIndex = row * colCount + col
  const globalSlotIndex = clampNumber(
    pageOffset + slotIndex,
    0,
    Math.max(0, state.workingOrder.length - 1)
  )
  return globalSlotIndex
}

export const resolveNearestAnchorIndexByMetrics = (
  state: DragState,
  metrics: DragGridMetrics,
  gridGap: number,
  span: GridSpan,
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

  const maxCol = Math.max(0, colCount - span.cols)
  const maxRow = Math.max(0, rowCount - span.rows)
  const width = span.cols * tileW + Math.max(0, span.cols - 1) * gridGap
  const height = span.rows * tileH + Math.max(0, span.rows - 1) * gridGap
  const clampedX = clampNumber(state.pointerX, rect.left, rect.right)
  const clampedY = clampNumber(state.pointerY, rect.top, rect.bottom)
  const col = clampNumber(Math.round((clampedX - rect.left - width / 2) / stepX), 0, maxCol)
  const row = clampNumber(Math.round((clampedY - rect.top - height / 2) / stepY), 0, maxRow)
  const slotIndex = row * colCount + col
  const globalSlotIndex = clampNumber(
    pageOffset + slotIndex,
    0,
    Math.max(0, state.workingOrder.length - 1)
  )
  return globalSlotIndex
}

interface FindOuterMaxOverlapHitParams {
  state: DragState
  gridElement: HTMLElement | null
  columns: number
  rows: number
  itemWidth: number
  itemHeight: number
  gridGap: number
  dragWidth: number
  dragHeight: number
  pageSize: number
  currentPage: number
  tileRefs: Map<string, HTMLDivElement>
  items?: GridItem[]
}

const resolveOverlapTargetRect = (node: HTMLDivElement): DOMRect => {
  const iconImage = node.querySelector<HTMLElement>('.icon-image')
  if (iconImage) return iconImage.getBoundingClientRect()
  const folderHitbox = node.querySelector<HTMLElement>('[data-folder-icon-hitbox]')
  if (folderHitbox) return folderHitbox.getBoundingClientRect()
  const folderVisual = node.querySelector<HTMLElement>('[data-folder-icon-visual]')
  if (folderVisual) return folderVisual.getBoundingClientRect()
  return node.getBoundingClientRect()
}

const resolveStableOverlapTargetRect = ({
  node,
  item,
  anchorIndex,
  pageStart,
  columns,
  itemWidth,
  itemHeight,
  gridGap,
  gridRect,
}: {
  node: HTMLDivElement | undefined
  item: GridItem
  anchorIndex: number
  pageStart: number
  columns: number
  itemWidth: number
  itemHeight: number
  gridGap: number
  gridRect: DOMRect
}): DOMRect => {
  const safeColumns = Math.max(1, columns)
  const localIndex = Math.max(0, anchorIndex - pageStart)
  const row = Math.floor(localIndex / safeColumns)
  const col = localIndex % safeColumns
  const span = getGridItemSpan(item)
  const stableNodeRect = new DOMRect(
    gridRect.left + col * (itemWidth + gridGap),
    gridRect.top + row * (itemHeight + gridGap),
    span.cols * itemWidth + Math.max(0, span.cols - 1) * gridGap,
    span.rows * itemHeight + Math.max(0, span.rows - 1) * gridGap
  )

  if (item.kind === 'folder' && (span.cols > 1 || span.rows > 1)) {
    return stableNodeRect
  }

  if (!node) {
    return stableNodeRect
  }
  const nodeRect = node.getBoundingClientRect()
  const visualRect = resolveOverlapTargetRect(node)
  return new DOMRect(
    stableNodeRect.left + (visualRect.left - nodeRect.left),
    stableNodeRect.top + (visualRect.top - nodeRect.top),
    visualRect.width,
    visualRect.height
  )
}

export const findOuterMaxOverlapHitByMetrics = ({
  state,
  gridElement,
  columns,
  rows,
  itemWidth,
  itemHeight,
  gridGap,
  dragWidth,
  dragHeight,
  pageSize,
  currentPage,
  tileRefs,
  items,
}: FindOuterMaxOverlapHitParams): OuterOverlapHit | null => {
  if (state.context === 'folder') return null
  if (!gridElement || columns <= 0 || rows <= 0) return null
  const rect = gridElement.getBoundingClientRect()

  const dragRect = new DOMRect(
    state.pointerX - dragWidth / 2,
    state.pointerY - dragHeight / 2,
    dragWidth,
    dragHeight
  )
  const dragArea = getRectArea(dragRect)
  if (dragArea <= 0) return null

  const safePageSize = Math.max(1, pageSize)
  const pageCount = getPageCountBySlots(state.workingOrder, safePageSize)
  const activePage = clampNumber(currentPage, 0, Math.max(0, pageCount - 1))
  const pageStart = activePage * safePageSize
  const pageEnd = pageStart + safePageSize
  const itemById = items ? new Map(items.map(item => [getId(item), item] as const)) : null

  let best: OuterOverlapHit | null = null
  let preferred: OuterOverlapHit | null = null
  for (let index = pageStart; index < pageEnd; index += 1) {
    if (index < 0 || index >= state.workingOrder.length) continue
    const rawTargetId = state.workingOrder[index]
    if (!rawTargetId || rawTargetId === DRAG_HOLE_ID || rawTargetId === state.draggingId) continue
    const targetId = rawTargetId
    const node = tileRefs.get(targetId)
    const item = itemById?.get(targetId)
    if (!node && !item) continue
    const targetRect =
      item && state.context === 'outer'
        ? resolveStableOverlapTargetRect({
            node,
            item,
            anchorIndex: index,
            pageStart,
            columns,
            itemWidth,
            itemHeight,
            gridGap,
            gridRect: rect,
          })
        : node
          ? resolveOverlapTargetRect(node)
          : null
    if (!targetRect) continue
    const overlapRect = getRectIntersection(dragRect, targetRect)
    if (!overlapRect) continue
    const intersectionArea = getRectArea(overlapRect)
    if (intersectionArea <= 0) continue
    const targetArea = getRectArea(targetRect)
    if (targetArea <= 0) continue
    const iou = intersectionArea / dragArea
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

    if (candidate.targetId === state.hoverTargetId) {
      preferred = candidate
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

  if (best && preferred && preferred.targetId !== best.targetId) {
    const iouCloseEnough = preferred.iou >= best.iou - 0.08
    const areaCloseEnough = preferred.intersectionArea >= best.intersectionArea * 0.78
    const distanceCloseEnough =
      preferred.centerManhattanDistance <=
      best.centerManhattanDistance + Math.max(itemWidth, itemHeight)
    if (iouCloseEnough && areaCloseEnough && distanceCloseEnough) {
      return preferred
    }
  }

  return best
}

interface FootprintBounds {
  minRow: number
  maxRow: number
  minCol: number
  maxCol: number
}

interface PagePlacementEntry {
  id: string
  anchorIndex: number
  span: GridSpan
  footprint: number[]
  bounds: FootprintBounds
  overlapsReserved: boolean
}

interface PlacementCandidate {
  anchorIndex: number
  footprint: number[]
  score: number
}

interface PlacementSpec {
  entry: PagePlacementEntry
  candidates: PlacementCandidate[]
}

interface PlacementCandidateFilterContext {
  anchorIndex: number
  footprint: number[]
  bounds: FootprintBounds
}
interface PlacementOrderConstraint {
  minAnchorExclusive: number
  maxAnchorExclusive: number
}

interface PlacementSolution {
  assignments: Map<string, number>
  totalScore: number
}

interface FootprintEvasionResult {
  order: Array<string | null>
  totalScore: number
}

interface CurrentPageFootprintResultMetrics {
  movedEntryCount: number
  movedNonOverlapCount: number
  totalAnchorShift: number
}

interface OuterEvasionOptions {
  items?: GridItem[]
  draggingItem?: GridItem
  draggingIds?: string[]
  targetAnchorIndex?: number | null
}

const MAX_BACKTRACK_PLACEMENTS = 16

const buildFootprintBounds = (
  indices: number[],
  pageStart: number,
  columns: number
): FootprintBounds => {
  let minRow = Number.POSITIVE_INFINITY
  let maxRow = Number.NEGATIVE_INFINITY
  let minCol = Number.POSITIVE_INFINITY
  let maxCol = Number.NEGATIVE_INFINITY

  indices.forEach(index => {
    const pos = getSlotRowColWithinPage(index, pageStart, columns)
    minRow = Math.min(minRow, pos.row)
    maxRow = Math.max(maxRow, pos.row)
    minCol = Math.min(minCol, pos.col)
    maxCol = Math.max(maxCol, pos.col)
  })

  return { minRow, maxRow, minCol, maxCol }
}

const scorePlacementCandidate = (
  entry: PagePlacementEntry,
  anchorIndex: number,
  pageStart: number,
  pageSize: number,
  columns: number
) => {
  const safePageSize = Math.max(1, pageSize)
  const fromPos = getSlotRowColWithinPage(entry.anchorIndex, pageStart, columns)
  const toPos = getSlotRowColWithinPage(anchorIndex, pageStart, columns)
  const rowDelta = toPos.row - fromPos.row
  const colDelta = toPos.col - fromPos.col
  const manhattanDistance = Math.abs(rowDelta) + Math.abs(colDelta)
  const absoluteDelta = Math.abs(anchorIndex - entry.anchorIndex)
  const fromPage = Math.floor(Math.max(0, entry.anchorIndex - pageStart) / safePageSize)
  const toPage = Math.floor(Math.max(0, anchorIndex - pageStart) / safePageSize)
  const forwardPageDistance = Math.max(0, toPage - fromPage)

  let score = manhattanDistance * 140 + absoluteDelta * 6
  if (forwardPageDistance > 0) {
    score += forwardPageDistance * 2600
  }

  if (!entry.overlapsReserved && anchorIndex !== entry.anchorIndex) {
    score += 900
  }

  if (anchorIndex === entry.anchorIndex) {
    score -= entry.overlapsReserved ? 120 : 2400
  }

  return score
}

const movesEntryAlongDirection = (
  entry: PagePlacementEntry,
  anchorIndex: number,
  pageStart: number,
  columns: number,
  direction: EvasionDirection
) => {
  const fromPos = getSlotRowColWithinPage(entry.anchorIndex, pageStart, columns)
  const toPos = getSlotRowColWithinPage(anchorIndex, pageStart, columns)

  if (direction === 'left') return toPos.col < fromPos.col
  if (direction === 'right') return toPos.col > fromPos.col
  if (direction === 'up') return toPos.row < fromPos.row
  return toPos.row > fromPos.row
}

const buildDirectionalOverlapCandidatePredicate = (
  pageStart: number,
  columns: number,
  direction: EvasionDirection
) => {
  return (entry: PagePlacementEntry, context: PlacementCandidateFilterContext) => {
    if (!entry.overlapsReserved) return true
    return movesEntryAlongDirection(entry, context.anchorIndex, pageStart, columns, direction)
  }
}

const canOccupyFootprint = (occupied: Set<number>, footprint: number[]) =>
  footprint.every(index => !occupied.has(index))

const collectPagePlacementEntries = (
  order: Array<string | null>,
  itemById: Map<string, GridItem>,
  rangeStart: number,
  rangeEndExclusive: number,
  pageStart: number,
  pageSize: number,
  columns: number,
  reservedSet: Set<number>,
  draggingIdSet: Set<string>
): PagePlacementEntry[] => {
  const safeRangeStart = Math.max(0, rangeStart)
  const safeRangeEnd = Math.max(safeRangeStart, rangeEndExclusive)
  const entries: PagePlacementEntry[] = []

  for (let index = safeRangeStart; index < safeRangeEnd; index += 1) {
    const id = order[index]
    if (!id || id === DRAG_HOLE_ID || draggingIdSet.has(id)) continue

    const item = itemById.get(id)
    if (!item) continue

    const span = getGridItemSpan(item)
    const footprint = getFootprintIndices(index, span, columns, pageSize)
    if (!footprint) return []

    entries.push({
      id,
      anchorIndex: index,
      span,
      footprint,
      bounds: buildFootprintBounds(footprint, pageStart, columns),
      overlapsReserved: footprint.some(cellIndex => reservedSet.has(cellIndex)),
    })
  }

  return entries
}

const buildPlacementSpecs = ({
  entries,
  pageStart,
  rangeStart,
  rangeEndExclusive,
  pageSize,
  columns,
  reservedSet,
  baseOccupied,
  candidatePredicate,
  preserveRelativeOrder = true,
}: {
  entries: PagePlacementEntry[]
  pageStart: number
  rangeStart: number
  rangeEndExclusive: number
  pageSize: number
  columns: number
  reservedSet: Set<number>
  baseOccupied: Set<number>
  candidatePredicate?: (
    entry: PagePlacementEntry,
    context: PlacementCandidateFilterContext
  ) => boolean
  preserveRelativeOrder?: boolean
}): PlacementSpec[] | null => {
  const safeRangeStart = Math.max(0, rangeStart)
  const safeRangeEnd = Math.max(safeRangeStart, rangeEndExclusive)

  const specs = entries.map(entry => {
    const candidates: PlacementCandidate[] = []
    for (let anchorIndex = safeRangeStart; anchorIndex < safeRangeEnd; anchorIndex += 1) {
      const footprint = getFootprintIndices(anchorIndex, entry.span, columns, pageSize)
      if (!footprint) continue
      if (footprint.some(index => reservedSet.has(index))) continue
      if (!canOccupyFootprint(baseOccupied, footprint)) continue

      const bounds = buildFootprintBounds(footprint, pageStart, columns)
      if (candidatePredicate && !candidatePredicate(entry, { anchorIndex, footprint, bounds })) {
        continue
      }

      candidates.push({
        anchorIndex,
        footprint,
        score: scorePlacementCandidate(entry, anchorIndex, pageStart, pageSize, columns),
      })
    }

    candidates.sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score
      return a.anchorIndex - b.anchorIndex
    })

    return { entry, candidates }
  })

  if (specs.some(spec => spec.candidates.length === 0)) {
    return null
  }

  if (preserveRelativeOrder) {
    specs.sort((a, b) => a.entry.anchorIndex - b.entry.anchorIndex)
  } else {
    specs.sort((a, b) => {
      if (a.candidates.length !== b.candidates.length) {
        return a.candidates.length - b.candidates.length
      }

      const aArea = a.entry.span.cols * a.entry.span.rows
      const bArea = b.entry.span.cols * b.entry.span.rows
      if (aArea !== bArea) {
        return bArea - aArea
      }

      if (a.entry.overlapsReserved !== b.entry.overlapsReserved) {
        return a.entry.overlapsReserved ? -1 : 1
      }

      return a.entry.anchorIndex - b.entry.anchorIndex
    })
  }

  return specs
}

const buildPlacementOrderConstraints = (
  entries: PagePlacementEntry[],
  fixedAssignments: Map<string, number>,
  rangeStart: number,
  rangeEndExclusive: number
): Map<string, PlacementOrderConstraint> => {
  const safeRangeStart = Math.max(0, rangeStart)
  const safeRangeEnd = Math.max(safeRangeStart, rangeEndExclusive)
  const orderedEntries = [...entries].sort((a, b) => a.anchorIndex - b.anchorIndex)
  const constraints = new Map<string, PlacementOrderConstraint>()
  let lastFixedAnchor = safeRangeStart - 1

  orderedEntries.forEach(entry => {
    const fixedAnchor = fixedAssignments.get(entry.id)
    if (fixedAnchor !== undefined) {
      lastFixedAnchor = fixedAnchor
      return
    }
    constraints.set(entry.id, {
      minAnchorExclusive: lastFixedAnchor,
      maxAnchorExclusive: safeRangeEnd,
    })
  })

  let nextFixedAnchor = safeRangeEnd
  for (let index = orderedEntries.length - 1; index >= 0; index -= 1) {
    const entry = orderedEntries[index]
    const fixedAnchor = fixedAssignments.get(entry.id)
    if (fixedAnchor !== undefined) {
      nextFixedAnchor = fixedAnchor
      continue
    }
    const current = constraints.get(entry.id)
    if (!current) continue
    current.maxAnchorExclusive = nextFixedAnchor
    constraints.set(entry.id, current)
  }

  return constraints
}

const isCandidateWithinOrderBounds = (
  candidate: PlacementCandidate,
  constraint: PlacementOrderConstraint | undefined,
  minAnchorExclusive: number
) => {
  const lowerBound = Math.max(
    minAnchorExclusive,
    constraint?.minAnchorExclusive ?? Number.NEGATIVE_INFINITY
  )
  const upperBound = constraint?.maxAnchorExclusive ?? Number.POSITIVE_INFINITY
  return candidate.anchorIndex > lowerBound && candidate.anchorIndex < upperBound
}

const isPlacementCandidateAllowed = ({
  candidate,
  constraint,
  lastAssignedAnchor,
  preserveRelativeOrder,
}: {
  candidate: PlacementCandidate
  constraint: PlacementOrderConstraint | undefined
  lastAssignedAnchor: number
  preserveRelativeOrder: boolean
}) =>
  preserveRelativeOrder
    ? isCandidateWithinOrderBounds(candidate, constraint, lastAssignedAnchor)
    : true

const assignGreedyPlacements = (
  specs: PlacementSpec[],
  baseOccupied: Set<number>,
  constraints: Map<string, PlacementOrderConstraint>,
  preserveRelativeOrder: boolean
): PlacementSolution | null => {
  const occupied = new Set(baseOccupied)
  const assignments = new Map<string, number>()
  let totalScore = 0
  let lastAssignedAnchor = Number.NEGATIVE_INFINITY

  for (const spec of specs) {
    const constraint = constraints.get(spec.entry.id)
    const chosen = spec.candidates.find(
      candidate =>
        isPlacementCandidateAllowed({
          candidate,
          constraint,
          lastAssignedAnchor,
          preserveRelativeOrder,
        }) && canOccupyFootprint(occupied, candidate.footprint)
    )
    if (!chosen) return null

    chosen.footprint.forEach(index => occupied.add(index))
    assignments.set(spec.entry.id, chosen.anchorIndex)
    totalScore += chosen.score
    lastAssignedAnchor = chosen.anchorIndex
  }

  return { assignments, totalScore }
}

const assignWithBacktracking = (
  specs: PlacementSpec[],
  baseOccupied: Set<number>,
  constraints: Map<string, PlacementOrderConstraint>,
  preserveRelativeOrder: boolean
): PlacementSolution | null => {
  const greedy = assignGreedyPlacements(specs, baseOccupied, constraints, preserveRelativeOrder)
  if (specs.length > MAX_BACKTRACK_PLACEMENTS) {
    return greedy
  }

  const occupied = new Set(baseOccupied)
  const assigned = new Map<string, number>()
  const remainingMinScores = Array.from({ length: specs.length + 1 }, () => 0)
  for (let index = specs.length - 1; index >= 0; index -= 1) {
    remainingMinScores[index] =
      remainingMinScores[index + 1] + (specs[index]?.candidates[0]?.score ?? 0)
  }

  let bestScore = greedy?.totalScore ?? Number.POSITIVE_INFINITY
  let bestAssignments = greedy ? new Map(greedy.assignments) : null

  const search = (specIndex: number, totalScore: number, lastAssignedAnchor: number) => {
    if (specIndex >= specs.length) {
      if (totalScore < bestScore) {
        bestScore = totalScore
        bestAssignments = new Map(assigned)
      }
      return
    }

    if (totalScore + remainingMinScores[specIndex] >= bestScore) return

    const spec = specs[specIndex]
    const constraint = constraints.get(spec.entry.id)
    for (const candidate of spec.candidates) {
      const nextScore = totalScore + candidate.score
      if (nextScore >= bestScore) continue
      if (
        !isPlacementCandidateAllowed({
          candidate,
          constraint,
          lastAssignedAnchor,
          preserveRelativeOrder,
        })
      ) {
        continue
      }
      if (!canOccupyFootprint(occupied, candidate.footprint)) continue

      candidate.footprint.forEach(index => occupied.add(index))
      assigned.set(spec.entry.id, candidate.anchorIndex)
      search(specIndex + 1, nextScore, candidate.anchorIndex)
      assigned.delete(spec.entry.id)
      candidate.footprint.forEach(index => occupied.delete(index))
    }
  }

  search(0, 0, Number.NEGATIVE_INFINITY)
  return bestAssignments ? { assignments: bestAssignments, totalScore: bestScore } : null
}

const trimTrailingEmptySlots = (slots: Array<string | null>, minimumLength: number) => {
  const next = [...slots]
  const safeMinimumLength = Math.max(1, minimumLength)
  while (next.length > safeMinimumLength && next[next.length - 1] === null) {
    next.pop()
  }
  return next
}

const buildOrderWithAssignments = (
  order: Array<string | null>,
  rangeStart: number,
  rangeEndExclusive: number,
  entries: PagePlacementEntry[],
  fixedAssignments: Map<string, number>,
  movableSolution: PlacementSolution,
  minimumLength: number
): Array<string | null> => {
  const safeRangeStart = Math.max(0, rangeStart)
  const safeRangeEnd = Math.max(safeRangeStart, rangeEndExclusive)
  const next = [...order]
  while (next.length < safeRangeEnd) {
    next.push(null)
  }

  for (let index = safeRangeStart; index < safeRangeEnd; index += 1) {
    next[index] = null
  }

  entries.forEach(entry => {
    const anchorIndex = movableSolution.assignments.get(entry.id) ?? fixedAssignments.get(entry.id)
    if (anchorIndex === undefined) return
    next[anchorIndex] = entry.id
  })

  return trimTrailingEmptySlots(next, minimumLength)
}

const solveFootprintPlacements = ({
  order,
  entries,
  reservedFootprint,
  rangeStart,
  rangeEndExclusive,
  pageStart,
  pageSize,
  columns,
  movablePredicate,
  candidatePredicate,
  preserveRelativeOrder = true,
}: {
  order: Array<string | null>
  entries: PagePlacementEntry[]
  reservedFootprint: number[]
  rangeStart: number
  rangeEndExclusive: number
  pageStart: number
  pageSize: number
  columns: number
  movablePredicate: (entry: PagePlacementEntry) => boolean
  candidatePredicate?: (
    entry: PagePlacementEntry,
    context: PlacementCandidateFilterContext
  ) => boolean
  preserveRelativeOrder?: boolean
}): FootprintEvasionResult | null => {
  if (entries.length === 0) return null

  const reservedSet = new Set(reservedFootprint)
  const fixedAssignments = new Map<string, number>()
  const baseOccupied = new Set<number>(reservedFootprint)
  const movableEntries: PagePlacementEntry[] = []

  for (const entry of entries) {
    if (movablePredicate(entry) || entry.overlapsReserved) {
      movableEntries.push(entry)
      continue
    }
    entry.footprint.forEach(index => baseOccupied.add(index))
    fixedAssignments.set(entry.id, entry.anchorIndex)
  }

  const specs = buildPlacementSpecs({
    entries: movableEntries,
    pageStart,
    rangeStart,
    rangeEndExclusive,
    pageSize,
    columns,
    reservedSet,
    baseOccupied,
    candidatePredicate,
    preserveRelativeOrder,
  })
  if (!specs) return null

  const constraints = preserveRelativeOrder
    ? buildPlacementOrderConstraints(entries, fixedAssignments, rangeStart, rangeEndExclusive)
    : new Map<string, PlacementOrderConstraint>()
  const solution = assignWithBacktracking(specs, baseOccupied, constraints, preserveRelativeOrder)
  if (!solution) return null

  return {
    order: buildOrderWithAssignments(
      order,
      rangeStart,
      rangeEndExclusive,
      entries,
      fixedAssignments,
      solution,
      pageStart + Math.max(1, pageSize)
    ),
    totalScore: solution.totalScore,
  }
}

const measureCurrentPageFootprintResult = ({
  entries,
  result,
  pageStart,
  pageSize,
}: {
  entries: PagePlacementEntry[]
  result: FootprintEvasionResult
  pageStart: number
  pageSize: number
}): CurrentPageFootprintResultMetrics => {
  const anchorById = new Map<string, number>()
  const rangeEndExclusive = pageStart + Math.max(1, pageSize)

  for (let index = pageStart; index < rangeEndExclusive; index += 1) {
    const id = result.order[index]
    if (!id || id === DRAG_HOLE_ID) continue
    anchorById.set(id, index)
  }

  let movedEntryCount = 0
  let movedNonOverlapCount = 0
  let totalAnchorShift = 0
  for (const entry of entries) {
    const nextAnchor = anchorById.get(entry.id)
    if (nextAnchor === undefined || nextAnchor === entry.anchorIndex) continue
    movedEntryCount += 1
    if (!entry.overlapsReserved) {
      movedNonOverlapCount += 1
    }
    totalAnchorShift += Math.abs(nextAnchor - entry.anchorIndex)
  }

  return {
    movedEntryCount,
    movedNonOverlapCount,
    totalAnchorShift,
  }
}

const pickBetterCurrentPageFootprintResult = (
  entries: PagePlacementEntry[],
  pageStart: number,
  pageSize: number,
  current: FootprintEvasionResult | null,
  candidate: FootprintEvasionResult | null,
  columns: number,
  preferredDirections?: EvasionDirection[]
): FootprintEvasionResult | null => {
  if (!candidate) return current
  if (!current) return candidate

  const currentMetrics = measureCurrentPageFootprintResult({
    entries,
    result: current,
    pageStart,
    pageSize,
  })
  const candidateMetrics = measureCurrentPageFootprintResult({
    entries,
    result: candidate,
    pageStart,
    pageSize,
  })

  if (candidateMetrics.movedEntryCount !== currentMetrics.movedEntryCount) {
    return candidateMetrics.movedEntryCount < currentMetrics.movedEntryCount ? candidate : current
  }

  if (candidateMetrics.movedNonOverlapCount !== currentMetrics.movedNonOverlapCount) {
    return candidateMetrics.movedNonOverlapCount < currentMetrics.movedNonOverlapCount
      ? candidate
      : current
  }

  if (candidate.totalScore !== current.totalScore) {
    return candidate.totalScore < current.totalScore ? candidate : current
  }

  if (candidateMetrics.totalAnchorShift !== currentMetrics.totalAnchorShift) {
    return candidateMetrics.totalAnchorShift < currentMetrics.totalAnchorShift ? candidate : current
  }

  if (preferredDirections && preferredDirections.length > 0) {
    const scoreDirectionAlignment = (result: FootprintEvasionResult) => {
      const anchorById = new Map<string, number>()
      const rangeEndExclusive = pageStart + Math.max(1, pageSize)

      for (let index = pageStart; index < rangeEndExclusive; index += 1) {
        const id = result.order[index]
        if (!id || id === DRAG_HOLE_ID) continue
        anchorById.set(id, index)
      }

      let score = 0
      for (const entry of entries) {
        if (!entry.overlapsReserved) continue
        const nextAnchor = anchorById.get(entry.id)
        if (nextAnchor === undefined || nextAnchor === entry.anchorIndex) continue

        for (let index = 0; index < preferredDirections.length; index += 1) {
          const direction = preferredDirections[index]
          if (!movesEntryAlongDirection(entry, nextAnchor, pageStart, columns, direction)) continue
          score += preferredDirections.length - index
          break
        }
      }

      return score
    }

    const currentDirectionScore = scoreDirectionAlignment(current)
    const candidateDirectionScore = scoreDirectionAlignment(candidate)
    if (candidateDirectionScore !== currentDirectionScore) {
      return candidateDirectionScore > currentDirectionScore ? candidate : current
    }
  }

  return current
}

const CURRENT_PAGE_FOOTPRINT_STRATEGIES: Array<{
  movablePredicate: (entry: PagePlacementEntry) => boolean
  preserveRelativeOrder?: boolean
}> = [
  {
    movablePredicate: entry => entry.overlapsReserved,
  },
  {
    movablePredicate: entry => entry.overlapsReserved,
    preserveRelativeOrder: false,
  },
  {
    movablePredicate: () => true,
  },
  {
    movablePredicate: () => true,
    preserveRelativeOrder: false,
  },
]

const solveCurrentPageFootprintStrategies = ({
  order,
  entries,
  reservedFootprint,
  pageStart,
  pageSize,
  columns,
  candidatePredicate,
}: {
  order: Array<string | null>
  entries: PagePlacementEntry[]
  reservedFootprint: number[]
  pageStart: number
  pageSize: number
  columns: number
  candidatePredicate?: (
    entry: PagePlacementEntry,
    context: PlacementCandidateFilterContext
  ) => boolean
}): FootprintEvasionResult | null => {
  const baseOptions = {
    order,
    entries,
    reservedFootprint,
    rangeStart: pageStart,
    rangeEndExclusive: pageStart + Math.max(1, pageSize),
    pageStart,
    pageSize,
    columns,
  }

  let best: FootprintEvasionResult | null = null
  for (const strategy of CURRENT_PAGE_FOOTPRINT_STRATEGIES) {
    const candidate = solveFootprintPlacements({
      ...baseOptions,
      movablePredicate: strategy.movablePredicate,
      preserveRelativeOrder: strategy.preserveRelativeOrder,
      candidatePredicate,
    })
    best = pickBetterCurrentPageFootprintResult(
      entries,
      pageStart,
      pageSize,
      best,
      candidate,
      columns
    )
  }

  return best
}

const attemptCurrentPageFootprintEvasion = ({
  order,
  entries,
  reservedFootprint,
  pageStart,
  pageSize,
  columns,
  preferredDirections,
}: {
  order: Array<string | null>
  entries: PagePlacementEntry[]
  reservedFootprint: number[]
  pageStart: number
  pageSize: number
  columns: number
  preferredDirections?: EvasionDirection[]
}): FootprintEvasionResult | null => {
  let best = solveCurrentPageFootprintStrategies({
    order,
    entries,
    reservedFootprint,
    pageStart,
    pageSize,
    columns,
  })

  for (const direction of preferredDirections ?? []) {
    const directionalResult = solveCurrentPageFootprintStrategies({
      order,
      entries,
      reservedFootprint,
      pageStart,
      pageSize,
      columns,
      candidatePredicate: buildDirectionalOverlapCandidatePredicate(pageStart, columns, direction),
    })
    best = pickBetterCurrentPageFootprintResult(
      entries,
      pageStart,
      pageSize,
      best,
      directionalResult,
      columns,
      [direction]
    )
  }

  return best
}

const findFirstLegalAnchor = ({
  span,
  startIndex,
  searchEndExclusive,
  columns,
  pageSize,
  reservedSet,
  occupied,
}: {
  span: GridSpan
  startIndex: number
  searchEndExclusive: number
  columns: number
  pageSize: number
  reservedSet: Set<number>
  occupied: Set<number>
}): PlacementCandidate | null => {
  for (
    let anchorIndex = Math.max(0, startIndex);
    anchorIndex < searchEndExclusive;
    anchorIndex += 1
  ) {
    const footprint = getFootprintIndices(anchorIndex, span, columns, pageSize)
    if (!footprint) continue
    if (footprint.some(index => reservedSet.has(index))) continue
    if (!canOccupyFootprint(occupied, footprint)) continue
    return { anchorIndex, footprint, score: 0 }
  }

  return null
}

const attemptStableSuffixReflow = ({
  order,
  entries,
  reservedFootprint,
  targetIndex,
  pageStart,
  pageSize,
  columns,
}: {
  order: Array<string | null>
  entries: PagePlacementEntry[]
  reservedFootprint: number[]
  targetIndex: number
  pageStart: number
  pageSize: number
  columns: number
}): FootprintEvasionResult | null => {
  if (entries.length === 0) return null

  const overlapAnchors = entries
    .filter(entry => entry.overlapsReserved)
    .map(entry => entry.anchorIndex)
  const suffixStart =
    overlapAnchors.length > 0 ? Math.min(targetIndex, ...overlapAnchors) : targetIndex
  const fixedAssignments = new Map<string, number>()
  const reservedSet = new Set(reservedFootprint)
  const occupied = new Set<number>(reservedFootprint)
  const movableEntries: PagePlacementEntry[] = []

  for (const entry of entries) {
    if (entry.anchorIndex < suffixStart) {
      entry.footprint.forEach(index => occupied.add(index))
      fixedAssignments.set(entry.id, entry.anchorIndex)
      continue
    }
    movableEntries.push(entry)
  }

  const assignments = new Map<string, number>()
  let totalScore = 0
  let nextAnchorStart = Math.max(pageStart, suffixStart)
  const baseSearchEndExclusive = Math.max(order.length, pageStart + pageSize)
  let searchEndExclusive = baseSearchEndExclusive
  const hardSearchEndExclusive =
    baseSearchEndExclusive + Math.max(2, movableEntries.length + 2) * pageSize

  for (const entry of movableEntries) {
    const currentPageEnd = pageStart + Math.max(1, pageSize)
    const entryStartIndex =
      entry.anchorIndex < currentPageEnd
        ? nextAnchorStart
        : Math.max(nextAnchorStart, entry.anchorIndex)
    let placement: PlacementCandidate | null = null
    while (!placement) {
      placement = findFirstLegalAnchor({
        span: entry.span,
        startIndex: entryStartIndex,
        searchEndExclusive,
        columns,
        pageSize,
        reservedSet,
        occupied,
      })
      if (placement) break
      if (searchEndExclusive >= hardSearchEndExclusive) return null
      searchEndExclusive += pageSize
    }

    placement.footprint.forEach(index => occupied.add(index))
    assignments.set(entry.id, placement.anchorIndex)
    totalScore += scorePlacementCandidate(
      entry,
      placement.anchorIndex,
      pageStart,
      pageSize,
      columns
    )
    nextAnchorStart = placement.anchorIndex + 1
  }

  return {
    order: buildOrderWithAssignments(
      order,
      pageStart,
      searchEndExclusive,
      entries,
      fixedAssignments,
      { assignments, totalScore },
      pageStart + Math.max(1, pageSize)
    ),
    totalScore,
  }
}

const attemptFootprintEvasion = ({
  order,
  pageStart,
  pageSize,
  columns,
  draggingItem,
  draggingIds,
  items,
  targetIndex,
  preferredDirections,
}: {
  order: Array<string | null>
  pageStart: number
  pageSize: number
  columns: number
  draggingItem: GridItem
  draggingIds: string[]
  items: GridItem[]
  targetIndex: number
  preferredDirections?: EvasionDirection[]
}): FootprintEvasionResult | null => {
  const reservedFootprint = getFootprintIndices(
    targetIndex,
    getGridItemSpan(draggingItem),
    columns,
    pageSize
  )
  if (!reservedFootprint) return null

  const reservedSet = new Set(reservedFootprint)
  const itemById = new Map<string, GridItem>()
  items.forEach(item => {
    itemById.set(getId(item), item)
  })

  const draggingIdSet = new Set<string>(draggingIds)
  const currentPageRangeEnd = pageStart + Math.max(1, pageSize)
  const currentPageEntries = collectPagePlacementEntries(
    order,
    itemById,
    pageStart,
    currentPageRangeEnd,
    pageStart,
    pageSize,
    columns,
    reservedSet,
    draggingIdSet
  )
  const localResult = attemptCurrentPageFootprintEvasion({
    order,
    entries: currentPageEntries,
    reservedFootprint,
    pageStart,
    pageSize,
    columns,
    preferredDirections,
  })
  if (localResult) return localResult

  const allEntries = collectPagePlacementEntries(
    order,
    itemById,
    pageStart,
    order.length,
    pageStart,
    pageSize,
    columns,
    reservedSet,
    draggingIdSet
  )
  if (allEntries.length === 0 && items.length > 0) return null

  return attemptStableSuffixReflow({
    order,
    entries: allEntries,
    reservedFootprint,
    targetIndex,
    pageStart,
    pageSize,
    columns,
  })
}

const applyForwardSpillEvasion = (
  order: Array<string | null>,
  targetIndex: number
): Array<string | null> => {
  if (targetIndex < 0 || targetIndex >= order.length) return order

  const next = [...order]
  let spillIndex = -1
  for (let index = targetIndex + 1; index < next.length; index += 1) {
    if (next[index] === null) {
      spillIndex = index
      break
    }
  }

  if (spillIndex < 0) {
    spillIndex = next.length
    next.push(null)
  }

  for (let index = spillIndex; index > targetIndex; index -= 1) {
    next[index] = next[index - 1]
  }
  next[targetIndex] = null
  return next
}

export const applyOuterEvasionPolicy = (
  order: Array<string | null>,
  hit: OuterOverlapHit,
  pageSize: number,
  columns: number,
  directionTieBreakByOverlap: boolean,
  options?: OuterEvasionOptions
): { order: Array<string | null>; direction: EvasionDirection | null } => {
  const safePageSize = Math.max(1, pageSize)
  const safeColumns = Math.max(1, columns)
  const targetAnchorIndex = options?.targetAnchorIndex ?? hit.targetIndex
  const pageStart = getPageStartBySlotIndex(targetAnchorIndex, safePageSize)
  const directions = resolveEvasionDirectionCandidates(hit.overlapRect, hit.targetRect)
  const targetItem = options?.items?.find(item => getId(item) === hit.targetId) ?? null
  const draggingSpan = options?.draggingItem ? getGridItemSpan(options.draggingItem) : null
  const targetSpan = targetItem ? getGridItemSpan(targetItem) : null
  const pageHasFootprintItem =
    options?.items?.some(item => {
      const span = getGridItemSpan(item)
      if (span.cols === 1 && span.rows === 1) return false
      const anchorIndex = order.indexOf(getId(item))
      return anchorIndex >= pageStart && anchorIndex < pageStart + safePageSize
    }) ?? false
  const needsFootprintEvasion =
    pageHasFootprintItem ||
    Boolean(draggingSpan && (draggingSpan.cols > 1 || draggingSpan.rows > 1)) ||
    Boolean(targetSpan && (targetSpan.cols > 1 || targetSpan.rows > 1))

  if (needsFootprintEvasion && options?.items && options.draggingItem) {
    const footprintResult = attemptFootprintEvasion({
      order,
      pageStart,
      pageSize: safePageSize,
      columns: safeColumns,
      draggingItem: options.draggingItem,
      draggingIds: options.draggingIds ?? [getId(options.draggingItem)],
      items: options.items,
      targetIndex: targetAnchorIndex,
      preferredDirections: directions.candidates,
    })
    if (footprintResult) {
      return { order: footprintResult.order, direction: null }
    }

    return { order, direction: null }
  }

  const evaluated = directions.candidates.map(direction =>
    evaluateDirectionalEvasion(
      order,
      hit.targetIndex,
      direction,
      pageStart,
      safePageSize,
      safeColumns
    )
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
        order: applyDirectionalShift(
          order,
          hit.targetIndex,
          chosen.emptyIndex,
          chosen.direction,
          safeColumns
        ),
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
  if (fallbackIndex === null) {
    if (options?.items) {
      return {
        order: applyForwardSpillEvasion(order, hit.targetIndex),
        direction: null,
      }
    }
    return { order, direction: null }
  }
  const next = [...order]
  next[fallbackIndex] = next[hit.targetIndex]
  next[hit.targetIndex] = null
  return { order: next, direction: null }
}
