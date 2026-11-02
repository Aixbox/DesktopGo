import type { TileSize, GridItem } from '../model'
import { getGridItemSpan, getId } from '../model'
import { resolveOuterItemIds } from './dock'
import { filterItemsByIds } from './gridItems'
import { compactEmptyPages } from './slots'
import {
  findBestResizeAnchorIndex,
  getFootprintIndices,
  normalizeOuterSlots,
} from './topLevelLayout'

export interface ItemResizePlanInput {
  items: GridItem[]
  slots: Array<string | null>
  itemId: string
  size: TileSize
  columns: number
  pageSize: number
  dockKeys?: Array<string | null>
}

export interface ItemResizePlan {
  itemId: string
  previousSize: TileSize
  size: TileSize
  items: GridItem[]
  slots: Array<string | null>
  anchorIndex: number
}

const insertEmptyPageWhenResizeWouldOverflow = ({
  slots,
  anchorIndex,
  nextSpan,
  pageSize,
  columns,
}: {
  slots: Array<string | null>
  anchorIndex: number
  nextSpan: { cols: number; rows: number }
  pageSize: number
  columns: number
}) => {
  const footprint = getFootprintIndices(anchorIndex, nextSpan, columns, pageSize)
  if (!footprint) return slots

  const footprintSet = new Set(footprint)
  const pageStart = Math.floor(anchorIndex / pageSize) * pageSize
  const pageEnd = pageStart + pageSize
  let displacedCount = 0
  for (let index = pageStart; index < pageEnd; index += 1) {
    if (!footprintSet.has(index)) continue
    const slot = slots[index]
    if (slot) displacedCount += 1
  }

  let nextPageVacant = 0
  for (let index = pageEnd; index < pageEnd + pageSize; index += 1) {
    if (slots[index] === undefined || slots[index] === null) nextPageVacant += 1
  }
  if (displacedCount <= nextPageVacant) return slots

  return [
    ...slots.slice(0, pageEnd),
    ...Array.from({ length: pageSize }, () => null as string | null),
    ...slots.slice(pageEnd),
  ]
}

/**
 * Build the ColorOS-style temporary resize snapshot. The source tile is
 * excluded from occupancy, the nearest legal anchor is selected, and any
 * displaced neighbors are reflowed into a new temporary order. Callers can
 * render this plan while the pointer is down and discard it on cancel.
 */
export const planItemResize = ({
  items,
  slots,
  itemId,
  size,
  columns: rawColumns,
  pageSize: rawPageSize,
  dockKeys = [],
}: ItemResizePlanInput): ItemResizePlan | null => {
  const source = items.find(item => getId(item) === itemId)
  if (
    !source ||
    source.kind === 'widget' ||
    dockKeys.includes(itemId) ||
    (source.size ?? '1x1') === size
  )
    return null

  const columns = Math.max(1, Math.floor(rawColumns))
  const pageSize = Math.max(1, Math.floor(rawPageSize))
  const nextItems = items.map(item => (getId(item) === itemId ? { ...item, size } : item))
  const outerIds = resolveOuterItemIds(nextItems.map(getId), dockKeys)
  const previousOuterItems = filterItemsByIds(items, outerIds)
  const nextOuterItems = filterItemsByIds(nextItems, outerIds)
  const entryId = itemId
  const sourceAnchorIndex = slots.indexOf(entryId)
  if (sourceAnchorIndex < 0) return null

  const currentSpan = getGridItemSpan(source)
  const nextSpan = getGridItemSpan({ ...source, size })
  if (nextSpan.cols > columns || nextSpan.rows > Math.floor(pageSize / columns)) return null
  const preferredAnchorIndex = findBestResizeAnchorIndex({
    slots,
    items: previousOuterItems,
    itemId: entryId,
    currentAnchorIndex: sourceAnchorIndex,
    currentSpan,
    nextSpan,
    columns,
    pageSize,
  })
  const anchorIndex = preferredAnchorIndex ?? sourceAnchorIndex
  const preferredAnchorById = new Map([[entryId, anchorIndex]])
  const temporarySlots = insertEmptyPageWhenResizeWouldOverflow({
    slots: [...slots],
    anchorIndex,
    nextSpan,
    pageSize,
    columns,
  })
  const normalizedSlots = normalizeOuterSlots(temporarySlots, nextOuterItems, pageSize, columns, {
    preferredAnchorById,
    spillStrategy: 'row-major-forward',
  })

  return {
    itemId,
    previousSize: source.size ?? '1x1',
    size,
    items: nextItems,
    slots: compactEmptyPages(normalizedSlots, pageSize),
    anchorIndex,
  }
}
