import type { EvasionDirection, GridItem, GridSpan } from '../model'
import { getGridItemSpan } from '../model'
import { DRAG_HOLE_ID, getSlotRowColWithinPage } from './slots'
import { getFootprintIndices } from './topLevelLayout'

interface FootprintBounds {
  minRow: number
  maxRow: number
  minCol: number
  maxCol: number
}

export interface PagePlacementEntry {
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

export interface PlacementCandidateFilterContext {
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

export interface FootprintEvasionResult {
  order: Array<string | null>
  totalScore: number
}

interface CurrentPageFootprintResultMetrics {
  movedEntryCount: number
  movedNonOverlapCount: number
  totalAnchorShift: number
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

export const scorePlacementCandidate = (
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

export const buildDirectionalOverlapCandidatePredicate = (
  pageStart: number,
  columns: number,
  direction: EvasionDirection
) => {
  return (entry: PagePlacementEntry, context: PlacementCandidateFilterContext) => {
    if (!entry.overlapsReserved) return true
    return movesEntryAlongDirection(entry, context.anchorIndex, pageStart, columns, direction)
  }
}

const movesEntrySingleStepInDirection = (
  entry: PagePlacementEntry,
  anchorIndex: number,
  pageStart: number,
  columns: number,
  direction: EvasionDirection
) => {
  const fromPos = getSlotRowColWithinPage(entry.anchorIndex, pageStart, columns)
  const toPos = getSlotRowColWithinPage(anchorIndex, pageStart, columns)

  if (direction === 'left') return toPos.row === fromPos.row && toPos.col === fromPos.col - 1
  if (direction === 'right') return toPos.row === fromPos.row && toPos.col === fromPos.col + 1
  if (direction === 'up') return toPos.col === fromPos.col && toPos.row === fromPos.row - 1
  return toPos.col === fromPos.col && toPos.row === fromPos.row + 1
}

const buildSingleStepDirectionalOverlapCandidatePredicate = (
  pageStart: number,
  columns: number,
  direction: EvasionDirection
) => {
  return (entry: PagePlacementEntry, context: PlacementCandidateFilterContext) => {
    if (!entry.overlapsReserved) return true
    return movesEntrySingleStepInDirection(
      entry,
      context.anchorIndex,
      pageStart,
      columns,
      direction
    )
  }
}

export const attemptSingleStepDirectionalFootprintEvasion = ({
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
  if (!entries.some(entry => entry.overlapsReserved)) {
    return null
  }

  const rangeEndExclusive = pageStart + Math.max(1, pageSize)
  for (const direction of preferredDirections ?? []) {
    const result = solveFootprintPlacements({
      order,
      entries,
      reservedFootprint,
      rangeStart: pageStart,
      rangeEndExclusive,
      pageStart,
      pageSize,
      columns,
      movablePredicate: entry => entry.overlapsReserved,
      candidatePredicate: buildSingleStepDirectionalOverlapCandidatePredicate(
        pageStart,
        columns,
        direction
      ),
    })
    if (result) {
      return result
    }
  }

  return null
}

const canOccupyFootprint = (occupied: Set<number>, footprint: number[]) =>
  footprint.every(index => !occupied.has(index))

export const collectPagePlacementEntries = ({
  order,
  itemById,
  rangeStart,
  rangeEndExclusive,
  pageStart,
  pageSize,
  columns,
  reservedSet,
  draggingIdSet,
}: {
  order: Array<string | null>
  itemById: Map<string, GridItem>
  rangeStart: number
  rangeEndExclusive: number
  pageStart: number
  pageSize: number
  columns: number
  reservedSet: Set<number>
  draggingIdSet: Set<string>
}): PagePlacementEntry[] => {
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

const buildOrderWithAssignments = ({
  order,
  rangeStart,
  rangeEndExclusive,
  entries,
  fixedAssignments,
  movableSolution,
  minimumLength,
}: {
  order: Array<string | null>
  rangeStart: number
  rangeEndExclusive: number
  entries: PagePlacementEntry[]
  fixedAssignments: Map<string, number>
  movableSolution: PlacementSolution
  minimumLength: number
}): Array<string | null> => {
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

export const solveFootprintPlacements = ({
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
    order: buildOrderWithAssignments({
      order,
      rangeStart,
      rangeEndExclusive,
      entries,
      fixedAssignments,
      movableSolution: solution,
      minimumLength: pageStart + Math.max(1, pageSize),
    }),
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

export const pickBetterCurrentPageFootprintResult = ({
  entries,
  pageStart,
  pageSize,
  current,
  candidate,
  columns,
  preferredDirections,
}: {
  entries: PagePlacementEntry[]
  pageStart: number
  pageSize: number
  current: FootprintEvasionResult | null
  candidate: FootprintEvasionResult | null
  columns: number
  preferredDirections?: EvasionDirection[]
}): FootprintEvasionResult | null => {
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

export const CURRENT_PAGE_FOOTPRINT_STRATEGIES: Array<{
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
