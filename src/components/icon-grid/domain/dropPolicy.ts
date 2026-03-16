import type { FolderItem, GridItem } from '../model'
import { getId, makeFolderId } from '../model'
import { clampNumber } from './geometry'
import { DRAG_HOLE_ID, getManhattanDistanceBySlotIndex } from './slots'
import type { DragState } from '../state/types'

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
    name: 'New Folder',
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
  const sourceExistsInBase = map.has(session.draggingId)
  const sourceItem = map.get(session.draggingId) ?? session.draggingItem
  const targetFolder = map.get(targetFolderId)
  if (!targetFolder || targetFolder.kind !== 'folder' || sourceItem.kind !== 'icon') {
    return { items: base, slots: baseSlots }
  }

  const nextFolderChildren = targetFolder.children.some(child => child.key === sourceItem.key)
    ? targetFolder.children
    : [...targetFolder.children, sourceItem]
  const nextTargetFolder = { ...targetFolder, children: nextFolderChildren }
  map.set(targetFolderId, nextTargetFolder)
  if (sourceExistsInBase) {
    map.delete(session.draggingId)
  }

  const nextSlots = baseSlots.map(slot => (slot === session.draggingId ? null : slot))
  const nextItems: GridItem[] = []
  base.forEach(item => {
    const id = getId(item)
    if (id === session.draggingId && sourceExistsInBase) {
      return
    }
    if (id === targetFolderId) {
      nextItems.push(nextTargetFolder)
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
    nextSlots.push(
      ...Array.from({ length: candidateDropIndex - nextSlots.length + 1 }, () => null)
    )
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
  if (row + 1 < maxRows && localIndex + safeColumns < pageSize) neighbors.push(localIndex + safeColumns)

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
  const overflowIds = overflowItems
    .sort((a, b) => a.localIndex - b.localIndex)
    .map(item => item.id)

  remainingDragIds.forEach((id, offset) => {
    insertWithForwardShift(slots, pageEnd + offset, id)
  })
  overflowIds.forEach((id, offset) => {
    insertWithForwardShift(slots, pageEnd + remainingDragIds.length + offset, id)
  })
}

export const applyMultiOuterDropFromSession = ({
  base,
  session,
  pageSize,
  columns = 1,
  resolveNearestSlotIndexByContext,
}: ApplyOuterDropFromSessionParams): { items: GridItem[]; slots: Array<string | null> } => {
  const safePageSize = Math.max(1, pageSize)
  const dragIds = session.draggingIds
  if (dragIds.length <= 1) {
    return applyOuterDropFromSession({
      base,
      session,
      pageSize,
      resolveNearestSlotIndexByContext,
      mode: 'paged',
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

  const dropIndex = clampNumber(candidateDropIndex, 0, Number.MAX_SAFE_INTEGER)
  const pageStart = Math.floor(dropIndex / safePageSize) * safePageSize
  insertIntoPageFromAnchor({
    slots: nextSlots,
    pageStart,
    pageSize: safePageSize,
    dropIndex,
    columns,
    dragIds,
  })

  if (nextSlots.length === 0) {
    nextSlots.push(...Array.from({ length: safePageSize }, () => null))
  }
  const remainder = nextSlots.length % safePageSize
  if (remainder > 0) {
    nextSlots.push(...Array.from({ length: safePageSize - remainder }, () => null))
  }

  return { items: base, slots: nextSlots }
}
