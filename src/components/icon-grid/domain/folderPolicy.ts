import type { GridItem, IconItem } from '../model'

export const findFolderIndexById = (items: GridItem[], folderId: string): number =>
  items.findIndex(item => item.kind === 'folder' && item.id === folderId)

export const getFolderChildrenById = (items: GridItem[], folderId: string): IconItem[] => {
  const index = findFolderIndexById(items, folderId)
  if (index < 0) return []
  const item = items[index]
  return item && item.kind === 'folder' ? item.children : []
}

export const replaceFolderChildren = (
  items: GridItem[],
  folderId: string,
  nextChildren: IconItem[]
): GridItem[] => {
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
    next[index] = nextChildren[0]
    return next
  }

  next.splice(index, 1)
  return next
}
