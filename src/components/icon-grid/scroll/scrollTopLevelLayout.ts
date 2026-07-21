import type { GridItem, HoverZone } from '../model'
import { getGridItemSpan, getId } from '../model'
import { DRAG_HOLE_ID } from '../domain/slots'
import { getFootprintIndices, normalizeOuterSlots } from '../domain/topLevelLayout'

const buildItemMap = (items: GridItem[]) => new Map(items.map(item => [getId(item), item]))

export const recoverInfiniteScrollGroupSlots = (
  slots: Array<string | null>,
  items: GridItem[],
  previousPageSize: number,
  columns: number,
  groupCount: number
): Array<string | null> => {
  const safePreviousPageSize = Math.max(1, previousPageSize)
  const safeColumns = Math.max(1, columns)
  const safeGroupCount = Math.max(1, groupCount)
  const itemById = buildItemMap(items)
  const validItemIds = new Set(itemById.keys())
  const consumed = new Set<string>()
  const groups = Array.from({ length: safeGroupCount }, () => [] as string[])

  const pushUnique = (groupIndex: number, id: string) => {
    if (!validItemIds.has(id) || consumed.has(id)) return
    consumed.add(id)
    groups[groupIndex].push(id)
  }

  for (let groupIndex = 0; groupIndex < safeGroupCount; groupIndex += 1) {
    const start = groupIndex * safePreviousPageSize
    const end = start + safePreviousPageSize
    slots.slice(start, end).forEach(slot => {
      if (typeof slot === 'string' && slot !== DRAG_HOLE_ID) pushUnique(groupIndex, slot)
    })
  }

  const lastGroupIndex = safeGroupCount - 1
  slots.slice(safeGroupCount * safePreviousPageSize).forEach(slot => {
    if (typeof slot === 'string' && slot !== DRAG_HOLE_ID) pushUnique(lastGroupIndex, slot)
  })
  items.forEach(item => pushUnique(lastGroupIndex, getId(item)))

  const requiredCellCount = items.reduce((total, item) => {
    const span = getGridItemSpan(item)
    return total + span.cols * span.rows
  }, 0)
  const groupSize = Math.max(
    safePreviousPageSize,
    Math.ceil(Math.max(1, requiredCellCount) / safeColumns) * safeColumns
  )

  return groups.flatMap(ids => {
    const groupItems = ids
      .map(id => itemById.get(id))
      .filter((item): item is GridItem => Boolean(item))
    const normalized = normalizeOuterSlots(ids, groupItems, groupSize, safeColumns, {
      preserveSourceAnchors: false,
      spillStrategy: 'row-major-forward',
    }).slice(0, groupSize)
    while (normalized.length < groupSize) normalized.push(null)
    return normalized
  })
}

export const reorderScrollGroupPages = (
  slots: Array<string | null>,
  pageSize: number,
  pageCount: number,
  sourcePage: number,
  targetPage: number
): Array<string | null> => {
  const safePageSize = Math.max(1, pageSize)
  const effectivePageCount = Math.max(
    1,
    pageCount,
    Math.ceil(Math.max(slots.length, safePageSize) / safePageSize)
  )
  const safeSourcePage = Math.min(Math.max(0, sourcePage), effectivePageCount - 1)
  const safeTargetPage = Math.min(Math.max(0, targetPage), effectivePageCount - 1)
  const paddedSlots = slots.slice(0, effectivePageCount * safePageSize)

  while (paddedSlots.length < effectivePageCount * safePageSize) {
    paddedSlots.push(null)
  }
  if (safeSourcePage === safeTargetPage) return paddedSlots

  const pages = Array.from({ length: effectivePageCount }, (_, page) =>
    paddedSlots.slice(page * safePageSize, (page + 1) * safePageSize)
  )
  const [movedPage] = pages.splice(safeSourcePage, 1)
  pages.splice(safeTargetPage, 0, movedPage)
  return pages.flat()
}

