import { getGridItemSpan, getId, type GridItem } from '../model'
import type { PageAnchorEntry } from '../domain/topLevelLayout'
import type { DragState, OuterOverlapHit } from '../state/types'
import { buildScrollGroupEntries } from './scrollGroupLayout'
import { resolveScrollGroupHitLayout } from './scrollGroupHitLayout'

// A short hover protects folder creation, without requiring a pause at every cell.
export const SCROLL_GROUP_REORDER_DWELL_MS = 160

export const scrollReorderSignature = (state: DragState, hit: OuterOverlapHit) =>
  state.scrollGroupOrder
    ? `scroll-anchor:${state.hoverTargetIndex}`
    : `compact-overlap:${hit.targetId}:${hit.zone}`

/** Keep single-cell reordering attached to the selected overlap target, including its hysteresis. */
export function resolveScrollGroupReorderAnchor({
  state,
  items,
  columns,
  targetId,
  candidateAnchorIndex,
}: {
  state: DragState
  items: GridItem[]
  columns: number
  targetId: string
  candidateAnchorIndex: number | null
}): number | null {
  const span = getGridItemSpan(state.draggingItem)
  if (!state.scrollGroupOrder || span.cols > 1 || span.rows > 1) return candidateAnchorIndex
  const { entries } = resolveScrollGroupHitLayout(items, state.scrollGroupOrder, columns)
  const target = entries.find(entry => entry.id === targetId)
  if (!target) return candidateAnchorIndex
  const candidate = candidateAnchorIndex ?? target.globalIndex
  const col = Math.max(target.col, Math.min(candidate % columns, target.col + target.span.cols - 1))
  const row = Math.max(
    target.row,
    Math.min(Math.floor(candidate / columns), target.row + target.span.rows - 1)
  )
  return row * columns + col
}

const footprint = (anchor: number, span: { cols: number; rows: number }, columns: number) => {
  const cells: number[] = []
  for (let row = 0; row < span.rows; row++) {
    for (let col = 0; col < span.cols; col++) cells.push(anchor + row * columns + col)
  }
  return cells
}

/** Each prefix has the same placements as the full first-fit layout without the drag. */
function nearestInsertion({
  entries,
  remaining,
  span,
  columns,
  target,
  current,
  preferMoveOnTie,
}: {
  entries: PageAnchorEntry[]
  remaining: string[]
  span: { cols: number; rows: number }
  columns: number
  target: number
  current: PageAnchorEntry | undefined
  preferMoveOnTie: boolean
}) {
  const distance = (anchor: number) =>
    (Math.floor(anchor / columns) - Math.floor(target / columns)) ** 2 +
    ((anchor % columns) - (target % columns)) ** 2
  const byId = new Map(entries.map(entry => [entry.id, entry]))
  const occupied = new Set<number>()
  let anchor = 0
  let bestDistance = current ? distance(current.globalIndex) : Infinity
  let bestIndex: number | null = null
  for (let index = 0; index <= remaining.length; index++) {
    // Occupancy only grows: rejected anchors never need to be tested again.
    while (true) {
      if ((anchor % columns) + span.cols > columns) {
        anchor += columns - (anchor % columns)
        continue
      }
      if (footprint(anchor, span, columns).every(cell => !occupied.has(cell))) break
      anchor++
    }
    const score = distance(anchor)
    // An explicit edge intent should move a neighbor when a different placement is
    // equally close. Ordinary footprint previews retain the current layout on ties.
    const moveOnTie =
      preferMoveOnTie &&
      bestIndex === null &&
      score === bestDistance &&
      anchor !== current?.globalIndex
    if (score < bestDistance || moveOnTie) {
      bestDistance = score
      bestIndex = index
    }
    const entry = byId.get(remaining[index])
    if (entry) footprint(entry.globalIndex, entry.span, columns).forEach(cell => occupied.add(cell))
  }
  return bestIndex
}

/** Choose a compact order using the same continuous grid that is actually rendered. */
export function resolveScrollGroupReorderPreview({
  state,
  items,
  columns: requestedColumns,
  anchorIndex,
  preferMoveOnTie = false,
}: {
  state: DragState
  items: GridItem[]
  columns: number
  anchorIndex: number
  preferMoveOnTie?: boolean
}): { order: string[]; previewSlotIndex: number } {
  const order = state.scrollGroupOrder ?? []
  const columns = items.reduce(
    (count, item) => Math.max(count, getGridItemSpan(item).cols),
    Math.max(1, Math.floor(requestedColumns))
  )
  const itemById = new Map(items.map(item => [getId(item), item]))
  const dragged = new Set(state.draggingIds)
  const remaining = order.filter(id => !dragged.has(id))
  const moving = [...new Set([state.draggingId, ...state.draggingIds])].filter(id =>
    itemById.has(id)
  )
  const { entries } = resolveScrollGroupHitLayout(items, order, columns)
  const current = entries.find(entry => entry.id === state.draggingId)
  const index = nearestInsertion({
    entries: buildScrollGroupEntries(remaining, itemById, columns),
    remaining,
    span: getGridItemSpan(state.draggingItem),
    columns,
    target: anchorIndex,
    current,
    preferMoveOnTie,
  })
  if (index === null) return { order, previewSlotIndex: current?.globalIndex ?? 0 }
  const nextOrder = [...remaining.slice(0, index), ...moving, ...remaining.slice(index)]
  const layout = buildScrollGroupEntries(nextOrder, itemById, columns)
  return {
    order: nextOrder,
    previewSlotIndex: layout.find(entry => entry.id === state.draggingId)?.globalIndex ?? 0,
  }
}
