import type { DesktopIcon } from '../../types'

export type HoverZone = 'left' | 'right' | 'up' | 'down' | 'center'
export type EvasionDirection = 'left' | 'right' | 'up' | 'down'

export type IconItem = {
  kind: 'icon'
  key: string
  icon: DesktopIcon
}

export type FolderSize = '1x1' | '1x2' | '2x1' | '2x2'

export interface GridSpan {
  cols: number
  rows: number
}

export type FolderItem = {
  kind: 'folder'
  id: string
  name: string
  size: FolderSize
  children: IconItem[]
}

export type GridItem = IconItem | FolderItem
export type DragContext = 'outer' | 'folder' | 'dock'

export type ScrollGroupIcon =
  | 'grid'
  | 'briefcase'
  | 'code'
  | 'gamepad'
  | 'palette'
  | 'book'
  | 'music'
  | 'star'

export interface ScrollGroupMeta {
  name: string
  icon: ScrollGroupIcon
}

export type PersistedItem =
  | {
      type: 'icon'
      key: string
    }
  | {
      type: 'folder'
      id: string
      name: string
      size?: FolderSize
      children: string[]
    }

export interface PersistedGridCoordinate {
  page: number
  row: number
  col: number
}

export interface PersistedItemCoordinates {
  id: string
  cells: PersistedGridCoordinate[]
}

export interface PersistedLayout {
  items: PersistedItem[]
  slots: Array<string | null> | null
  dockKeys: Array<string | null>
  pageSize?: number
  columns?: number
  coordinates?: PersistedItemCoordinates[]
  // 网格几何锁定标识，形如 `${windowMode}:${iconSize}:${dockEnabled}`。
  // 只有该三元组变化时才重新测量列数/行数，避免 DPI/分辨率切换导致图标重排。
  geometryKey?: string
  scrollGroups?: ScrollGroupMeta[]
}

export const getId = (item: GridItem): string =>
  item.kind === 'icon' ? item.key : `folder:${item.id}`

export const getGridItemSpan = (item: GridItem): GridSpan => {
  if (item.kind === 'icon') {
    return { cols: 1, rows: 1 }
  }

  switch (item.size) {
    case '1x2':
      return { cols: 1, rows: 2 }
    case '2x1':
      return { cols: 2, rows: 1 }
    case '2x2':
      return { cols: 2, rows: 2 }
    default:
      return { cols: 1, rows: 1 }
  }
}

export const makeFolderId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `folder-${Date.now()}-${Math.random().toString(16).slice(2)}`
}