export const remapScrollPageIndexAfterReorder = (
  activePage: number,
  sourcePage: number,
  targetPage: number
): number => {
  if (activePage === sourcePage) return targetPage
  if (sourcePage < activePage && activePage <= targetPage) return activePage - 1
  if (targetPage <= activePage && activePage < sourcePage) return activePage + 1
  return activePage
}

export const compactOuterSlotsWithinPages = (
  slots: Array<string | null>,
  items: GridItem[],
  pageSize: number,
  columns: number,
  minPageCount = 1
): Array<string | null> => {
  const safePageSize = Math.max(1, pageSize)
  const safeColumns = Math.max(1, columns)
  const itemById = buildItemMap(items)
  const sourcePageCount = Math.max(
    1,
    minPageCount,
    Math.ceil(Math.max(slots.length, safePageSize) / safePageSize)
  )
  const result: Array<string | null> = []
  const placedIds = new Set<string>()
  let carryIds: string[] = []

  const placePage = (ids: string[]) => {
    const pageItems = ids
      .map(id => itemById.get(id))
      .filter((item): item is GridItem => Boolean(item))
    const compacted = normalizeOuterSlots(ids, pageItems, safePageSize, safeColumns, {
      preserveSourceAnchors: false,
      spillStrategy: 'row-major-forward',
    })
    const pageSlots = compacted.slice(0, safePageSize)
    pageSlots.forEach(slot => {
      if (slot) placedIds.add(slot)
    })
    result.push(...pageSlots)
    carryIds = compacted
      .slice(safePageSize)
      .filter((slot): slot is string => typeof slot === 'string' && !placedIds.has(slot))
  }

  for (let page = 0; page < sourcePageCount; page += 1) {
    const pageStart = page * safePageSize
    const pageEnd = pageStart + safePageSize
    const queuedIds = new Set(carryIds)
    const pageIds = slots
      .slice(pageStart, pageEnd)
      .filter(
        (slot): slot is string =>
          typeof slot === 'string' &&
          slot !== DRAG_HOLE_ID &&
          itemById.has(slot) &&
          !placedIds.has(slot) &&
          !queuedIds.has(slot)
      )
    placePage([...carryIds, ...pageIds])
  }

  while (carryIds.length > 0) {
    placePage(carryIds)
  }

  const minimumLength = Math.max(1, minPageCount) * safePageSize
  while (result.length < minimumLength) {
    result.push(null)
  }

  while (result.length > minimumLength) {
    const lastPageStart = result.length - safePageSize
    const lastPageHasAnchor = result
      .slice(lastPageStart)
      .some(slot => typeof slot === 'string' && slot !== DRAG_HOLE_ID)
    if (lastPageHasAnchor) break
    result.splice(lastPageStart, safePageSize)
  }

  return result
}
export const maskDraggingIdsInCompactOrder = (
  order: Array<string | null>,
  draggingIds: string[]
): Array<string | null> => {
  const draggingIdSet = new Set(draggingIds)
  return order.map(slot => (typeof slot === 'string' && draggingIdSet.has(slot) ? null : slot))
}

export const resolveCompactStableTargetId = ({
  baseOrder,
  workingOrder,
  draggingIds,
  slotIndex,
}: {
  baseOrder: Array<string | null>
  workingOrder: Array<string | null>
  draggingIds: string[]
  slotIndex: number
}): string | null => {
  const draggingIdSet = new Set(draggingIds)
  const workingId = workingOrder[slotIndex]
  if (typeof workingId === 'string' && draggingIdSet.has(workingId)) {
    return null
  }

  const stableId = baseOrder[slotIndex]
  if (typeof stableId !== 'string' || stableId === DRAG_HOLE_ID || draggingIdSet.has(stableId)) {
    return null
  }

  return stableId
}

export const preserveCompactPreviewOrderForCommit = (
  slots: Array<string | null>,
  items: GridItem[]
): Array<string | null> | null => {
  const previewSlots = slots.map(slot => (slot === DRAG_HOLE_ID ? null : slot))
  const previewIds = previewSlots.filter((slot): slot is string => typeof slot === 'string')
  const expectedIds = items.map(getId)
  const previewIdSet = new Set(previewIds)
  const expectedIdSet = new Set(expectedIds)

  if (previewIds.length !== previewIdSet.size || expectedIds.length !== expectedIdSet.size) {
    return null
  }
  if (previewIdSet.size !== expectedIdSet.size) return null
  if (expectedIds.some(id => !previewIdSet.has(id))) return null

  return previewSlots
}

