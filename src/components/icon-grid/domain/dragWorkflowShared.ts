import type { GridItem, IconItem } from '../model'
import { getFolderChildrenById } from './folderPolicy'
import { DRAG_HOLE_ID, areSlotsEqual } from './slots'
import type { DragState } from '../state/types'

export type ElementCenters = Record<string, { x: number; y: number }>

export const collectElementCenters = <TElement extends HTMLElement>(
  refs: Map<string, TElement>
): ElementCenters => {
  const centers: ElementCenters = {}
  refs.forEach((node, id) => {
    const rect = node.getBoundingClientRect()
    centers[id] = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  })
  return centers
}

export const seedMissingInitialCenters = (
  initialCenters: ElementCenters,
  draggingIds: string[],
  ...refMaps: Array<Map<string, HTMLDivElement>>
) => {
  const availableCenters = Object.assign(
    {},
    ...refMaps.map(collectElementCenters)
  ) as ElementCenters
  draggingIds.forEach(id => {
    if (!initialCenters[id] && availableCenters[id]) {
      initialCenters[id] = availableCenters[id]
    }
  })
}

export const getFolderIconMapById = (folderId: string | null, items: GridItem[]) => {
  const map = new Map<string, IconItem>()
  if (!folderId) return map
  getFolderChildrenById(items, folderId).forEach(child => {
    map.set(child.key, child)
  })
  return map
}

export const buildDragItemMap = (state: DragState, items: GridItem[]): Map<string, GridItem> => {
  if (state.context === 'folder') {
    return new Map(getFolderIconMapById(state.sourceFolderId, items))
  }
  return new Map(items.map(item => [item.kind === 'folder' ? `folder:${item.id}` : item.key, item]))
}

export const resolveSelectedIconDragIds = (
  sourceOrder: Array<string | null>,
  leadId: string,
  itemById: Map<string, GridItem>,
  selectedIconKeys: ReadonlySet<string>
) =>
  sourceOrder.filter((slot): slot is string => {
    if (!slot || slot === DRAG_HOLE_ID || slot === leadId) return false
    const candidate = itemById.get(slot)
    return Boolean(candidate && candidate.kind === 'icon' && selectedIconKeys.has(candidate.key))
  })

const areDraggingIdsEqual = (left: string[], right: string[]) =>
  left.length === right.length && left.every((id, index) => id === right[index])

export const hasRenderableDragStateChanged = (
  previous: DragState | null,
  next: DragState | null,
  mode: 'paged' | 'scroll'
) => {
  if (previous === next) return false
  if (!previous || !next) return previous !== next
  if (previous.context !== next.context) return true
  if (previous.sourceFolderId !== next.sourceFolderId) return true
  if (previous.pointerId !== next.pointerId) return true
  if (previous.dragStartedAt !== next.dragStartedAt) return true
  if (previous.draggingId !== next.draggingId) return true
  if (previous.draggingItem !== next.draggingItem) return true
  if (!areDraggingIdsEqual(previous.draggingIds, next.draggingIds)) return true
  if (!areSlotsEqual(previous.workingOrder, next.workingOrder)) return true
  if (
    mode === 'scroll' &&
    !areSlotsEqual(previous.scrollGroupOrder ?? [], next.scrollGroupOrder ?? [])
  ) {
    return true
  }
  if (previous.sourceSlotIndex !== next.sourceSlotIndex) return true
  if (previous.previewSlotIndex !== next.previewSlotIndex) return true
  if (previous.dockPreviewIndex !== next.dockPreviewIndex) return true
  if (previous.hoverTargetId !== next.hoverTargetId) return true
  if (previous.hoverZone !== next.hoverZone) return true
  if (previous.folderPreviewTargetId !== next.folderPreviewTargetId) return true
  return previous.initialCenters !== next.initialCenters
}
