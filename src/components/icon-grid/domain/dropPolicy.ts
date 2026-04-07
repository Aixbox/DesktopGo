import type { FolderItem, GridItem } from '../model'
import { getGridItemSpan, getId, makeFolderId } from '../model'
import { translate } from '../../../lib/i18n'
import { clampNumber } from './geometry'
import { DRAG_HOLE_ID, getManhattanDistanceBySlotIndex } from './slots'
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
}

export const applyOuterDropFromSession = ({
  base,
  session,
  pageSize,
  resolveNearestSlotIndexByContext,
  mode = 'paged',
}: ApplyOuterDropFromSessionParams): { items: GridItem[]; slots: Array<string | null> } => {
  const safePageSize = Math.max(1, pageSize)
  const baseSlots = session.workingOrder.map(slot => (slot === DRAG_HOLE_ID ? null : slot))
  const map = new Map<string, GridItem>()
  base.forEach(item => map.set(getId(item), item))
  const hadDraggedInBase = map.has(session.draggingId)
  map.set(session.draggingId, session.draggingItem)

  let nextSlots: Array<string | null> = [...baseSlots]
  if (nextSlots.length === 0) {
    nextSlots = Array.from({ length: safePageSize }, () => null)
  }
  nextSlots = nextSlots.map(slot => (slot === session.draggingId ? null : slot))

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

  if (candidateDropIndex >= nextSlots.length) {
    nextSlots.push(...Array.from({ length: candidateDropIndex - nextSlots.length + 1 }, () => null))
  }
  const remainder = nextSlots.length % safePageSize
  if (remainder > 0) {
    nextSlots.push(...Array.from({ length: safePageSize - remainder }, () => null))
  }

  const dropIndex = clampNumber(candidateDropIndex, 0, Math.max(0, nextSlots.length - 1))
  nextSlots[dropIndex] = session.draggingId

  const nextItems = hadDraggedInBase ? base : [...base, session.draggingItem]
  return { items: nextItems, slots: nextSlots }
}

const ensureSlotCapacity = (slots: Array<string | null>, index: number) => {
  while (slots.length < index) {
    slots.push(null)
  }
}

