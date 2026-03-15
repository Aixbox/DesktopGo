import type { FolderItem, GridItem } from '../model'
import { getId, makeFolderId } from '../model'
import { clampNumber } from './geometry'
import { DRAG_HOLE_ID } from './slots'
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

export const applyMultiOuterDropFromSession = ({
  base,
  session,
  pageSize,
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
  dragIds.forEach((id, offset) => {
    insertWithForwardShift(nextSlots, dropIndex + offset, id)
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
