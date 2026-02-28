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

export const finalizeFolderExtractionInOuterLayout = (
  items: GridItem[],
  slots: Array<string | null>,
  folderId: string | null
): { items: GridItem[]; slots: Array<string | null> } => {
  if (!folderId) return { items, slots }
  const index = findFolderIndexById(items, folderId)
  if (index < 0) return { items, slots }
  const folder = items[index]
  if (!folder || folder.kind !== 'folder') return { items, slots }
  if (folder.children.length >= 2) return { items, slots }

  const folderSlotId = `folder:${folderId}`
  const nextItems = [...items]
  const nextSlots = slots.map(slot => {
    if (slot !== folderSlotId) return slot
    if (folder.children.length === 1) return folder.children[0].key
    return null
  })

  if (folder.children.length === 1) {
    nextItems[index] = folder.children[0]
    return { items: nextItems, slots: nextSlots }
  }

  nextItems.splice(index, 1)
  return { items: nextItems, slots: nextSlots }
}
