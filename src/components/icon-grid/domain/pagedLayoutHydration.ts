import type { GridItem, PersistedLayout } from '../model'
import { filterItemsByIds } from './gridItems'
import { resolveOuterItemIds } from './dock'
import { getId } from '../model'
import { getLayoutNormalizationMetrics, isSamePagedLayoutConfiguration } from './gridGeometry'
import { normalizeOuterSlots, resizeSlotPages } from './topLevelLayout'
import { compactEmptyPages } from './slots'

/** Prepare a complete replacement while the currently measured grid stays visible. */
export function prepareMeasuredPagedLayout({
  layout,
  items,
  dockKeys,
  slots,
  geometry,
}: {
  layout: PersistedLayout | null
  items: GridItem[]
  dockKeys: Array<string | null>
  slots: Array<string | null>
  geometry: { key: string; columns: number; rows: number }
}) {
  const outerItems = filterItemsByIds(items, resolveOuterItemIds(items.map(getId), dockKeys))
  const storedDimensions =
    layout?.columns && layout?.pageSize && layout.columns > 1 && layout.pageSize > 1
      ? { columns: layout.columns, pageSize: layout.pageSize }
      : null
  const reuseStoredDimensions =
    storedDimensions && isSamePagedLayoutConfiguration(layout?.geometryKey, geometry.key)
  const target = getLayoutNormalizationMetrics(
    outerItems,
    reuseStoredDimensions ? storedDimensions.columns : geometry.columns,
    reuseStoredDimensions ? storedDimensions.pageSize : geometry.columns * geometry.rows
  )
  const positioned = storedDimensions
    ? resizeSlotPages(
        slots,
        outerItems,
        storedDimensions.pageSize,
        target.pageSize,
        storedDimensions.columns,
        target.columns,
        layout?.coordinates
      )
    : slots
  return {
    columns: target.columns,
    rows: Math.max(1, Math.round(target.pageSize / target.columns)),
    slots: compactEmptyPages(
      normalizeOuterSlots(positioned, outerItems, target.pageSize, target.columns),
      target.pageSize
    ),
  }
}
