import type { DesktopIcon } from '../../types'

export type HoverZone = 'left' | 'right' | 'up' | 'down' | 'center'
export type EvasionDirection = 'left' | 'right' | 'up' | 'down'

export type IconItem = {
  kind: 'icon'
  key: string
  icon: DesktopIcon
}

export type FolderItem = {
  kind: 'folder'
  id: string
  name: string
  children: IconItem[]
}

export type GridItem = IconItem | FolderItem
export type DragContext = 'outer' | 'folder'

export type PersistedItem =
  | {
      type: 'icon'
      key: string
    }
  | {
      type: 'folder'
      id: string
      name: string
      children: string[]
    }

export interface PersistedLayout {
  items: PersistedItem[]
  slots: Array<string | null> | null
  dockKeys: string[]
}

export const getId = (item: GridItem): string =>
  item.kind === 'icon' ? item.key : `folder:${item.id}`

export const makeFolderId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `folder-${Date.now()}-${Math.random().toString(16).slice(2)}`
}
