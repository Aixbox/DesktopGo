import type { FolderItem, GridItem } from '../model'
import { getId, makeFolderId } from '../model'
import { clampNumber } from './geometry'
import {
  DRAG_HOLE_ID,
  findFirstNullInRange,
  findNearestEmptyOnPageByManhattan,
} from './slots'
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
    children: [targetItem, sourceItem],
  }
  const folderId = getId(folder)
  map.delete(session.draggingId)
  map.delete(targetId)
  map.set(folderId, folder)
  const nextSlots = [...baseSlots]
  nextSlots[targetSlotIndex] = folderId
  const normalizedOrder = nextSlots.filter((id): id is string => id !== null)
  const nextItems = normalizedOrder.map(id => map.get(id)).filter((item): item is GridItem => Boolean(item))
  const expectedLength = sourceExistsInBase ? base.length - 1 : base.length
  if (nextItems.length !== expectedLength) return { items: base, slots: baseSlots }
  return { items: nextItems, slots: nextSlots }
}

interface ApplyOuterDropFromSessionParams {
  base: GridItem[]
  session: DragState
  pageSize: number
  columns: number
  resolveNearestSlotIndexByContext: (state: DragState) => number | null
}

export const applyOuterDropFromSession = ({
  base,
  session,
  pageSize,
  columns,
  resolveNearestSlotIndexByContext,
}: ApplyOuterDropFromSessionParams): { items: GridItem[]; slots: Array<string | null> } => {
  const safePageSize = Math.max(1, pageSize)
  const safeColumns = Math.max(1, columns)
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
  const candidateDropIndex =
    session.previewSlotIndex ?? nearestDropIndex ?? session.sourceSlotIndex ?? nextSlots.indexOf(null)
  if (candidateDropIndex === null || candidateDropIndex < 0) {
    return { items: base, slots: baseSlots }
  }

  if (candidateDropIndex >= nextSlots.length) {
    nextSlots.push(...Array.from({ length: candidateDropIndex - nextSlots.length + 1 }, () => null))
  }
  const remainder = nextSlots.length % safePageSize
  if (remainder > 0) {
    nextSlots.push(...Array.from({ length: safePageSize - remainder }, () => null))
  }

  const dropIndex = clampNumber(candidateDropIndex, 0, Math.max(0, nextSlots.length - 1))
  const dropPage = Math.floor(dropIndex / safePageSize)
  const pageStart = dropPage * safePageSize
  const pageEndExclusive = pageStart + safePageSize
  const pageHasEmpty = findFirstNullInRange(nextSlots, pageStart, pageEndExclusive) !== null
  const currentAtDrop = nextSlots[dropIndex]

  if (currentAtDrop === null) {
    nextSlots[dropIndex] = session.draggingId
  } else if (pageHasEmpty) {
    const nearestEmpty = findNearestEmptyOnPageByManhattan(
      nextSlots,
      pageStart,
      safePageSize,
      safeColumns,
      dropIndex
    )
    if (nearestEmpty === null) return { items: base, slots: baseSlots }
    nextSlots[nearestEmpty] = currentAtDrop
    nextSlots[dropIndex] = session.draggingId
  } else {
    const pageLastIndex = pageEndExclusive - 1
    const carried = nextSlots[pageLastIndex]
    nextSlots[pageLastIndex] = session.draggingId
    if (carried && carried !== session.draggingId) {
      const nextPage = dropPage + 1
      const nextPageStart = nextPage * safePageSize
      if (nextPageStart + safePageSize > nextSlots.length) {
        nextSlots.push(...Array.from({ length: safePageSize }, () => null))
      }
      const nextPageEndExclusive = nextPageStart + safePageSize
      const nextPageEmpty = findFirstNullInRange(nextSlots, nextPageStart, nextPageEndExclusive)
      if (nextPageEmpty !== null) {
        nextSlots[nextPageEmpty] = carried
      } else {
        nextSlots.splice(nextPageStart, 0, ...Array.from({ length: safePageSize }, () => null))
        nextSlots[nextPageStart] = carried
      }
    }
  }

  const normalized = nextSlots.filter((id): id is string => id !== null)
  const nextItems = normalized.map(id => map.get(id)).filter((item): item is GridItem => Boolean(item))
  const expectedLength = hadDraggedInBase ? base.length : base.length + 1
  if (nextItems.length !== expectedLength) {
    return { items: base, slots: baseSlots }
  }
  return { items: nextItems, slots: nextSlots }
}
