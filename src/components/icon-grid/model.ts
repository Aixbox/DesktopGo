import type { DesktopIcon } from '../../types'

export type HoverZone = 'left' | 'right' | 'up' | 'down' | 'center'
export type EvasionDirection = 'left' | 'right' | 'up' | 'down'

export type IconItem = {
  kind: 'icon'
  key: string
  icon: DesktopIcon
}

export type FolderSize = '1x1' | '1x2' | '2x1' | '2x2'

/** Persisted folder profile identifiers mirror the ColorOS device modes. */
export type FolderLayoutProfileId = 'standard' | 'simple' | 'big'

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

/**
 * A provider-backed widget placeholder. The provider metadata is persisted so
 * a resize transaction can be replayed after hydration even when the native
 * provider view is supplied by a future platform adapter.
 */
export type WidgetItem = {
  kind: 'widget'
  id: string
  provider: string
  label: string
  spanX: number
  spanY: number
  minSpanX: number
  minSpanY: number
  maxSpanX: number
  maxSpanY: number
  appWidgetId?: number
}

export type GridItem = IconItem | FolderItem | WidgetItem
export type DragContext = 'outer' | 'folder' | 'dock'

export const SCROLL_GROUP_ICONS = [
  'grid',
  'briefcase',
  'code',
  'gamepad',
  'palette',
  'book',
  'music',
  'star',
  'house',
  'globe',
  'message',
  'camera',
  'video',
  'shopping',
  'wallet',
  'tools',
  'cloud',
  'mail',
  'calendar',
  'health',
  'travel',
  'food',
  'fitness',
  'archive',
  'terminal',
  'database',
  'security',
  'ideas',
  'team',
  'office',
  'lab',
  'projects',
  'notifications',
  'bookmarks',
  'ai',
  'storage',
  'thinking',
  'testing',
  'vehicles',
  'budget',
  'lists',
  'time',
  'coffee',
  'hardware',
  'downloads',
  'documents',
  'movies',
  'gifts',
  'education',
  'headphones',
  'images',
  'keys',
  'computers',
  'resources',
  'maps',
  'displays',
  'night',
  'news',
  'pets',
  'phone',
  'printing',
  'radio',
  'search',
  'settings',
  'mobile',
  'daytime',
  'tags',
  'achievements',
  'logistics',
  'television',
  'productivity',
  'nature',
] as const

export type ScrollGroupIcon = (typeof SCROLL_GROUP_ICONS)[number]

export interface ScrollGroupMeta {
  id: string
  name: string
  icon: ScrollGroupIcon
  itemIds: string[]
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
  | {
      type: 'widget'
      id: string
      provider: string
      label: string
      spanX: number
      spanY: number
      minSpanX?: number
      minSpanY?: number
      maxSpanX?: number
      maxSpanY?: number
      appWidgetId?: number
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

export type HotseatPlaceholderKind = 'docker' | 'subscribe' | 'divider'

export type HotseatEntry =
  | { kind: 'item'; id: string }
  | { kind: 'placeholder'; placeholder: HotseatPlaceholderKind }
  | null

export type PersistedPlacementContainer = 'workspace' | 'dock' | { folderId: string }

/** Canonical v10 placement record; slots/coordinates remain migration views. */
export interface PersistedPlacement {
  id: string
  container: PersistedPlacementContainer
  page: number
  row: number
  col: number
  spanX: number
  spanY: number
  rank: number
}

export interface PersistedLayout {
  items: PersistedItem[]
  slots: Array<string | null> | null
  dockKeys: Array<string | null>
  /** Optional ColorOS runtime entries; placeholders stay outside item placement ids. */
  hotseatEntries?: HotseatEntry[]
  /** 单调递增的提交版本，用于 preview/commit 和恢复诊断。 */
  revision?: number
  /** 对去除 revision/checksum 后的规范 payload 计算的完整性校验值。 */
  checksum?: string
  placements?: PersistedPlacement[]
  pageSize?: number
  columns?: number
  coordinates?: PersistedItemCoordinates[]
  // 兼容旧版本的几何标识；新版本由完整 measurement key 生成。
  geometryKey?: string
  scrollGroups?: ScrollGroupMeta[]
  /** Folder columns/rows profile used to materialize child rank/page coordinates. */
  folderProfileId?: FolderLayoutProfileId
  // v9 起滚动布局使用显式分组成员；v8 及更早版本仍需从 slots 一次性迁移。
  scrollGroupItemsExplicit?: boolean
}

export const getId = (item: GridItem): string =>
  item.kind === 'icon' ? item.key : `${item.kind}:${item.id}`

export const getGridItemSpan = (item: GridItem): GridSpan => {
  if (item.kind === 'icon') return { cols: 1, rows: 1 }
  if (item.kind === 'widget') {
    return {
      cols: Math.max(1, Math.floor(item.spanX)),
      rows: Math.max(1, Math.floor(item.spanY)),
    }
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
