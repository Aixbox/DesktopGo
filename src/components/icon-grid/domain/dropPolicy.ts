import type { FolderItem, GridItem } from '../model'
import { getGridItemSpan, getId, makeFolderId } from '../model'
import { translate } from '../../../lib/i18n'
import { clampNumber } from './geometry'
import { DRAG_HOLE_ID } from './slots'
import type { DragState } from '../state/types'
import { canPlaceItemAtAnchorIndex, normalizeOuterSlots } from './topLevelLayout'

export const applyFolderCreateFromSession = (
  base: GridItem[],
  session: DragState
): { items: GridItem[]; slots: Array<string | null> } => {
  const baseSlots = session.workingOrder.map(slot => (slot === DRAG_HOLE_ID ? null : slot))
  const map = new Map<string, GridItem>()
  base.forEach(item => map.set(getId(item), item))
  const sourceExistsInBase = map.has(session.draggingId)
  map.set(session.draggingId, session.draggingItem)
  const sourceItem = map.get(session.draggingId)
  const targetId = session.folderPreviewTargetId as string
  const targetItem = map.get(targetId)
  if (!sourceItem || !targetItem || sourceItem.kind !== 'icon' || targetItem.kind !== 'icon') {
    return { items: base, slots: baseSlots }
  }

  const targetSlotIndex = baseSlots.indexOf(targetId)
  if (targetSlotIndex < 0) return { items: base, slots: baseSlots }
  const folder: FolderItem = {
    kind: 'folder',
    id: makeFolderId(),
    name: translate('New Folder'),
    size: '1x1',
    children: [targetItem, sourceItem],
  }
  const folderId = getId(folder)
  map.delete(session.draggingId)
  map.delete(targetId)
  map.set(folderId, folder)
  const nextSlots = [...baseSlots]
  const sourceSlotIndex = nextSlots.indexOf(session.draggingId)
  if (sourceSlotIndex >= 0) {
    nextSlots[sourceSlotIndex] = null
  }
  nextSlots[targetSlotIndex] = folderId
  const nextItems: GridItem[] = []
  let insertedFolder = false
  base.forEach(item => {
    const id = getId(item)
    if (id === session.draggingId) {
      if (!sourceExistsInBase) {
        nextItems.push(item)
      }
      return
    }
    if (id === targetId) {
      nextItems.push(folder)
      insertedFolder = true
      return
    }
    nextItems.push(item)
  })
  if (!insertedFolder) return { items: base, slots: baseSlots }
  return { items: nextItems, slots: nextSlots }
}

export const applyAddToFolderFromSession = (
  base: GridItem[],
  session: DragState,
  targetFolderId: string
): { items: GridItem[]; slots: Array<string | null> } => {
  const baseSlots = session.workingOrder.map(slot => (slot === DRAG_HOLE_ID ? null : slot))
  const map = new Map<string, GridItem>()
  base.forEach(item => map.set(getId(item), item))
  const targetFolder = map.get(targetFolderId)
  if (!targetFolder || targetFolder.kind !== 'folder') {
    return { items: base, slots: baseSlots }
  }

  const draggingIds = session.draggingIds.length > 0 ? session.draggingIds : [session.draggingId]
  const draggingIdSet = new Set(draggingIds)
  const draggedIcons = draggingIds.flatMap(id => {
    const item = id === session.draggingId ? session.draggingItem : map.get(id)
    return item?.kind === 'icon' ? [item] : []
  })
  if (draggedIcons.length === 0) {
    return { items: base, slots: baseSlots }
  }

  const nextFolderChildren = [...targetFolder.children]
  const existingChildKeys = new Set(targetFolder.children.map(child => child.key))
  draggedIcons.forEach(icon => {
    if (existingChildKeys.has(icon.key)) return
    existingChildKeys.add(icon.key)
    nextFolderChildren.push(icon)
  })
  const nextTargetFolder = { ...targetFolder, children: nextFolderChildren }
  map.set(targetFolderId, nextTargetFolder)

  const nextSlots = baseSlots.map(slot => (slot && draggingIdSet.has(slot) ? null : slot))
  const nextItems: GridItem[] = []
  base.forEach(item => {
    const id = getId(item)
    if (id === targetFolderId) {
      nextItems.push(nextTargetFolder)
      return
    }
    if (draggingIdSet.has(id)) {
      return
    }
    nextItems.push(item)
  })
  return { items: nextItems, slots: nextSlots }
}

