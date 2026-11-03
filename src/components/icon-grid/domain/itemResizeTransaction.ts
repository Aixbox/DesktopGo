import type { TileSize, GridItem } from '../model'
import { getGridItemSpan, getId } from '../model'
import { resolveOuterItemIds } from './dock'
import { filterItemsByIds } from './gridItems'
import { compactEmptyPages } from './slots'
import { getFootprintIndices, normalizeOuterSlots } from './topLevelLayout'
import { folderSizeFromSpan } from './folderResizePolicy'

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

/**
 * Build the ColorOS-style temporary resize snapshot. The source tile is
 * kept at its current anchor, growth is clamped to the page edges, and any
 * displaced neighbors use the nearest fitting vacancy on their current page
 * before spilling into later pages. Unaffected anchors stay fixed. Callers can
 * render this plan while the pointer is down and discard it on cancel.
 */
export const planItemResize = ({
  items,
  slots,
  itemId,
  size: requestedSize,
  columns: rawColumns,
  pageSize: rawPageSize,
  dockKeys = [],
}: ItemResizePlanInput): ItemResizePlan | null => {
  const source = items.find(item => getId(item) === itemId)
  if (
    !source ||
    source.kind === 'widget' ||
    dockKeys.includes(itemId) ||
    (source.size ?? '1x1') === requestedSize
  )
    return null

  const columns = Math.max(1, Math.floor(rawColumns))
  const pageSize = Math.max(1, Math.floor(rawPageSize))
  const entryId = itemId
  const sourceAnchorIndex = slots.indexOf(entryId)
  if (sourceAnchorIndex < 0) return null

  const currentSpan = getGridItemSpan(source)
  const requestedSpan = getGridItemSpan({ ...source, size: requestedSize })
  const localAnchor = sourceAnchorIndex % pageSize
  const nextSpan = {
    cols: Math.min(requestedSpan.cols, columns - (localAnchor % columns)),
    rows: Math.min(
      requestedSpan.rows,
      Math.floor(pageSize / columns) - Math.floor(localAnchor / columns)
    ),
  }
  if (nextSpan.cols < 1 || nextSpan.rows < 1) return null
  if (nextSpan.cols === currentSpan.cols && nextSpan.rows === currentSpan.rows) return null
  if (!getFootprintIndices(sourceAnchorIndex, nextSpan, columns, pageSize)) return null
  const size = folderSizeFromSpan(nextSpan)
  const nextItems = items.map(item => (getId(item) === itemId ? { ...item, size } : item))
  const outerIds = resolveOuterItemIds(nextItems.map(getId), dockKeys)
  const nextOuterItems = filterItemsByIds(nextItems, outerIds)
  const anchorIndex = sourceAnchorIndex
  const preferredAnchorById = new Map([[entryId, anchorIndex]])
  const normalizedSlots = normalizeOuterSlots(slots, nextOuterItems, pageSize, columns, {
    preferredAnchorById,
    spillStrategy: 'same-page-first',
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
