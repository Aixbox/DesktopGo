import type { AiWebsiteAddition } from '@/lib/aiOrganizeSessions'
import type { GridItem } from '@/components/icon-grid/model'

export interface WebsitePlacementResult {
  items: GridItem[]
  dockKeys: string[]
  resolvedPlacement: 'grid' | 'dock' | 'folder'
}

export function placeAiWebsiteIcon(
  items: GridItem[],
  dockKeys: string[],
  iconItem: Extract<GridItem, { kind: 'icon' }>,
  addition: AiWebsiteAddition
): WebsitePlacementResult {
  const iconKey = iconItem.key
  const nextItems = items.some(item => item.kind === 'icon' && item.key === iconKey)
    ? items
    : [...items, iconItem]

  if (addition.placement === 'dock') {
    return {
      items: nextItems,
      dockKeys: dockKeys.includes(iconKey) ? dockKeys : [...dockKeys, iconKey],
      resolvedPlacement: 'dock',
    }
  }

  if (addition.placement === 'folder' && addition.folder_name) {
    const targetName = addition.folder_name.trim().toLocaleLowerCase()
    const folderIndex = nextItems.findIndex(
      item => item.kind === 'folder' && item.name.trim().toLocaleLowerCase() === targetName
    )
    if (folderIndex >= 0) {
      const folder = nextItems[folderIndex]
      if (folder.kind === 'folder' && !folder.children.some(child => child.key === iconKey)) {
        const next = nextItems.filter(item => !(item.kind === 'icon' && item.key === iconKey))
        const targetIndex = next.findIndex(item => item.kind === 'folder' && item.id === folder.id)
        next[targetIndex] = { ...folder, children: [...folder.children, iconItem] }
        return {
          items: next,
          dockKeys: dockKeys.filter(key => key !== iconKey),
          resolvedPlacement: 'folder',
        }
      }
    }
  }

  return {
    items: nextItems,
    dockKeys: dockKeys.filter(key => key !== iconKey),
    resolvedPlacement: 'grid',
  }
}