interface ApplyOuterDropFromSessionParams {
  base: GridItem[]
  session: DragState
  pageSize: number
  columns?: number
  resolveNearestSlotIndexByContext: (state: DragState) => number | null
  mode?: 'paged' | 'linear'
  sourceSlots?: Array<string | null>
  previewSlots?: Array<string | null>
}

export const applyOuterDropFromSession = ({
  base,
  session,
  pageSize,
  columns = 1,
  resolveNearestSlotIndexByContext,
  mode = 'paged',
  sourceSlots,
  previewSlots,
}: ApplyOuterDropFromSessionParams): { items: GridItem[]; slots: Array<string | null> } => {
  const safePageSize = Math.max(1, pageSize)
  const map = new Map<string, GridItem>()
  base.forEach(item => map.set(getId(item), item))
  const hadDraggedInBase = map.has(session.draggingId)
  map.set(session.draggingId, session.draggingItem)
  const dragIds = [session.draggingId]
  const baseSlots = resolveCommittedBaseSlots(sourceSlots ?? session.workingOrder, dragIds)

  let nextSlots: Array<string | null> = [...baseSlots]
  if (nextSlots.length === 0) {
    nextSlots = Array.from({ length: safePageSize }, () => null)
  }

  const nearestDropIndex = resolveNearestSlotIndexByContext(session)
  const sourceFallbackIndex = session.sourceFolderId ? null : session.sourceSlotIndex
  const emptyFallbackIndex = session.sourceFolderId ? null : nextSlots.indexOf(null)
  const candidateDropIndex =
    session.previewSlotIndex ?? nearestDropIndex ?? sourceFallbackIndex ?? emptyFallbackIndex
  if (candidateDropIndex === null || candidateDropIndex < 0) {
    return { items: base, slots: baseSlots }
  }

  if (mode === 'linear') {
    const compactSlots = nextSlots.filter((slot): slot is string => typeof slot === 'string')
    const dropIndex = clampNumber(candidateDropIndex, 0, compactSlots.length)
    compactSlots.splice(dropIndex, 0, session.draggingId)
    const nextItems = hadDraggedInBase ? base : [...base, session.draggingItem]
    return { items: nextItems, slots: compactSlots }
  }
  const nextItems = hadDraggedInBase ? base : [...base, session.draggingItem]
  return applyPagedOuterDrop({
    slots: nextSlots,
    items: nextItems,
    pageSize: safePageSize,
    columns,
    dropIndex: candidateDropIndex,
    dragIds,
    previewSlots: resolveCommittedBaseSlots(previewSlots ?? session.workingOrder, dragIds),
  })
}

const prioritizeDraggedItems = (items: GridItem[], dragIds: string[]) => {
  if (dragIds.length <= 1) return items

  const dragIdSet = new Set(dragIds)
  const draggedItems: GridItem[] = []
  const remainingItems: GridItem[] = []

  items.forEach(item => {
    if (dragIdSet.has(getId(item))) {
      draggedItems.push(item)
      return
    }
    remainingItems.push(item)
  })

  return [...draggedItems, ...remainingItems]
}

const resolveCommittedBaseSlots = (
  slots: Array<string | null>,
  dragIds: string[]
): Array<string | null> => {
  const dragIdSet = new Set(dragIds)
  return slots.map(slot => {
    if (slot === DRAG_HOLE_ID) return null
    return slot && dragIdSet.has(slot) ? null : slot
  })
}

const buildPreferredAnchorByIdFromSlots = (slots: Array<string | null>) => {
  const preferredAnchorById = new Map<string, number>()
  slots.forEach((slot, index) => {
    if (typeof slot !== 'string' || preferredAnchorById.has(slot)) return
    preferredAnchorById.set(slot, index)
  })
  return preferredAnchorById
}

