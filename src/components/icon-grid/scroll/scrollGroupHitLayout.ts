import { getId, type GridItem } from '../model'
import { buildScrollGroupEntries } from './scrollGroupLayout'

type Snapshot = {
  order: string[]
  columns: number
  entries: ReturnType<typeof buildScrollGroupEntries>
  rowCount: number
}
const snapshots = new WeakMap<GridItem[], Snapshot>()

/** Pointer movement does not change occupancy. Cache only the latest order for each item snapshot. */
export function resolveScrollGroupHitLayout(items: GridItem[], order: string[], columns: number) {
  const cached = snapshots.get(items)
  if (cached?.order === order && cached.columns === columns) return cached
  const entries = buildScrollGroupEntries(
    order,
    new Map(items.map(item => [getId(item), item])),
    columns
  )
  const rowCount = entries.reduce((count, entry) => Math.max(count, entry.row + entry.span.rows), 1)
  const snapshot = { order, columns, entries, rowCount }
  snapshots.set(items, snapshot)
  return snapshot
}