export const isCompactSlotVacantForDrag = ({
  order,
  items,
  draggingIds,
  slotIndex,
  pageSize,
  columns,
}: {
  order: Array<string | null>
  items: GridItem[]
  draggingIds: string[]
  slotIndex: number
  pageSize: number
  columns: number
}): boolean => {
  const rawSlot = order[slotIndex]
  const draggingIdSet = new Set(draggingIds)
  if (typeof rawSlot === 'string') {
    return draggingIdSet.has(rawSlot)
  }

  const itemById = buildItemMap(items)
  const safePageSize = Math.max(1, pageSize)
  const pageStart = Math.floor(Math.max(0, slotIndex) / safePageSize) * safePageSize
  const pageEnd = pageStart + safePageSize
  for (let anchorIndex = pageStart; anchorIndex < pageEnd; anchorIndex += 1) {
    const anchorId = order[anchorIndex]
    if (typeof anchorId !== 'string' || draggingIdSet.has(anchorId) || anchorId === DRAG_HOLE_ID) {
      continue
    }
    const item = itemById.get(anchorId)
    if (!item) continue
    const footprint = getFootprintIndices(
      anchorIndex,
      getGridItemSpan(item),
      Math.max(1, columns),
      safePageSize
    )
    if (footprint?.includes(slotIndex)) return false
  }

  return true
}

interface CompactOuterDropPreviewParams {
  slots: Array<string | null>
  items: GridItem[]
  draggingIds: string[]
  sourceIndex: number | null
  targetIndex: number
  targetId?: string | null
  zone?: HoverZone | null
  pageSize: number
  columns: number
  minPageCount?: number
  respectDropZone?: boolean
}

const shouldInsertAfterTarget = (
  zone: HoverZone | null | undefined,
  sourceIndex: number | null,
  targetSourceIndex: number,
  respectDropZone = false
) => {
  if (respectDropZone) {
    if (zone === 'right' || zone === 'down') return true
    if (zone === 'left' || zone === 'up') return false
  }
  if (sourceIndex !== null && targetSourceIndex >= 0 && sourceIndex !== targetSourceIndex) {
    return sourceIndex < targetSourceIndex
  }
  if (zone === 'right' || zone === 'down') return true
  if (zone === 'left' || zone === 'up') return false
}

const placeCompactPageIds = (
  ids: string[],
  itemById: Map<string, GridItem>,
  pageSize: number,
  columns: number
) => {
  const pageItems = ids
    .map(id => itemById.get(id))
    .filter((item): item is GridItem => Boolean(item))
  const compacted = normalizeOuterSlots(ids, pageItems, pageSize, columns, {
    preserveSourceAnchors: false,
    spillStrategy: 'row-major-forward',
  })

  return {
    pageSlots: compacted.slice(0, pageSize),
    overflowIds: compacted
      .slice(pageSize)
      .filter((slot): slot is string => typeof slot === 'string'),
  }
}