const applyPagedOuterDrop = ({
  slots,
  items,
  pageSize,
  columns,
  dropIndex,
  dragIds,
  previewSlots,
}: {
  slots: Array<string | null>
  items: GridItem[]
  pageSize: number
  columns: number
  dropIndex: number
  dragIds: string[]
  previewSlots?: Array<string | null>
}): { items: GridItem[]; slots: Array<string | null> } => {
  const safePageSize = Math.max(1, pageSize)
  const safeColumns = Math.max(1, columns)
  const clampedDropIndex = clampNumber(dropIndex, 0, Number.MAX_SAFE_INTEGER)
  const pageStart = Math.floor(clampedDropIndex / safePageSize) * safePageSize
  const insertedSlots = [...slots]
  const pageOverflowIds = insertIntoPageFromAnchor({
    slots: insertedSlots,
    sourceSlots: slots,
    items,
    pageStart,
    pageSize: safePageSize,
    columns: safeColumns,
    dropIndex: clampedDropIndex,
    dragIds,
    previewSlots,
  })
  const stabilizedSlots = stabilizeMultiDropPage({
    sourceSlots: slots,
    insertedSlots,
    items,
    pageStart,
    pageSize: safePageSize,
    columns: safeColumns,
    pageOverflowIds,
  })
  const backfilledSlots = backfillDisplacedCurrentPageItems({
    referenceSlots: previewSlots ?? slots,
    slots: stabilizedSlots,
    items,
    pageStart,
    pageSize: safePageSize,
    columns: safeColumns,
    dragIds,
  })

  if (backfilledSlots.length === 0) {
    backfilledSlots.push(...Array.from({ length: safePageSize }, () => null))
  }
  const remainder = backfilledSlots.length % safePageSize
  if (remainder > 0) {
    backfilledSlots.push(...Array.from({ length: safePageSize - remainder }, () => null))
  }

  return {
    items,
    slots: normalizeOuterSlots(backfilledSlots, items, safePageSize, safeColumns, {
      preferredAnchorById: buildPreferredAnchorByIdFromSlots(backfilledSlots),
      preserveSourceAnchors: false,
      spillStrategy: 'row-major-forward',
    }),
  }
}

const placeIdsIntoSlotsRowMajor = ({
  slots,
  items,
  ids,
  pageStart,
  pageSize,
  columns,
}: {
  slots: Array<string | null>
  items: GridItem[]
  ids: string[]
  pageStart: number
  pageSize: number
  columns: number
}) => {
  const nextSlots = [...slots]
  const remainingIds = [...ids]

  for (let anchorIndex = pageStart; anchorIndex < pageStart + pageSize && remainingIds.length > 0; anchorIndex += 1) {
    const itemId = remainingIds[0]
    const item = items.find(candidate => getId(candidate) === itemId)
    if (!item) {
      remainingIds.shift()
      continue
    }
    if (
      !canPlaceItemAtAnchorIndex(
        nextSlots,
        items,
        anchorIndex,
        getGridItemSpan(item),
        columns,
        pageSize
      )
    ) {
      continue
    }
    nextSlots[anchorIndex] = itemId
    remainingIds.shift()
  }

  return {
    slots: nextSlots,
    remainingIds,
  }
}

const placeIdsIntoInsertedPagesRowMajor = ({
  prefixSlots,
  items,
  ids,
  pageStart,
  pageSize,
  columns,
}: {
  prefixSlots: Array<string | null>
  items: GridItem[]
  ids: string[]
  pageStart: number
  pageSize: number
  columns: number
}) => {
  const nextSlots = [...prefixSlots]
  const remainingIds = [...ids]
  let targetPageStart = pageStart

  while (remainingIds.length > 0) {
    while (nextSlots.length < targetPageStart + pageSize) {
      nextSlots.push(null)
    }
    const placement = placeIdsIntoSlotsRowMajor({
      slots: nextSlots,
      items,
      ids: remainingIds,
      pageStart: targetPageStart,
      pageSize,
      columns,
    })
    nextSlots.splice(0, nextSlots.length, ...placement.slots)
    if (placement.remainingIds.length === remainingIds.length) {
      targetPageStart += pageSize
      continue
    }
    remainingIds.splice(0, remainingIds.length, ...placement.remainingIds)
    targetPageStart += pageSize
  }

  return nextSlots.slice(prefixSlots.length)
}

