import type { GridItem, IconItem } from '../model'

export const findFolderIndexById = (items: GridItem[], folderId: string): number =>
  items.findIndex(item => item.kind === 'folder' && item.id === folderId)

export const getFolderChildrenById = (items: GridItem[], folderId: string): IconItem[] => {
  const index = findFolderIndexById(items, folderId)
  if (index < 0) return []
  const item = items[index]
  return item && item.kind === 'folder' ? item.children : []
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
