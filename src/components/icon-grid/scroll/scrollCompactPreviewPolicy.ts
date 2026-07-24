import type { GridItem, HoverZone } from '../model'
import { getGridItemSpan, getId } from '../model'
import type { DragState } from '../state/types'
import { DRAG_HOLE_ID } from '../domain/slots'
import { getFolderChildSelectionsByIds } from '../domain/folderPolicy'
import { getFootprintIndices } from '../domain/topLevelLayout'
import { buildCompactOuterDropPreview } from './scrollTopLevelLayout'

export interface CompactOuterPreviewValue {
  order: Array<string | null>
  previewSlotIndex: number | null
}

export interface CachedCompactOuterPreview extends CompactOuterPreviewValue {
  signature: string
}

export const buildCompactOuterPreviewItems = ({
  state,
  outerItems,
  allItems,
  itemById,
}: {
  state: DragState
  outerItems: GridItem[]
  allItems: GridItem[]
  itemById: Map<string, GridItem>
}): GridItem[] => {
  const next = new Map(outerItems.map(item => [getId(item), item] as const))
  next.set(state.draggingId, state.draggingItem)

  getFolderChildSelectionsByIds(allItems, state.draggingIds).forEach(children => {
    children.forEach(child => next.set(child.key, child))
  })
  state.draggingIds.forEach(id => {
    if (next.has(id)) return
    const item = itemById.get(id)
    if (item) next.set(id, item)
  })
  return Array.from(next.values())
}

const placePreviewIdsOnPage = ({
  ids,
  itemById,
  pageStart,
  pageSize,
  columns,
}: {
  ids: string[]
  itemById: Map<string, GridItem>
  pageStart: number
  pageSize: number
  columns: number
}): { pageSlots: Array<string | null>; overflowIds: string[] } => {
  const safePageSize = Math.max(1, pageSize)
  const safeColumns = Math.max(1, columns)
  const pageSlots: Array<string | null> = Array.from({ length: safePageSize }, () => null)
  const occupied = Array.from({ length: safePageSize }, () => false)
  const overflowIds: string[] = []

  ids.forEach(id => {
    const item = itemById.get(id)
    if (!item) return
    const span = getGridItemSpan(item)
    let placed = false
    for (let localAnchor = 0; localAnchor < safePageSize; localAnchor += 1) {
      if (pageSlots[localAnchor]) continue
      const footprint = getFootprintIndices(
        pageStart + localAnchor,
        span,
        safeColumns,
        safePageSize
      )
      if (!footprint) continue
      const localFootprint = footprint.map(index => index - pageStart)
      if (localFootprint.some(index => index < 0 || index >= safePageSize || occupied[index])) {
        continue
      }

      pageSlots[localAnchor] = id
      localFootprint.forEach(index => {
        occupied[index] = true
      })
      placed = true
      break
    }
    if (!placed) overflowIds.push(id)
  })
  return { pageSlots, overflowIds }
}

export const compactPreviewOrderByPage = ({
  sourceOrder,
  itemById,
  omittedIds,
  pageSize,
  columns,
  minPageCount = 1,
}: {
  sourceOrder: Array<string | null>
  itemById: Map<string, GridItem>
  omittedIds: ReadonlySet<string>
  pageSize: number
  columns: number
  minPageCount?: number
}): Array<string | null> => {
  const safePageSize = Math.max(1, pageSize)
  const pageCount = Math.max(
    1,
    minPageCount,
    Math.ceil(Math.max(sourceOrder.length, safePageSize) / safePageSize)
  )
  const result: Array<string | null> = []
  let carryIds: string[] = []

  for (let page = 0; page < pageCount; page += 1) {
    const pageStart = page * safePageSize
    const pageIds = sourceOrder
      .slice(pageStart, pageStart + safePageSize)
      .filter(
        (slot): slot is string =>
          typeof slot === 'string' &&
          slot !== DRAG_HOLE_ID &&
          !omittedIds.has(slot) &&
          itemById.has(slot)
      )
    const placed = placePreviewIdsOnPage({
      ids: [...carryIds, ...pageIds],
      itemById,
      pageStart,
      pageSize: safePageSize,
      columns,
    })
    result.push(...placed.pageSlots)
    carryIds = placed.overflowIds
  }

  while (carryIds.length > 0) {
    const placed = placePreviewIdsOnPage({
      ids: carryIds,
      itemById,
      pageStart: result.length,
      pageSize: safePageSize,
      columns,
    })
    result.push(...placed.pageSlots)
    if (placed.overflowIds.length === carryIds.length) break
    carryIds = placed.overflowIds
  }
  return result.length > 0 ? result : Array.from({ length: safePageSize }, () => null)
}

export const buildCompactOuterBaseOrder = ({
  state,
  sourceOrder,
  previewItems,
  pageSize,
  columns,
  minPageCount,
}: {
  state: DragState
  sourceOrder: Array<string | null>
  previewItems: GridItem[]
  pageSize: number
  columns: number
  minPageCount?: number
}): Array<string | null> => {
  const draggingIds = new Set(state.draggingIds)
  const itemById = new Map(
    previewItems
      .filter(item => !draggingIds.has(getId(item)))
      .map(item => [getId(item), item] as const)
  )
  return compactPreviewOrderByPage({
    sourceOrder,
    itemById,
    omittedIds: draggingIds,
    pageSize,
    columns,
    minPageCount,
  })
}

export const resolveCompactOuterPreview = ({
  state,
  targetId,
  zone,
  baseOrder,
  sourceOrder,
  previewItems,
  pageSize,
  columns,
  minPageCount,
  cached,
}: {
  state: DragState
  targetId: string
  zone: HoverZone
  baseOrder: Array<string | null>
  sourceOrder: Array<string | null>
  previewItems: GridItem[]
  pageSize: number
  columns: number
  minPageCount?: number
  cached: CachedCompactOuterPreview | null
}): { preview: CompactOuterPreviewValue; cache: CachedCompactOuterPreview | null } => {
  const targetIndex = baseOrder.indexOf(targetId)
  if (targetIndex < 0) {
    return {
      preview: { order: state.workingOrder, previewSlotIndex: state.previewSlotIndex },
      cache: cached,
    }
  }

  const currentSourceIndex = sourceOrder.indexOf(state.draggingId)
  const safePageSize = Math.max(1, pageSize)
  const signature = [
    targetId,
    targetIndex,
    zone,
    currentSourceIndex >= 0 ? currentSourceIndex : (state.sourceSlotIndex ?? 'external'),
    state.draggingIds.join(','),
    safePageSize,
    columns,
    minPageCount ?? 1,
  ].join(':')
  if (cached?.signature === signature) {
    return {
      preview: { order: cached.order, previewSlotIndex: cached.previewSlotIndex },
      cache: cached,
    }
  }

  const preview = buildCompactOuterDropPreview({
    slots: sourceOrder,
    items: previewItems,
    draggingIds: state.draggingIds,
    sourceIndex: currentSourceIndex >= 0 ? currentSourceIndex : state.sourceSlotIndex,
    targetIndex,
    targetId,
    zone,
    pageSize: safePageSize,
    columns,
    minPageCount,
    respectDropZone: true,
  })
  return { preview, cache: { signature, ...preview } }
}
