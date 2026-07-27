import type { GridItem } from '../model'
import { getFolderChildSelectionsByIds } from '../domain/folderPolicy'
import { collectElementCenters, type ElementCenters } from '../domain/dragWorkflowShared'

export const seedSelectedFolderChildCenters = ({
  items,
  draggingIds,
  initialCenters,
  folderTileRefs,
  tileRefs,
  dockItemRefs,
  iconImageSize,
}: {
  items: GridItem[]
  draggingIds: string[]
  initialCenters: ElementCenters
  folderTileRefs: Map<string, HTMLDivElement>
  tileRefs: Map<string, HTMLDivElement>
  dockItemRefs: Map<string, HTMLDivElement>
  iconImageSize: number
}) => {
  const selections = getFolderChildSelectionsByIds(items, draggingIds)
  if (selections.size === 0) return false
  const folderCenters = collectElementCenters(folderTileRefs)
  selections.forEach((children, folderId) => {
    const folderNode = tileRefs.get(`folder:${folderId}`) ?? dockItemRefs.get(`folder:${folderId}`)
    const folderRect = folderNode?.getBoundingClientRect() ?? null
    const collapsedCenter = folderRect
      ? { x: folderRect.left + folderRect.width / 2, y: folderRect.top + folderRect.height / 2 }
      : null
    const stackOffset = Math.min(10, Math.max(4, Math.round(iconImageSize * 0.14)))
    children.forEach((child, index) => {
      if (folderCenters[child.key]) {
        initialCenters[child.key] = folderCenters[child.key]
      } else if (collapsedCenter) {
        initialCenters[child.key] = {
          x: collapsedCenter.x + ((index % 2) - 0.5) * stackOffset * 2,
          y: collapsedCenter.y + Math.floor(index / 2) * stackOffset - stackOffset / 2,
        }
      }
    })
  })
  return true
}