const insertIntoPageFromAnchor = ({
  slots,
  sourceSlots,
  items,
  pageStart,
  pageSize,
  columns,
  dropIndex,
  dragIds,
  previewSlots,
}: {
  slots: Array<string | null>
  sourceSlots: Array<string | null>
  items: GridItem[]
  pageStart: number
  pageSize: number
  columns: number
  dropIndex: number
  dragIds: string[]
  previewSlots?: Array<string | null>
}) => {
  const pageEnd = pageStart + pageSize
  while (slots.length < pageEnd) {
    slots.push(null)
  }

  const pageEntries = (
    previewSlots ? previewSlots.slice(pageStart, pageEnd) : slots.slice(pageStart, pageEnd)
  ).map(slot => slot ?? null)
  const dropLocalIndex = clampNumber(dropIndex - pageStart, 0, pageSize - 1)
  if (dragIds.length === 0) {
    return []
  }

  const carryIds = [...dragIds]
  for (let localIndex = dropLocalIndex; localIndex < pageSize && carryIds.length > 0; localIndex += 1) {
    const nextId = carryIds.shift()
    if (nextId === undefined) break
    const displacedId = pageEntries[localIndex]
    pageEntries[localIndex] = nextId
    if (displacedId) {
      carryIds.push(displacedId)
    }
  }

  const sourcePageIds = sourceSlots
    .slice(pageStart, pageEnd)
    .filter((id): id is string => typeof id === 'string')
  const pageEntryIdSet = new Set(
    pageEntries.filter((id): id is string => typeof id === 'string')
  )
  const carryIdSet = new Set(carryIds)
  sourcePageIds.forEach(id => {
    if (pageEntryIdSet.has(id) || carryIdSet.has(id)) return
    carryIds.push(id)
    carryIdSet.add(id)
  })

  for (let localIndex = 0; localIndex < pageSize; localIndex += 1) {
    slots[pageStart + localIndex] = pageEntries[localIndex] ?? null
  }

  const remainingCarryIds: string[] = []
  carryIds.forEach(id => {
    const item = items.find(candidate => getId(candidate) === id)
    if (!item) return
    const span = getGridItemSpan(item)
    let placed = false

    for (let anchorIndex = pageStart; anchorIndex < pageEnd; anchorIndex += 1) {
      if (!canPlaceItemAtAnchorIndex(slots, items, anchorIndex, span, columns, pageSize)) {
        continue
      }
      slots[anchorIndex] = id
      placed = true
      break
    }

    if (!placed) {
      remainingCarryIds.push(id)
    }
  })

  return remainingCarryIds
}
 
const stabilizeMultiDropPage = ({
  sourceSlots,
  insertedSlots,
  items,
  pageStart,
  pageSize,
  columns,
  pageOverflowIds,
}: {
  sourceSlots: Array<string | null>
  insertedSlots: Array<string | null>
  items: GridItem[]
  pageStart: number
  pageSize: number
  columns: number
  pageOverflowIds: string[]
}) => {
  const pageEnd = pageStart + pageSize
  const insertedPageEntries = insertedSlots.slice(pageStart, pageEnd)
  const stabilizedPageEntries = insertedPageEntries.map(id => id ?? null)
  const reassignedIdSet = new Set<string>([
    ...stabilizedPageEntries.filter((id): id is string => typeof id === 'string'),
    ...pageOverflowIds,
  ])
  const sourceNextPageEntries = sourceSlots.slice(pageEnd, pageEnd + pageSize)
  const nextPageSlots = sourceNextPageEntries.map(slot => {
    if (typeof slot !== 'string') return null
    return reassignedIdSet.has(slot) ? null : slot
  })
  const hasExistingNextPage = sourceNextPageEntries.length > 0
  while (nextPageSlots.length < pageSize) {
    nextPageSlots.push(null)
  }
  const trailingSlots = sourceSlots.slice(pageEnd + pageSize).map(slot => {
    if (typeof slot !== 'string') return null
    return reassignedIdSet.has(slot) ? null : slot
  })

  const nextSlots = [...sourceSlots.slice(0, pageStart)]
  while (nextSlots.length < pageStart) {
    nextSlots.push(null)
  }
  nextSlots.push(...stabilizedPageEntries)
  const insertedPageQueue = [...pageOverflowIds]
  if (insertedPageQueue.length === 0) {
    if (hasExistingNextPage) {
      nextSlots.push(...nextPageSlots)
    }
    nextSlots.push(...trailingSlots)
    return nextSlots
  }

  const nextPagePlacement = placeIdsIntoSlotsRowMajor({
    slots: [...nextSlots, ...nextPageSlots],
    items,
    ids: insertedPageQueue,
    pageStart: pageEnd,
    pageSize,
    columns,
  })

  if (nextPagePlacement.remainingIds.length === 0) {
    nextSlots.push(...nextPagePlacement.slots.slice(pageEnd, pageEnd + pageSize))
    nextSlots.push(...trailingSlots)
    return nextSlots
  }

  const insertedOverflowPages = placeIdsIntoInsertedPagesRowMajor({
    prefixSlots: nextSlots,
    items,
    ids: insertedPageQueue,
    pageStart: pageEnd,
    pageSize,
    columns,
  })

  nextSlots.push(...insertedOverflowPages)
  if (hasExistingNextPage) {
    nextSlots.push(...nextPageSlots)
  }
  nextSlots.push(...trailingSlots)
  return nextSlots
}

