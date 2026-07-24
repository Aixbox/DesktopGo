import type { GridItem } from '../model'
import { getFolderChildrenById } from './folderPolicy'
import { resolveSelectedIconDragIds } from './dragWorkflowShared'

type DragContext = 'outer' | 'folder' | 'dock'

interface ResolveSelectedFolderDragIdsParams {
  items: GridItem[]
  preferredFolderId: string | null
  leadId: string
  selectedIconKeys: ReadonlySet<string>
}

const resolveSelectedFolderDragIds = ({
  items,
  preferredFolderId,
  leadId,
  selectedIconKeys,
}: ResolveSelectedFolderDragIdsParams): string[] => {
  const folderIds = items.flatMap(item =>
    item.kind === 'folder' && item.id !== preferredFolderId ? [item.id] : []
  )
  if (preferredFolderId) folderIds.unshift(preferredFolderId)

  const ordered: string[] = []
  const seen = new Set<string>()
  folderIds.forEach(folderId => {
    getFolderChildrenById(items, folderId).forEach(child => {
      if (child.key === leadId || !selectedIconKeys.has(child.key) || seen.has(child.key)) return
      seen.add(child.key)
      ordered.push(child.key)
    })
  })
  return ordered
}

interface ResolveMixedSelectionDragIdsParams {
  context: DragContext
  leadId: string
  leadItem: GridItem
  sourceOrder: Array<string | null>
  sourceFolderId: string | null
  openFolderId: string | null
  selectionMode: boolean
  selectedIconKeys: ReadonlySet<string>
  items: GridItem[]
  itemById: Map<string, GridItem>
  getTopLevelOrder: (context: 'outer' | 'dock') => Array<string | null>
}

export const resolveMixedSelectionDragIds = ({
  context,
  leadId,
  leadItem,
  sourceOrder,
  sourceFolderId,
  openFolderId,
  selectionMode,
  selectedIconKeys,
  items,
  itemById,
  getTopLevelOrder,
}: ResolveMixedSelectionDragIdsParams): string[] => {
  if (!selectionMode || leadItem.kind !== 'icon') return [leadId]

  const resolveSelected = (order: Array<string | null>) =>
    resolveSelectedIconDragIds(order, leadId, itemById, selectedIconKeys)
  const selectedByContext: Record<DragContext, string[]> = {
    dock: resolveSelected(context === 'dock' ? sourceOrder : getTopLevelOrder('dock')),
    outer: resolveSelected(context === 'outer' ? sourceOrder : getTopLevelOrder('outer')),
    folder: resolveSelectedFolderDragIds({
      items,
      preferredFolderId: sourceFolderId ?? openFolderId,
      leadId,
      selectedIconKeys,
    }),
  }
  const contextPriority: Record<DragContext, DragContext[]> = {
    folder: ['folder', 'dock', 'outer'],
    dock: ['dock', 'folder', 'outer'],
    outer: ['outer', 'dock', 'folder'],
  }

  const ordered = [leadId]
  const seen = new Set(ordered)
  contextPriority[context].forEach(sourceContext => {
    selectedByContext[sourceContext].forEach(id => {
      if (seen.has(id)) return
      seen.add(id)
      ordered.push(id)
    })
  })
  return ordered
}
