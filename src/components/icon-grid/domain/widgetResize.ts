import type { PersistedPlacement } from '../model'

export interface WidgetResizeBounds {
  minSpanX: number
  minSpanY: number
  maxSpanX: number
  maxSpanY: number
}

export interface WidgetResizeRequest {
  widgetId: string
  sourceRevision: number
  nextSpanX: number
  nextSpanY: number
  bounds: WidgetResizeBounds
}

export type WidgetResizeRejection =
  | 'missing-widget'
  | 'stale-revision'
  | 'invalid-span'
  | 'out-of-bounds'
  | 'occupied'

export interface WidgetResizePreview {
  accepted: boolean
  reason: WidgetResizeRejection | null
  placement: PersistedPlacement | null
}

export interface WidgetResizeSnapshot {
  revision: number
  placements: PersistedPlacement[]
}

export interface WidgetResizeGrid {
  columns: number
  rows: number
}

const isPositiveInteger = (value: number): boolean => Number.isInteger(value) && value > 0

const normalizeBounds = (bounds: WidgetResizeBounds): WidgetResizeBounds => {
  const minSpanX = Math.max(1, Math.floor(bounds.minSpanX))
  const minSpanY = Math.max(1, Math.floor(bounds.minSpanY))
  const maxSpanX = Math.max(minSpanX, Math.floor(bounds.maxSpanX))
  const maxSpanY = Math.max(minSpanY, Math.floor(bounds.maxSpanY))
  return { minSpanX, minSpanY, maxSpanX, maxSpanY }
}

const cellKey = (page: number, row: number, col: number): string => `${page}:${row}:${col}`

const getPlacementCells = (placement: PersistedPlacement): string[] => {
  const cells: string[] = []
  for (let row = 0; row < placement.spanY; row += 1) {
    for (let col = 0; col < placement.spanX; col += 1) {
      cells.push(cellKey(placement.page, placement.row + row, placement.col + col))
    }
  }
  return cells
}

const buildOccupiedCells = (
  placements: readonly PersistedPlacement[],
  excludedId: string
): Set<string> => {
  const occupied = new Set<string>()
  placements.forEach(placement => {
    if (placement.id === excludedId) return
    getPlacementCells(placement).forEach(cell => occupied.add(cell))
  })
  return occupied
}

/**
 * Calculate a resize preview without mutating the canonical snapshot. The
 * source widget is excluded from occupancy, matching AppWidgetResizeFrame's
 * temporary placement behavior while the frame is being dragged.
 */
export const previewWidgetResize = ({
  snapshot,
  grid,
  request,
}: {
  snapshot: WidgetResizeSnapshot
  grid: WidgetResizeGrid
  request: WidgetResizeRequest
}): WidgetResizePreview => {
  const current = snapshot.placements.find(placement => placement.id === request.widgetId)
  if (!current) return { accepted: false, reason: 'missing-widget', placement: null }
  if (request.sourceRevision !== snapshot.revision) {
    return { accepted: false, reason: 'stale-revision', placement: null }
  }

  const bounds = normalizeBounds(request.bounds)
  const spanX = Math.floor(request.nextSpanX)
  const spanY = Math.floor(request.nextSpanY)
  if (
    !isPositiveInteger(spanX) ||
    !isPositiveInteger(spanY) ||
    spanX < bounds.minSpanX ||
    spanY < bounds.minSpanY ||
    spanX > bounds.maxSpanX ||
    spanY > bounds.maxSpanY
  ) {
    return { accepted: false, reason: 'invalid-span', placement: null }
  }

  const columns = Math.max(1, Math.floor(grid.columns))
  const rows = Math.max(1, Math.floor(grid.rows))
  if (current.col + spanX > columns || current.row + spanY > rows) {
    return { accepted: false, reason: 'out-of-bounds', placement: null }
  }

  const candidate: PersistedPlacement = { ...current, spanX, spanY }
  const occupied = buildOccupiedCells(snapshot.placements, request.widgetId)
  if (getPlacementCells(candidate).some(cell => occupied.has(cell))) {
    return { accepted: false, reason: 'occupied', placement: null }
  }
  return { accepted: true, reason: null, placement: candidate }
}

/** Commit only a preview calculated from the same revision. */
export const commitWidgetResize = ({
  snapshot,
  preview,
  sourceRevision,
}: {
  snapshot: WidgetResizeSnapshot
  preview: WidgetResizePreview
  sourceRevision: number
}): WidgetResizeSnapshot | null => {
  if (!preview.accepted || !preview.placement || snapshot.revision !== sourceRevision) return null
  const nextPlacements = snapshot.placements.map(placement =>
    placement.id === preview.placement!.id ? preview.placement! : placement
  )
  return { revision: snapshot.revision + 1, placements: nextPlacements }
}
