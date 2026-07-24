import type { GridItem, IconItem } from '../model'
import { getId } from '../model'
import {
  getFolderChildSelectionsByIds,
  getFolderChildrenById,
  replaceFolderChildren,
} from './folderPolicy'

export const filterItemsByIds = (items: GridItem[], ids: string[]): GridItem[] => {
  const idSet = new Set(ids)
  return items.filter(item => idSet.has(getId(item)))
}

export const extractDraggedIconsFromSourceFolders = (
  base: GridItem[],
  draggingIds: string[]
): GridItem[] => {
  const selectedChildrenByFolderId = getFolderChildSelectionsByIds(base, draggingIds)
  if (selectedChildrenByFolderId.size === 0) return base

  let nextBase = base
  const extractedById = new Map<string, IconItem>()
  selectedChildrenByFolderId.forEach((children, folderId) => {
    children.forEach(child => {
      extractedById.set(child.key, child)
    })
    const draggedIdSet = new Set(children.map(child => child.key))
    const nextChildren = getFolderChildrenById(nextBase, folderId).filter(
      child => !draggedIdSet.has(child.key)
    )
    nextBase = replaceFolderChildren(nextBase, folderId, nextChildren, {
      collapseSingleChild: false,
    })
  })

  const existingIds = new Set(nextBase.map(getId))
  const extractedItems = Array.from(extractedById.values()).filter(
    child => !existingIds.has(child.key)
  )
  if (extractedItems.length === 0) return nextBase

  return [...nextBase, ...extractedItems]
}
