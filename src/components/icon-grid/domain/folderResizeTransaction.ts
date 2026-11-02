import type { FolderItem, FolderSize, GridItem } from '../model'
import { getGridItemSpan, getId } from '../model'
import { resolveOuterItemIds } from './dock'
import { filterItemsByIds } from './gridItems'
import { compactEmptyPages } from './slots'
import {
  findBestResizeAnchorIndex,
  getFootprintIndices,
  normalizeOuterSlots,
} from './topLevelLayout'

export interface FolderResizePlanInput {
  items: GridItem[]
  slots: Array<string | null>
  folderId: string
  size: FolderSize
  columns: number
  pageSize: number
  dockKeys?: Array<string | null>
}

export interface FolderResizePlan {
  folderId: string
  previousSize: FolderSize
  size: FolderSize
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
 * Build the ColorOS-style temporary resize snapshot. The source folder is
 * excluded from occupancy, the nearest legal anchor is selected, and any
 * displaced neighbors are reflowed into a new temporary order. Callers can
 * render this plan while the pointer is down and discard it on cancel.
 */
export const planFolderResize = ({
  items,
  slots,
  folderId,
  size,
  columns: rawColumns,
  pageSize: rawPageSize,
  dockKeys = [],
}: FolderResizePlanInput): FolderResizePlan | null => {
  const folder = items.find(
    (item): item is FolderItem => item.kind === 'folder' && item.id === folderId
  )
  if (!folder || folder.size === size) return null

  const columns = Math.max(1, Math.floor(rawColumns))
  const pageSize = Math.max(1, Math.floor(rawPageSize))
  const nextItems = items.map(item =>
    item.kind === 'folder' && item.id === folderId ? { ...item, size } : item
  )
  const outerIds = resolveOuterItemIds(nextItems.map(getId), dockKeys)
  const previousOuterItems = filterItemsByIds(items, outerIds)
  const nextOuterItems = filterItemsByIds(nextItems, outerIds)
  const folderEntryId = `folder:${folderId}`
  const sourceAnchorIndex = slots.indexOf(folderEntryId)
  if (sourceAnchorIndex < 0) return null

  const currentSpan = getGridItemSpan(folder)
  const nextSpan = getGridItemSpan({ ...folder, size })
  const preferredAnchorIndex = findBestResizeAnchorIndex({
    slots,
    items: previousOuterItems,
    itemId: folderEntryId,
    currentAnchorIndex: sourceAnchorIndex,
    currentSpan,
    nextSpan,
    columns,
    pageSize,
  })
  const anchorIndex = preferredAnchorIndex ?? sourceAnchorIndex
  const preferredAnchorById = new Map([[folderEntryId, anchorIndex]])
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
    folderId,
    previousSize: folder.size,
    size,
    items: nextItems,
    slots: compactEmptyPages(normalizedSlots, pageSize),
    anchorIndex,
  }
}