const backfillDisplacedCurrentPageItems = ({
  referenceSlots,
  slots,
  items,
  pageStart,
  pageSize,
  columns,
  dragIds,
}: {
  referenceSlots: Array<string | null>
  slots: Array<string | null>
  items: GridItem[]
  pageStart: number
  pageSize: number
  columns: number
  dragIds: string[]
}) => {
  const pageEnd = pageStart + pageSize
  const dragIdSet = new Set(dragIds)
  const currentPageIdSet = new Set(
    slots
      .slice(pageStart, pageEnd)
      .filter((id): id is string => typeof id === 'string' && !dragIdSet.has(id))
  )
  const candidateIds = referenceSlots
    .slice(pageStart, pageEnd)
    .filter(
      (id): id is string =>
        typeof id === 'string' && !dragIdSet.has(id) && !currentPageIdSet.has(id)
    )
  if (candidateIds.length === 0) {
    return slots
  }

  const itemById = new Map<string, GridItem>()
  items.forEach(item => itemById.set(getId(item), item))
  const nextSlots = [...slots]

  const findBestAnchorIndex = (itemId: string) => {
    const item = itemById.get(itemId)
    if (!item) return null

    const span = getGridItemSpan(item)
    for (let anchorIndex = pageStart; anchorIndex < pageEnd; anchorIndex += 1) {
      if (!canPlaceItemAtAnchorIndex(nextSlots, items, anchorIndex, span, columns, pageSize)) {
        continue
      }
      return anchorIndex
    }

    return null
  }

  candidateIds.forEach(itemId => {
    const currentIndex = nextSlots.indexOf(itemId)
    if (currentIndex < pageEnd) return

    const anchorIndex = findBestAnchorIndex(itemId)
    if (anchorIndex === null) return

    if (currentIndex >= 0) {
      nextSlots[currentIndex] = null
    }
    nextSlots[anchorIndex] = itemId
    currentPageIdSet.add(itemId)
  })

  return nextSlots
}

export const applyMultiOuterDropFromSession = ({
  base,
  session,
  pageSize,
  columns = 1,
  resolveNearestSlotIndexByContext,
  mode = 'paged',
  sourceSlots,
  previewSlots,
}: ApplyOuterDropFromSessionParams): { items: GridItem[]; slots: Array<string | null> } => {
  const safePageSize = Math.max(1, pageSize)
  const dragIds = session.draggingIds
  if (dragIds.length <= 1) {
    return applyOuterDropFromSession({
      base,
      session,
      pageSize,
      columns,
      resolveNearestSlotIndexByContext,
      mode,
      sourceSlots,
    })
  }

  const nextSlots = resolveCommittedBaseSlots(sourceSlots ?? session.workingOrder, dragIds)

  const nearestDropIndex = resolveNearestSlotIndexByContext(session)
  const sourceFallbackIndex = session.sourceSlotIndex
  const emptyFallbackIndex = nextSlots.indexOf(null)
  const candidateDropIndex =
    session.previewSlotIndex ?? nearestDropIndex ?? sourceFallbackIndex ?? emptyFallbackIndex

  if (candidateDropIndex === null || candidateDropIndex < 0) {
    return { items: base, slots: nextSlots }
  }

  const prioritizedItems = prioritizeDraggedItems(base, dragIds)

  if (mode === 'linear') {
    const compactSlots = nextSlots.filter((slot): slot is string => typeof slot === 'string')
    const dropIndex = clampNumber(candidateDropIndex, 0, compactSlots.length)
    compactSlots.splice(dropIndex, 0, ...dragIds)
    return { items: prioritizedItems, slots: compactSlots }
  }
  return applyPagedOuterDrop({
    slots: nextSlots,
    items: prioritizedItems,
    pageSize: safePageSize,
    columns,
    dropIndex: candidateDropIndex,
    dragIds,
    previewSlots: resolveCommittedBaseSlots(previewSlots ?? session.workingOrder, dragIds),
  })
}