export const buildCompactOuterDropPreview = ({
  slots,
  items,
  draggingIds,
  sourceIndex,
  targetIndex,
  targetId,
  zone,
  pageSize,
  columns,
  minPageCount = 1,
  respectDropZone = false,
}: CompactOuterDropPreviewParams): {
  order: Array<string | null>
  previewSlotIndex: number | null
} => {
  const safePageSize = Math.max(1, pageSize)
  const safeColumns = Math.max(1, columns)
  const itemById = buildItemMap(items)
  const uniqueDraggingIds = Array.from(new Set(draggingIds)).filter(id => itemById.has(id))
  if (uniqueDraggingIds.length === 0) {
    return { order: slots, previewSlotIndex: null }
  }

  const draggingIdSet = new Set(uniqueDraggingIds)
  const targetPage = Math.floor(Math.max(0, targetIndex) / safePageSize)
  const requiredPageCount = Math.max(1, minPageCount, targetPage + 1)
  const baseItems = items.filter(item => !draggingIdSet.has(getId(item)))
  const baseSlots = slots.map(slot =>
    typeof slot === 'string' && draggingIdSet.has(slot) ? null : slot
  )
  const baseOrder = compactOuterSlotsWithinPages(
    baseSlots,
    baseItems,
    safePageSize,
    safeColumns,
    requiredPageCount
  )
  const pageStart = targetPage * safePageSize
  const pageEnd = pageStart + safePageSize
  const targetPageIds = baseOrder
    .slice(pageStart, pageEnd)
    .filter((slot): slot is string => typeof slot === 'string' && slot !== DRAG_HOLE_ID)
  const indexedTargetId = baseOrder[targetIndex]
  const resolvedTargetId =
    targetId !== undefined
      ? targetId && targetPageIds.includes(targetId)
        ? targetId
        : null
      : typeof indexedTargetId === 'string' && targetPageIds.includes(indexedTargetId)
        ? indexedTargetId
        : null

  let insertIndex: number
  if (resolvedTargetId) {
    const targetCompactIndex = targetPageIds.indexOf(resolvedTargetId)
    const targetSourceIndex = slots.indexOf(resolvedTargetId)
    insertIndex =
      targetCompactIndex +
      (shouldInsertAfterTarget(zone, sourceIndex, targetSourceIndex, respectDropZone) ? 1 : 0)
  } else {
    const clampedTargetIndex = Math.min(Math.max(pageStart, targetIndex), pageEnd)
    insertIndex = baseOrder
      .slice(pageStart, clampedTargetIndex)
      .filter(slot => typeof slot === 'string' && slot !== DRAG_HOLE_ID).length
  }

  const reorderedTargetPageIds = [...targetPageIds]
  reorderedTargetPageIds.splice(
    Math.min(Math.max(0, insertIndex), reorderedTargetPageIds.length),
    0,
    ...uniqueDraggingIds
  )

  const result = baseOrder.slice(0, pageStart)
  const placedIds = new Set(
    result.filter((slot): slot is string => typeof slot === 'string' && slot !== DRAG_HOLE_ID)
  )
  let carryIds = reorderedTargetPageIds
  const sourcePageCount = Math.max(requiredPageCount, Math.ceil(baseOrder.length / safePageSize))

  for (let page = targetPage; page < sourcePageCount; page += 1) {
    const existingPageIds =
      page === targetPage
        ? []
        : baseOrder
            .slice(page * safePageSize, (page + 1) * safePageSize)
            .filter(
              (slot): slot is string =>
                typeof slot === 'string' && slot !== DRAG_HOLE_ID && !placedIds.has(slot)
            )
    const queuedIds = Array.from(new Set([...carryIds, ...existingPageIds])).filter(
      id => !placedIds.has(id)
    )
    const placement = placeCompactPageIds(queuedIds, itemById, safePageSize, safeColumns)
    result.push(...placement.pageSlots)
    placement.pageSlots.forEach(slot => {
      if (typeof slot === 'string') placedIds.add(slot)
    })
    carryIds = placement.overflowIds.filter(id => !placedIds.has(id))
  }

  while (carryIds.length > 0) {
    const placement = placeCompactPageIds(carryIds, itemById, safePageSize, safeColumns)
    result.push(...placement.pageSlots)
    placement.pageSlots.forEach(slot => {
      if (typeof slot === 'string') placedIds.add(slot)
    })
    const nextCarryIds = placement.overflowIds.filter(id => !placedIds.has(id))
    if (nextCarryIds.length === carryIds.length) break
    carryIds = nextCarryIds
  }

  const previewSlotIndex = result.indexOf(uniqueDraggingIds[0])
  return {
    order: result,
    previewSlotIndex: previewSlotIndex >= 0 ? previewSlotIndex : null,
  }
}