const insertWithForwardShift = (slots: Array<string | null>, index: number, id: string) => {
  if (index < 0) return
  ensureSlotCapacity(slots, index)
  if (index >= slots.length) {
    slots.push(id)
    return
  }
  if (slots[index] === null) {
    slots[index] = id
    return
  }

  slots.push(null)
  for (let currentIndex = slots.length - 1; currentIndex > index; currentIndex -= 1) {
    slots[currentIndex] = slots[currentIndex - 1]
  }
  slots[index] = id
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

const getNeighborLocalIndices = ({
  localIndex,
  pageSize,
  columns,
}: {
  localIndex: number
  pageSize: number
  columns: number
}) => {
  const safeColumns = Math.max(1, columns)
  const neighbors: number[] = []
  const row = Math.floor(localIndex / safeColumns)
  const col = localIndex % safeColumns
  const maxRows = Math.ceil(pageSize / safeColumns)

  if (col > 0) neighbors.push(localIndex - 1)
  if (col + 1 < safeColumns && localIndex + 1 < pageSize) neighbors.push(localIndex + 1)
  if (row > 0) neighbors.push(localIndex - safeColumns)
  if (row + 1 < maxRows && localIndex + safeColumns < pageSize)
    neighbors.push(localIndex + safeColumns)

  return neighbors
}

const compareLocalIndicesByPreference = ({
  pageStart,
  columns,
  targetLocalIndex,
  anchorLocalIndex,
  a,
  b,
}: {
  pageStart: number
  columns: number
  targetLocalIndex: number
  anchorLocalIndex: number
  a: number
  b: number
}) => {
  const safeColumns = Math.max(1, columns)
  const aAfterAnchor = a > anchorLocalIndex ? 0 : 1
  const bAfterAnchor = b > anchorLocalIndex ? 0 : 1
  if (aAfterAnchor !== bAfterAnchor) return aAfterAnchor - bAfterAnchor

  const distanceToTargetA = getManhattanDistanceBySlotIndex(
    pageStart + a,
    pageStart + targetLocalIndex,
    pageStart,
    safeColumns
  )
  const distanceToTargetB = getManhattanDistanceBySlotIndex(
    pageStart + b,
    pageStart + targetLocalIndex,
    pageStart,
    safeColumns
  )
  if (distanceToTargetA !== distanceToTargetB) return distanceToTargetA - distanceToTargetB

  const distanceToAnchorA = getManhattanDistanceBySlotIndex(
    pageStart + a,
    pageStart + anchorLocalIndex,
    pageStart,
    safeColumns
  )
  const distanceToAnchorB = getManhattanDistanceBySlotIndex(
    pageStart + b,
    pageStart + anchorLocalIndex,
    pageStart,
    safeColumns
  )
  if (distanceToAnchorA !== distanceToAnchorB) return distanceToAnchorA - distanceToAnchorB

  return aAfterAnchor === 0 ? a - b : b - a
}

const resolveTargetLocalIndices = ({
  pageStart,
  pageSize,
  columns,
  dropIndex,
  insertCount,
}: {
  pageStart: number
  pageSize: number
  columns: number
  dropIndex: number
  insertCount: number
}) => {
  const dropLocalIndex = clampNumber(dropIndex - pageStart, 0, pageSize - 1)
  const targets: number[] = [dropLocalIndex]
  if (insertCount <= 1) {
    return targets
  }

  for (let localIndex = dropLocalIndex + 1; localIndex < pageSize; localIndex += 1) {
    if (targets.length >= insertCount) break
    targets.push(localIndex)
  }
  if (targets.length >= insertCount) {
    return targets.slice(0, insertCount)
  }

  const selected = new Set<number>(targets)
  const visited = new Set<number>([dropLocalIndex])
  const frontier: number[] = []
  const sortByPreference = (a: number, b: number) =>
    compareLocalIndicesByPreference({
      pageStart,
      columns,
      targetLocalIndex: dropLocalIndex,
      anchorLocalIndex: dropLocalIndex,
      a,
      b,
    })

  const enqueueNeighbors = (localIndex: number) => {
    getNeighborLocalIndices({
      localIndex,
      pageSize,
      columns,
    })
      .sort(sortByPreference)
      .forEach(neighborLocalIndex => {
        if (visited.has(neighborLocalIndex)) return
        visited.add(neighborLocalIndex)
        frontier.push(neighborLocalIndex)
      })
    frontier.sort(sortByPreference)
  }

  enqueueNeighbors(dropLocalIndex)

  while (frontier.length > 0 && targets.length < insertCount) {
    const nextLocalIndex = frontier.shift()
    if (nextLocalIndex === undefined) break
    enqueueNeighbors(nextLocalIndex)
    if (selected.has(nextLocalIndex)) continue
    selected.add(nextLocalIndex)
    targets.push(nextLocalIndex)
  }

  return targets.slice(0, insertCount)
}
const findGapPropagationPathToEmpty = ({
  pageStart,
  pageSize,
  columns,
  targetLocalIndex,
  emptyLocalIndex,
  blockedLocalIndexSet,
}: {
  pageStart: number
  pageSize: number
  columns: number
  targetLocalIndex: number
  emptyLocalIndex: number
  blockedLocalIndexSet: Set<number>
}) => {
  const queue: number[] = [targetLocalIndex]
  const visited = new Set<number>([targetLocalIndex])
  const parentByLocalIndex = new Map<number, number>()

  while (queue.length > 0) {
    const currentLocalIndex = queue.shift()
    if (currentLocalIndex === undefined) break

    if (currentLocalIndex === emptyLocalIndex) {
      const path: number[] = [currentLocalIndex]
      let cursor = currentLocalIndex
      while (parentByLocalIndex.has(cursor)) {
        cursor = parentByLocalIndex.get(cursor) as number
        path.push(cursor)
      }
      return path
    }

    const orderedNeighbors = getNeighborLocalIndices({
      localIndex: currentLocalIndex,
      pageSize,
      columns,
    }).sort((a, b) => {
      const distanceA = getManhattanDistanceBySlotIndex(
        pageStart + a,
        pageStart + emptyLocalIndex,
        pageStart,
        Math.max(1, columns)
      )
      const distanceB = getManhattanDistanceBySlotIndex(
        pageStart + b,
        pageStart + emptyLocalIndex,
        pageStart,
        Math.max(1, columns)
      )
      if (distanceA !== distanceB) return distanceA - distanceB
      return a - b
    })

    orderedNeighbors.forEach(neighborLocalIndex => {
      if (visited.has(neighborLocalIndex)) return
      if (blockedLocalIndexSet.has(neighborLocalIndex) && neighborLocalIndex !== emptyLocalIndex) {
        return
      }
      visited.add(neighborLocalIndex)
      parentByLocalIndex.set(neighborLocalIndex, currentLocalIndex)
      queue.push(neighborLocalIndex)
    })
  }

  return null
}

const findPreferredGapPropagationPath = ({
  entries,
  pageStart,
  pageSize,
  columns,
  targetLocalIndex,
  anchorLocalIndex,
  blockedLocalIndexSet,
}: {
  entries: Array<string | null>
  pageStart: number
  pageSize: number
  columns: number
  targetLocalIndex: number
  anchorLocalIndex: number
  blockedLocalIndexSet: Set<number>
}) => {
  const emptyCandidateLocalIndices = Array.from({ length: pageSize }, (_, localIndex) => localIndex)
    .filter(localIndex => {
      if (localIndex === targetLocalIndex) return false
      if (blockedLocalIndexSet.has(localIndex)) return false
      return entries[localIndex] === null
    })
    .sort((a, b) =>
      compareLocalIndicesByPreference({
        pageStart,
        columns,
        targetLocalIndex,
        anchorLocalIndex,
        a,
        b,
      })
    )

  for (const emptyLocalIndex of emptyCandidateLocalIndices) {
    const path = findGapPropagationPathToEmpty({
      pageStart,
      pageSize,
      columns,
      targetLocalIndex,
      emptyLocalIndex,
      blockedLocalIndexSet,
    })
    if (path) {
      return path
    }
  }

  return null
}

const applyGapPropagationPath = (entries: Array<string | null>, path: number[]) => {
  if (path.length <= 1) return
  for (let index = 0; index < path.length - 1; index += 1) {
    entries[path[index]] = entries[path[index + 1]]
  }
  entries[path[path.length - 1]] = null
}

const evictTrailingPageItem = ({
  entries,
  targetLocalIndexSet,
}: {
  entries: Array<string | null>
  targetLocalIndexSet: Set<number>
}) => {
  for (let localIndex = entries.length - 1; localIndex >= 0; localIndex -= 1) {
    if (targetLocalIndexSet.has(localIndex)) continue
    const id = entries[localIndex]
    if (!id) continue
    entries[localIndex] = null
    return { id, localIndex }
  }
  return null
}

const insertIntoPageFromAnchor = ({
  slots,
  pageStart,
  pageSize,
  dropIndex,
  columns,
  dragIds,
}: {
  slots: Array<string | null>
  pageStart: number
  pageSize: number
  dropIndex: number
  columns: number
  dragIds: string[]
}) => {
  const pageEnd = pageStart + pageSize
  while (slots.length < pageEnd) {
    slots.push(null)
  }

  const pageEntries = slots.slice(pageStart, pageEnd)
  const dropLocalIndex = clampNumber(dropIndex - pageStart, 0, pageSize - 1)
  const localInsertCount = Math.min(dragIds.length, pageSize)

  if (localInsertCount <= 0) {
    dragIds.forEach((id, offset) => {
      insertWithForwardShift(slots, pageEnd + offset, id)
    })
    return
  }

  const targetLocalIndices = resolveTargetLocalIndices({
    pageStart,
    pageSize,
    columns,
    dropIndex,
    insertCount: localInsertCount,
  })
  const targetLocalIndexSet = new Set(targetLocalIndices)
  const overflowItems: Array<{ id: string; localIndex: number }> = []

  if (localInsertCount === pageSize) {
    pageEntries.forEach((id, localIndex) => {
      if (!id) return
      overflowItems.push({ id, localIndex })
      pageEntries[localIndex] = null
    })
  } else {
    targetLocalIndices.forEach(targetLocalIndex => {
      if (pageEntries[targetLocalIndex] === null) return

      const blockedLocalIndexSet = new Set(
        targetLocalIndices.filter(localIndex => localIndex !== targetLocalIndex)
      )
      let path = findPreferredGapPropagationPath({
        entries: pageEntries,
        pageStart,
        pageSize,
        columns,
        targetLocalIndex,
        anchorLocalIndex: dropLocalIndex,
        blockedLocalIndexSet,
      })

      if (!path) {
        const evicted = evictTrailingPageItem({
          entries: pageEntries,
          targetLocalIndexSet,
        })
        if (evicted) {
          overflowItems.push(evicted)
          path = findPreferredGapPropagationPath({
            entries: pageEntries,
            pageStart,
            pageSize,
            columns,
            targetLocalIndex,
            anchorLocalIndex: dropLocalIndex,
            blockedLocalIndexSet,
          })
        }
      }

      if (!path) {
        const displacedId = pageEntries[targetLocalIndex]
        if (displacedId) {
          overflowItems.push({ id: displacedId, localIndex: targetLocalIndex })
          pageEntries[targetLocalIndex] = null
        }
        return
      }

      applyGapPropagationPath(pageEntries, path)
    })
  }

  targetLocalIndices.forEach((localIndex, offset) => {
    pageEntries[localIndex] = dragIds[offset]
  })

  for (let localIndex = 0; localIndex < pageSize; localIndex += 1) {
    slots[pageStart + localIndex] = pageEntries[localIndex] ?? null
  }

  const remainingDragIds = dragIds.slice(localInsertCount)
  const overflowIds = overflowItems.sort((a, b) => a.localIndex - b.localIndex).map(item => item.id)

  remainingDragIds.forEach((id, offset) => {
    insertWithForwardShift(slots, pageEnd + offset, id)
  })
  overflowIds.forEach((id, offset) => {
    insertWithForwardShift(slots, pageEnd + remainingDragIds.length + offset, id)
  })
}

const stabilizeMultiDropPage = ({
  sourceSlots,
  insertedSlots,
  pageStart,
  pageSize,
  dragIds,
}: {
  sourceSlots: Array<string | null>
  insertedSlots: Array<string | null>
  pageStart: number
  pageSize: number
  dragIds: string[]
}) => {
  const pageEnd = pageStart + pageSize
  const dragIdSet = new Set(dragIds)
  const insertedPageEntries = insertedSlots.slice(pageStart, pageEnd)
  const stabilizedPageEntries = insertedPageEntries.map(id => id ?? null)
  const pageIdSet = new Set(
    stabilizedPageEntries.filter((id): id is string => typeof id === 'string')
  )
  const pageDragIdSet = new Set(
    stabilizedPageEntries.filter((id): id is string => typeof id === 'string' && dragIdSet.has(id))
  )
  const remainingDragIds = dragIds.filter(id => !pageDragIdSet.has(id))
  const displacedCurrentPageIds = sourceSlots
    .slice(pageStart, pageEnd)
    .filter(
      (id): id is string => typeof id === 'string' && !dragIdSet.has(id) && !pageIdSet.has(id)
    )
  const trailingIds = sourceSlots
    .slice(pageEnd)
    .filter((id): id is string => typeof id === 'string' && !dragIdSet.has(id))

  const nextSlots = [...sourceSlots.slice(0, pageStart)]
  while (nextSlots.length < pageStart) {
    nextSlots.push(null)
  }
  nextSlots.push(...stabilizedPageEntries)
  const insertedPageQueue = [...remainingDragIds, ...displacedCurrentPageIds]
  if (insertedPageQueue.length > 0) {
    nextSlots.push(
      ...Array.from({ length: pageSize }, (_, index) => insertedPageQueue[index] ?? null)
    )
    nextSlots.push(...insertedPageQueue.slice(pageSize), ...trailingIds)
    return nextSlots
  }

  nextSlots.push(...trailingIds)

  return nextSlots
}

const backfillDisplacedCurrentPageItems = ({
  sourceSlots,
  slots,
  items,
  pageStart,
  pageSize,
  columns,
  dragIds,
}: {
  sourceSlots: Array<string | null>
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
  const candidateIds = sourceSlots
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

  const findBestAnchorIndex = (itemId: string, originIndex: number) => {
    const item = itemById.get(itemId)
    if (!item) return null

    const span = getGridItemSpan(item)
    let bestAnchorIndex: number | null = null
    let bestScore: [number, number, number] | null = null

    for (let anchorIndex = pageStart; anchorIndex < pageEnd; anchorIndex += 1) {
      if (!canPlaceItemAtAnchorIndex(nextSlots, items, anchorIndex, span, columns, pageSize)) {
        continue
      }

      const score: [number, number, number] = [
        getManhattanDistanceBySlotIndex(originIndex, anchorIndex, pageStart, columns),
        Math.abs(anchorIndex - originIndex),
        anchorIndex,
      ]
      if (
        !bestScore ||
        score[0] < bestScore[0] ||
        (score[0] === bestScore[0] && score[1] < bestScore[1]) ||
        (score[0] === bestScore[0] && score[1] === bestScore[1] && score[2] < bestScore[2])
      ) {
        bestAnchorIndex = anchorIndex
        bestScore = score
      }
    }

    return bestAnchorIndex
  }

  candidateIds.forEach(itemId => {
    const currentIndex = nextSlots.indexOf(itemId)
    if (currentIndex < pageEnd) return

    const sourceIndex = sourceSlots.indexOf(itemId)
    const originIndex = sourceIndex >= pageStart && sourceIndex < pageEnd ? sourceIndex : currentIndex
    const anchorIndex = findBestAnchorIndex(itemId, originIndex)
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
}: ApplyOuterDropFromSessionParams): { items: GridItem[]; slots: Array<string | null> } => {
  const safePageSize = Math.max(1, pageSize)
  const dragIds = session.draggingIds
  if (dragIds.length <= 1) {
    return applyOuterDropFromSession({
      base,
      session,
      pageSize,
      resolveNearestSlotIndexByContext,
      mode,
    })
  }

  const dragIdSet = new Set(dragIds)
  const nextSlots = session.workingOrder.map(slot => {
    if (slot === DRAG_HOLE_ID) return null
    return slot && dragIdSet.has(slot) ? null : slot
  })

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

  const dropIndex = clampNumber(candidateDropIndex, 0, Number.MAX_SAFE_INTEGER)
  const pageStart = Math.floor(dropIndex / safePageSize) * safePageSize
  const insertedSlots = [...nextSlots]
  insertIntoPageFromAnchor({
    slots: insertedSlots,
    pageStart,
    pageSize: safePageSize,
    dropIndex,
    columns,
    dragIds,
  })
  const stabilizedSlots = stabilizeMultiDropPage({
    sourceSlots: nextSlots,
    insertedSlots,
    pageStart,
    pageSize: safePageSize,
    dragIds,
  })
  const backfilledSlots = backfillDisplacedCurrentPageItems({
    sourceSlots: nextSlots,
    slots: stabilizedSlots,
    items: prioritizedItems,
    pageStart,
    pageSize: safePageSize,
    columns,
    dragIds,
  })

  if (backfilledSlots.length === 0) {
    backfilledSlots.push(...Array.from({ length: safePageSize }, () => null))
  }
  const remainder = backfilledSlots.length % safePageSize
  if (remainder > 0) {
    backfilledSlots.push(...Array.from({ length: safePageSize - remainder }, () => null))
  }

  const normalizedSlots = normalizeOuterSlots(
    backfilledSlots,
    prioritizedItems,
    safePageSize,
    columns
  )

  return { items: prioritizedItems, slots: normalizedSlots }
}

