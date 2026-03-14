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
  const col = clampNumber(
    Math.round((clampedX - rect.left - width / 2) / stepX),
    0,
    maxCol
  )
  const row = clampNumber(
    Math.round((clampedY - rect.top - height / 2) / stepY),
    0,
    maxRow
  )
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
  dragWidth: number
  dragHeight: number
  pageSize: number
  currentPage: number
  tileRefs: Map<string, HTMLDivElement>
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

export const findOuterMaxOverlapHitByMetrics = ({
  state,
  gridElement,
  columns,
  rows,
  dragWidth,
  dragHeight,
  pageSize,
  currentPage,
  tileRefs,
}: FindOuterMaxOverlapHitParams): OuterOverlapHit | null => {
  if (state.context === 'folder') return null
  if (!gridElement || columns <= 0 || rows <= 0) return null

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

interface OuterEvasionOptions {
  items?: GridItem[]
  draggingItem?: GridItem
  targetAnchorIndex?: number | null
}

const MAX_BACKTRACK_PLACEMENTS = 12

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

const doBoundsIntersect = (
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): boolean => aStart <= bEnd && bStart <= aEnd

const resolveDirectionAxisDelta = (
  direction: EvasionDirection,
  fromIndex: number,
  toIndex: number,
  pageStart: number,
  columns: number
) => {
  const fromPos = getSlotRowColWithinPage(fromIndex, pageStart, columns)
  const toPos = getSlotRowColWithinPage(toIndex, pageStart, columns)
  return {
    rowDelta: toPos.row - fromPos.row,
    colDelta: toPos.col - fromPos.col,
    axisDelta:
      direction === 'left' || direction === 'right'
        ? toPos.col - fromPos.col
        : toPos.row - fromPos.row,
    crossDelta:
      direction === 'left' || direction === 'right'
        ? toPos.row - fromPos.row
        : toPos.col - fromPos.col,
  }
}

const scorePlacementCandidate = (
  entry: PagePlacementEntry,
  anchorIndex: number,
  direction: EvasionDirection,
  pageStart: number,
  columns: number
) => {
  const { rowDelta, colDelta, axisDelta, crossDelta } = resolveDirectionAxisDelta(
    direction,
    entry.anchorIndex,
    anchorIndex,
    pageStart,
    columns
  )
  const preferredSign = direction === 'right' || direction === 'down' ? 1 : -1
  const axisDistance = Math.abs(axisDelta)
  const crossDistance = Math.abs(crossDelta)
  const manhattanDistance = Math.abs(rowDelta) + Math.abs(colDelta)

  let score = manhattanDistance * 120 + crossDistance * 320
  if (axisDelta === 0 && anchorIndex !== entry.anchorIndex) {
    score += 240
  } else if (axisDelta * preferredSign < 0) {
    score += axisDistance * 1200
  } else {
    score += axisDistance * 80
  }

  if (!entry.overlapsReserved && anchorIndex !== entry.anchorIndex) {
    score += 1600
  }

  if (anchorIndex === entry.anchorIndex) {
    score -= entry.overlapsReserved ? 200 : 2400
  }

  return score
}

const canOccupyFootprint = (occupied: Set<number>, footprint: number[]) =>
  footprint.every(index => !occupied.has(index))

const collectPagePlacementEntries = (
  order: Array<string | null>,
  itemById: Map<string, GridItem>,
  pageStart: number,
  pageSize: number,
  columns: number,
  reservedSet: Set<number>,
  draggingId: string | null
): PagePlacementEntry[] => {
  const pageEnd = pageStart + Math.max(1, pageSize)
  const entries: PagePlacementEntry[] = []

  for (let index = pageStart; index < pageEnd; index += 1) {
    const id = order[index]
    if (!id || id === DRAG_HOLE_ID || id === draggingId) continue

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

const shouldMoveInDirectionalCorridor = (
  entry: PagePlacementEntry,
  reservedBounds: FootprintBounds,
  direction: EvasionDirection
) => {
  if (entry.overlapsReserved) return true

  if (direction === 'left' || direction === 'right') {
    const sharesRows = doBoundsIntersect(
      entry.bounds.minRow,
      entry.bounds.maxRow,
      reservedBounds.minRow,
      reservedBounds.maxRow
    )
    if (!sharesRows) return false
    return direction === 'left'
      ? entry.bounds.maxCol < reservedBounds.minCol
      : entry.bounds.minCol > reservedBounds.maxCol
  }

  const sharesCols = doBoundsIntersect(
    entry.bounds.minCol,
    entry.bounds.maxCol,
    reservedBounds.minCol,
    reservedBounds.maxCol
  )
  if (!sharesCols) return false
  return direction === 'up'
    ? entry.bounds.maxRow < reservedBounds.minRow
    : entry.bounds.minRow > reservedBounds.maxRow
}

const buildPlacementSpecs = ({
  entries,
  direction,
  pageStart,
  pageSize,
  columns,
  reservedSet,
  baseOccupied,
}: {
  entries: PagePlacementEntry[]
  direction: EvasionDirection
  pageStart: number
  pageSize: number
  columns: number
  reservedSet: Set<number>
  baseOccupied: Set<number>
}): PlacementSpec[] | null => {
  const pageEnd = pageStart + Math.max(1, pageSize)

  const specs = entries.map(entry => {
    const candidates: PlacementCandidate[] = []
    for (let anchorIndex = pageStart; anchorIndex < pageEnd; anchorIndex += 1) {
      const footprint = getFootprintIndices(anchorIndex, entry.span, columns, pageSize)
      if (!footprint) continue
      if (footprint.some(index => reservedSet.has(index))) continue
      if (!canOccupyFootprint(baseOccupied, footprint)) continue

      candidates.push({
        anchorIndex,
        footprint,
        score: scorePlacementCandidate(entry, anchorIndex, direction, pageStart, columns),
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

  specs.sort((a, b) => a.entry.anchorIndex - b.entry.anchorIndex)

  return specs
}

const buildPlacementOrderConstraints = (
  entries: PagePlacementEntry[],
  fixedAssignments: Map<string, number>,
  pageStart: number,
  pageSize: number
): Map<string, PlacementOrderConstraint> => {
  const pageEnd = pageStart + Math.max(1, pageSize)
  const orderedEntries = [...entries].sort((a, b) => a.anchorIndex - b.anchorIndex)
  const constraints = new Map<string, PlacementOrderConstraint>()
  let lastFixedAnchor = pageStart - 1

  orderedEntries.forEach(entry => {
    const fixedAnchor = fixedAssignments.get(entry.id)
    if (fixedAnchor !== undefined) {
      lastFixedAnchor = fixedAnchor
      return
    }
    constraints.set(entry.id, {
      minAnchorExclusive: lastFixedAnchor,
      maxAnchorExclusive: pageEnd,
    })
  })

  let nextFixedAnchor = pageEnd
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
  const lowerBound = Math.max(minAnchorExclusive, constraint?.minAnchorExclusive ?? Number.NEGATIVE_INFINITY)
  const upperBound = constraint?.maxAnchorExclusive ?? Number.POSITIVE_INFINITY
  return candidate.anchorIndex > lowerBound && candidate.anchorIndex < upperBound
}

const assignGreedyPlacements = (
  specs: PlacementSpec[],
  baseOccupied: Set<number>,
  constraints: Map<string, PlacementOrderConstraint>
): PlacementSolution | null => {
  const occupied = new Set(baseOccupied)
  const assignments = new Map<string, number>()
  let totalScore = 0
  let lastAssignedAnchor = Number.NEGATIVE_INFINITY

  for (const spec of specs) {
    const constraint = constraints.get(spec.entry.id)
    const chosen = spec.candidates.find(
      candidate =>
        isCandidateWithinOrderBounds(candidate, constraint, lastAssignedAnchor) &&
        canOccupyFootprint(occupied, candidate.footprint)
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
  constraints: Map<string, PlacementOrderConstraint>
): PlacementSolution | null => {
  const greedy = assignGreedyPlacements(specs, baseOccupied, constraints)
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
      if (!isCandidateWithinOrderBounds(candidate, constraint, lastAssignedAnchor)) continue
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

const buildOrderWithAssignments = (
  order: Array<string | null>,
  pageStart: number,
  pageSize: number,
  entries: PagePlacementEntry[],
  fixedAssignments: Map<string, number>,
  movableSolution: PlacementSolution
): Array<string | null> => {
  const pageEnd = pageStart + Math.max(1, pageSize)
  const next = [...order]
  while (next.length < pageEnd) {
    next.push(null)
  }

  for (let index = pageStart; index < pageEnd; index += 1) {
    next[index] = null
  }

  entries.forEach(entry => {
    const anchorIndex = movableSolution.assignments.get(entry.id) ?? fixedAssignments.get(entry.id)
    if (anchorIndex === undefined) return
    next[anchorIndex] = entry.id
  })

  return next
}

const attemptFootprintDirectionalEvasion = ({
  order,
  pageStart,
  pageSize,
  columns,
  direction,
  draggingItem,
  draggingId,
  items,
  targetIndex,
}: {
  order: Array<string | null>
  pageStart: number
  pageSize: number
  columns: number
  direction: EvasionDirection
  draggingItem: GridItem
  draggingId: string | null
  items: GridItem[]
  targetIndex: number
}): FootprintEvasionResult | null => {
  const reservedFootprint = getFootprintIndices(
    targetIndex,
    getGridItemSpan(draggingItem),
    columns,
    pageSize
  )
  if (!reservedFootprint) return null

  const reservedSet = new Set(reservedFootprint)
  const reservedBounds = buildFootprintBounds(reservedFootprint, pageStart, columns)
  const itemById = new Map<string, GridItem>()
  items.forEach(item => {
    itemById.set(getId(item), item)
  })

  const entries = collectPagePlacementEntries(
    order,
    itemById,
    pageStart,
    pageSize,
    columns,
    reservedSet,
    draggingId
  )
  if (entries.length === 0 && items.length > 0) return null

  const trySolve = (movablePredicate: (entry: PagePlacementEntry) => boolean) => {
    const fixedAssignments = new Map<string, number>()
    const baseOccupied = new Set<number>(reservedFootprint)
    const movableEntries: PagePlacementEntry[] = []

    for (const entry of entries) {
      if (movablePredicate(entry)) {
        movableEntries.push(entry)
        continue
      }
      if (entry.overlapsReserved) {
        movableEntries.push(entry)
        continue
      }
      entry.footprint.forEach(index => baseOccupied.add(index))
      fixedAssignments.set(entry.id, entry.anchorIndex)
    }

    const specs = buildPlacementSpecs({
      entries: movableEntries,
      direction,
      pageStart,
      pageSize,
      columns,
      reservedSet,
      baseOccupied,
    })
    if (!specs) return null

    const constraints = buildPlacementOrderConstraints(entries, fixedAssignments, pageStart, pageSize)
    const solution = assignWithBacktracking(specs, baseOccupied, constraints)
    if (!solution) return null

    return {
      order: buildOrderWithAssignments(
        order,
        pageStart,
        pageSize,
        entries,
        fixedAssignments,
        solution
      ),
      totalScore: solution.totalScore,
    }
  }

  return (
    trySolve(entry => shouldMoveInDirectionalCorridor(entry, reservedBounds, direction)) ??
    trySolve(() => true)
  )
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
  const targetItem =
    options?.items?.find(item => getId(item) === hit.targetId) ?? null
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
    const draggingItem = options.draggingItem
    const items = options.items
    const directionRank = new Map(
      directions.candidates.map((direction, index) => [direction, index] as const)
    )
    let bestDirectionalResult:
      | ({ order: Array<string | null>; direction: EvasionDirection; totalScore: number })
      | null = null

    for (const direction of directions.candidates) {
      const result = attemptFootprintDirectionalEvasion({
        order,
        pageStart,
        pageSize: safePageSize,
        columns: safeColumns,
        direction,
        draggingItem,
        draggingId: getId(draggingItem),
        items,
        targetIndex: targetAnchorIndex,
      })
      if (!result) continue
      if (!bestDirectionalResult) {
        bestDirectionalResult = { ...result, direction }
        continue
      }
      if (result.totalScore < bestDirectionalResult.totalScore) {
        bestDirectionalResult = { ...result, direction }
        continue
      }
      if (
        result.totalScore === bestDirectionalResult.totalScore &&
        directionTieBreakByOverlap &&
        (directionRank.get(direction) ?? Number.POSITIVE_INFINITY) <
          (directionRank.get(bestDirectionalResult.direction) ?? Number.POSITIVE_INFINITY)
      ) {
        bestDirectionalResult = { ...result, direction }
      }
    }

    if (bestDirectionalResult) {
      return {
        order: bestDirectionalResult.order,
        direction: bestDirectionalResult.direction,
      }
    }
  }

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
