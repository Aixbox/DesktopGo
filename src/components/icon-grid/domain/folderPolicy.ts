import type { GridItem, IconItem } from '../model'
import { DRAG_HOLE_ID } from './slots'
import { canPlaceItemAtAnchorIndex } from './topLevelLayout'

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

export interface DissolveFolderLayoutOptions {
  columns: number
  pageSize: number
}

const findFreeAnchorIndexFrom = (
  slots: Array<string | null>,
  items: GridItem[],
  startIndex: number,
  columns: number,
  pageSize: number
): number => {
  for (let offset = 0; offset < slots.length; offset += 1) {
    const index = (startIndex + offset) % slots.length
    if (canPlaceItemAtAnchorIndex(slots, items, index, { cols: 1, rows: 1 }, columns, pageSize)) {
      return index
    }
  }
  return -1
}

/**
 * 解散文件夹：成员图标按原位返回顶层网格，文件夹自身从布局与 Dock 中移除。
 * 第一个成员优先占用文件夹原锚点（或 Dock 槽位），其余成员从该位置向后寻找
 * 最近空闲槽位；现有其他条目的位置保持不变。
 */
export const dissolveFolderInTopLevelLayout = (
  items: GridItem[],
  outerSlots: Array<string | null>,
  dockKeys: Array<string | null>,
  folderId: string,
  options: DissolveFolderLayoutOptions
): {
  items: GridItem[]
  outerSlots: Array<string | null>
  dockKeys: Array<string | null>
} | null => {
  const index = findFolderIndexById(items, folderId)
  if (index < 0) return null
  const folder = items[index]
  if (!folder || folder.kind !== 'folder') return null

  const folderSlotId = `folder:${folderId}`
  const columns = Math.max(1, Math.floor(options.columns))
  const pageSize = Math.max(1, Math.floor(options.pageSize))
  const children = [...folder.children]
  const nextItems = [...items.slice(0, index), ...children, ...items.slice(index + 1)]

  let nextDockKeys = dockKeys
  let nextOuterSlots = [...outerSlots]
  while (nextOuterSlots.length < pageSize) {
    nextOuterSlots.push(null)
  }
  const dockSlotIndex = dockKeys.indexOf(folderSlotId)

  // Dock 中的文件夹：第一个成员顶替其 Dock 槽位，其余成员落入顶层网格。
  let cursor = outerSlots.indexOf(folderSlotId)
  let firstChildIndex = 0
  if (dockSlotIndex >= 0) {
    nextDockKeys = dockKeys.map(key => (key === folderSlotId ? children[0].key : key))
    firstChildIndex = 1
    if (cursor < 0) cursor = 0
  } else if (cursor >= 0) {
    nextOuterSlots[cursor] = children[0].key
    firstChildIndex = 1
    cursor += 1
  } else {
    cursor = 0
  }

  for (let childIndex = firstChildIndex; childIndex < children.length; childIndex += 1) {
    let anchorIndex = findFreeAnchorIndexFrom(nextOuterSlots, nextItems, cursor, columns, pageSize)
    if (anchorIndex < 0) {
      nextOuterSlots = [...nextOuterSlots, ...Array.from({ length: pageSize }, () => null)]
      anchorIndex = nextOuterSlots.length - pageSize
    }
    nextOuterSlots[anchorIndex] = children[childIndex].key
    cursor = anchorIndex + 1
  }

  return { items: nextItems, outerSlots: nextOuterSlots, dockKeys: nextDockKeys }
}
