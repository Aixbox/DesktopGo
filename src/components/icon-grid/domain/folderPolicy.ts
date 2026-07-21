import type { GridItem, IconItem } from '../model'
import { DRAG_HOLE_ID } from './slots'

export const FOLDER_AUTO_OPEN_DWELL_MS = 500
export const FOLDER_EXIT_DWELL_MS = 200

export const isPointInsideFolderContent = (
  point: { x: number; y: number },
  rect: { left: number; top: number; width: number; height: number }
) =>
  point.x >= rect.left &&
  point.x <= rect.left + rect.width &&
  point.y >= rect.top &&
  point.y <= rect.top + rect.height

export const isPointOutsideFolderContent = (
  point: { x: number; y: number },
  rect: { left: number; top: number; width: number; height: number }
) => !isPointInsideFolderContent(point, rect)

export const canExitFolderThroughMask = ({
  dragStartedInFolder,
  enteredFolderContent,
}: {
  dragStartedInFolder: boolean
  enteredFolderContent: boolean
}) => dragStartedInFolder || enteredFolderContent

export const isFolderAutoOpenIntentValid = ({
  context,
  draggingCount,
  draggingKind,
  folderPreviewTargetId,
  hoverTargetId,
  hoverZone,
  expectedTargetId,
}: {
  context: 'outer' | 'folder' | 'dock'
  draggingCount: number
  draggingKind: GridItem['kind']
  folderPreviewTargetId: string | null
  hoverTargetId: string | null
  hoverZone: string | null
  expectedTargetId: string
}) =>
  context === 'outer' &&
  draggingCount === 1 &&
  draggingKind === 'icon' &&
  folderPreviewTargetId === expectedTargetId &&
  hoverTargetId === expectedTargetId &&
  hoverZone === 'center'

export const buildFolderAutoOpenOrder = (
  folderChildIds: string[],
  draggingId: string
): Array<string | null> | null => {
  const draggingIndex = folderChildIds.indexOf(draggingId)
  if (draggingIndex < 0) return null
  const nextOrder: Array<string | null> = [...folderChildIds]
  nextOrder[draggingIndex] = DRAG_HOLE_ID
  return nextOrder
}

export const findFolderIndexById = (items: GridItem[], folderId: string): number =>
  items.findIndex(item => item.kind === 'folder' && item.id === folderId)

export const getFolderChildrenById = (items: GridItem[], folderId: string): IconItem[] => {
  const index = findFolderIndexById(items, folderId)
  if (index < 0) return []
  const item = items[index]
  return item && item.kind === 'folder' ? item.children : []
}

export const findFolderIdContainingChild = (items: GridItem[], iconId: string): string | null => {
  for (const item of items) {
    if (item.kind !== 'folder') continue
    if (item.children.some(child => child.key === iconId)) {
      return item.id
    }
  }
  return null
}

export const getFolderChildSelectionsByIds = (
  items: GridItem[],
  iconIds: string[]
): Map<string, IconItem[]> => {
  const iconIdSet = new Set(iconIds)
  const selectedByFolder = new Map<string, IconItem[]>()
  if (iconIdSet.size === 0) return selectedByFolder

  items.forEach(item => {
    if (item.kind !== 'folder') return
    const selectedChildren = item.children.filter(child => iconIdSet.has(child.key))
    if (selectedChildren.length > 0) {
      selectedByFolder.set(item.id, selectedChildren)
    }
  })

  return selectedByFolder
}

interface ReplaceFolderChildrenOptions {
  collapseSingleChild?: boolean
}

export const replaceFolderChildren = (
  items: GridItem[],
  folderId: string,
  nextChildren: IconItem[],
  options?: ReplaceFolderChildrenOptions
): GridItem[] => {
  const collapseSingleChild = options?.collapseSingleChild ?? true
  const index = findFolderIndexById(items, folderId)
  if (index < 0) return items
  const current = items[index]
  if (!current || current.kind !== 'folder') return items

  const next = [...items]
  if (nextChildren.length >= 2) {
    next[index] = { ...current, children: nextChildren }
    return next
  }

  if (nextChildren.length === 1) {
    if (collapseSingleChild) {
      next[index] = nextChildren[0]
      return next
    }
    next[index] = { ...current, children: nextChildren }
    return next
  }

  next.splice(index, 1)
  return next
}

export const finalizeFolderExtractionInTopLevelLayout = (
  items: GridItem[],
  outerSlots: Array<string | null>,
  dockKeys: Array<string | null>,
  folderId: string | null
): { items: GridItem[]; outerSlots: Array<string | null>; dockKeys: Array<string | null> } => {
  if (!folderId) return { items, outerSlots, dockKeys }
  const index = findFolderIndexById(items, folderId)
  if (index < 0) return { items, outerSlots, dockKeys }
  const folder = items[index]
  if (!folder || folder.kind !== 'folder') return { items, outerSlots, dockKeys }
  if (folder.children.length >= 2) return { items, outerSlots, dockKeys }

  const folderSlotId = `folder:${folderId}`
  const nextItems = [...items]
  const nextOuterSlots = outerSlots.map(slot => {
    if (slot !== folderSlotId) return slot
    if (folder.children.length === 1) return folder.children[0].key
    return null
  })
  const nextDockKeys =
    folder.children.length === 1
      ? dockKeys.map(key => (key === folderSlotId ? folder.children[0].key : key))
      : dockKeys.filter(key => key !== folderSlotId)

  if (folder.children.length === 1) {
    nextItems[index] = folder.children[0]
    return { items: nextItems, outerSlots: nextOuterSlots, dockKeys: nextDockKeys }
  }

  nextItems.splice(index, 1)
  return { items: nextItems, outerSlots: nextOuterSlots, dockKeys: nextDockKeys }
}
