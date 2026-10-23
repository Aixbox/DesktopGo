import { invoke } from '@tauri-apps/api/core'
import { translate } from '../../../lib/i18n'
import { normalizeDockKeys } from '../domain/dock'
import { buildPersistedItemCoordinates } from '../domain/topLevelLayout'
import type {
  GridItem,
  IconItem,
  PersistedGridCoordinate,
  PersistedItem,
  PersistedItemCoordinates,
  PersistedLayout,
  ScrollGroupIcon,
  ScrollGroupMeta,
} from '../model'
import { makeFolderId, SCROLL_GROUP_ICONS } from '../model'
import type { DesktopIcon } from '../../../types'
import { buildIconSelectionKey } from '../../../lib/iconKey'
import { recordAutoLayoutSnapshot } from '../../layout-library/layoutLibrary'

export const LAYOUT_KEY = 'desktopgo.launchpad.layout.v1'
export const SCROLL_LAYOUT_KEY = 'desktopgo.launchpad.layout.scroll.v1'
export const LAUNCHPAD_LAYOUT_RESET_EVENT = 'launchpad:layout-reset'

export interface LaunchpadLayoutResetPayload {
  placeNewIcons?: boolean
}

export type LaunchpadLayoutScope = 'paged' | 'scroll'

const getLayoutKey = (scope: LaunchpadLayoutScope) =>
  scope === 'scroll' ? SCROLL_LAYOUT_KEY : LAYOUT_KEY

export const serializeItems = (items: GridItem[]): PersistedItem[] =>
  items.map<PersistedItem>(item =>
    item.kind === 'icon'
      ? { type: 'icon', key: item.key }
      : {
          type: 'folder',
          id: item.id,
          name: item.name,
          size: item.size,
          children: item.children.map(child => child.key),
        }
  )

const normalizePersistedGridCoordinate = (value: unknown): PersistedGridCoordinate | null => {
  if (!value || typeof value !== 'object') return null

  const { page, row, col } = value as {
    page?: unknown
    row?: unknown
    col?: unknown
  }
  const safePage = typeof page === 'number' ? page : Number.NaN
  const safeRow = typeof row === 'number' ? row : Number.NaN
  const safeCol = typeof col === 'number' ? col : Number.NaN

  if (
    !Number.isInteger(safePage) ||
    !Number.isInteger(safeRow) ||
    !Number.isInteger(safeCol) ||
    safePage < 0 ||
    safeRow < 0 ||
    safeCol < 0
  ) {
    return null
  }

  return { page: safePage, row: safeRow, col: safeCol }
}

const normalizePersistedItemCoordinates = (
  value: unknown
): PersistedItemCoordinates[] | undefined => {
  if (!Array.isArray(value)) return undefined

  const result: PersistedItemCoordinates[] = []
  value.forEach(entry => {
    if (!entry || typeof entry !== 'object') return

    const { id, cells } = entry as { id?: unknown; cells?: unknown }
    if (typeof id !== 'string' || !Array.isArray(cells)) return

    const normalizedCells = cells
      .map(cell => normalizePersistedGridCoordinate(cell))
      .filter((cell): cell is PersistedGridCoordinate => cell !== null)

    if (normalizedCells.length === 0) return

    result.push({
      id,
      cells: normalizedCells,
    })
  })

  return result.length > 0 ? result : undefined
}

type PersistedLayoutPayload =
  | { version: 1; items: PersistedItem[] }
  | { version: 2; items: PersistedItem[]; slots: unknown[] }
  | { version: 3; items: PersistedItem[]; slots: unknown[]; dockKeys: unknown[] }
  | { version: 4; items: PersistedItem[]; slots: unknown[]; dockKeys: unknown[] }
  | {
      version: 5
      items: PersistedItem[]
      slots: unknown[]
      dockKeys: unknown[]
      pageSize?: number
      columns?: number
    }
  | {
      version: 6
      items: PersistedItem[]
      slots: unknown[]
      dockKeys: unknown[]
      pageSize?: number
      columns?: number
      coordinates?: unknown
    }
  | {
      version: 7
      items: PersistedItem[]
      slots: unknown[]
      dockKeys: unknown[]
      pageSize?: number
      columns?: number
      coordinates?: unknown
      geometryKey?: unknown
    }
  | {
      version: 8
      items: PersistedItem[]
      slots: unknown[]
      dockKeys: unknown[]
      pageSize?: number
      columns?: number
      coordinates?: unknown
      geometryKey?: unknown
      scrollGroups?: unknown
    }
  | {
      version: 9
      items: PersistedItem[]
      slots: unknown[]
      dockKeys: unknown[]
      pageSize?: number
      columns?: number
      coordinates?: unknown
      geometryKey?: unknown
      scrollGroups?: unknown
    }

export const parsePersistedLayout = (raw: string): PersistedLayout | null => {
  const parsed = JSON.parse(raw) as unknown
  if (!parsed || typeof parsed !== 'object') return null

  const payload = parsed as PersistedLayoutPayload
  if (!Array.isArray(payload.items)) return null
  if (payload.version === 1) return { items: payload.items, slots: null, dockKeys: [] }
  if (payload.version === 2 && Array.isArray(payload.slots)) {
    return {
      items: payload.items,
      slots: payload.slots.map(slot => (typeof slot === 'string' ? slot : null)),
      dockKeys: [],
    }
  }
  if (
    (payload.version !== 3 &&
      payload.version !== 4 &&
      payload.version !== 5 &&
      payload.version !== 6 &&
      payload.version !== 7 &&
      payload.version !== 8 &&
      payload.version !== 9) ||
    !Array.isArray(payload.slots) ||
    !Array.isArray(payload.dockKeys)
  ) {
    return null
  }
  const result: PersistedLayout = {
    items: payload.items,
    slots: payload.slots.map(slot => (typeof slot === 'string' ? slot : null)),
    dockKeys: payload.dockKeys.map(key => (typeof key === 'string' ? key : null)),
  }
  if (payload.version === 5) {
    if (typeof payload.pageSize === 'number' && payload.pageSize > 0)
      result.pageSize = payload.pageSize
    if (typeof payload.columns === 'number' && payload.columns > 0) result.columns = payload.columns
  }
  if (payload.version === 6) {
    if (typeof payload.pageSize === 'number' && payload.pageSize > 0)
      result.pageSize = payload.pageSize
    if (typeof payload.columns === 'number' && payload.columns > 0) result.columns = payload.columns
    result.coordinates = normalizePersistedItemCoordinates(payload.coordinates)
  }
  if (payload.version === 7 || payload.version === 8 || payload.version === 9) {
    if (typeof payload.pageSize === 'number' && payload.pageSize > 0)
      result.pageSize = payload.pageSize
    if (typeof payload.columns === 'number' && payload.columns > 0) result.columns = payload.columns
    result.coordinates = normalizePersistedItemCoordinates(payload.coordinates)
    if (typeof payload.geometryKey === 'string' && payload.geometryKey.length > 0) {
      result.geometryKey = payload.geometryKey
    }
    if ((payload.version === 8 || payload.version === 9) && Array.isArray(payload.scrollGroups)) {
      const validIcons = new Set<ScrollGroupIcon>(SCROLL_GROUP_ICONS)
      result.scrollGroups = payload.scrollGroups.flatMap((entry, index) => {
        if (!entry || typeof entry !== 'object') return []
        const name = 'name' in entry && typeof entry.name === 'string' ? entry.name.trim() : ''
        const icon = 'icon' in entry && typeof entry.icon === 'string' ? entry.icon : ''
        if (!name || !validIcons.has(icon as ScrollGroupIcon)) return []
        const id = 'id' in entry && typeof entry.id === 'string' ? entry.id.trim() : ''
        const itemIds =
          'itemIds' in entry && Array.isArray(entry.itemIds)
            ? entry.itemIds.filter(
                (itemId: unknown): itemId is string => typeof itemId === 'string'
              )
            : []
        return [
          {
            id: id || `scroll-group-migrated-${index + 1}`,
            name,
            icon: icon as ScrollGroupIcon,
            itemIds,
          } satisfies ScrollGroupMeta,
        ]
      })
      result.scrollGroupItemsExplicit = payload.version === 9
    }
  }
  return result
}

export const parsePersistedLayoutStrict = (
  raw: string,
  scope: LaunchpadLayoutScope
): PersistedLayout => {
  const key = getLayoutKey(scope)
  let layout: PersistedLayout | null
  try {
    layout = parsePersistedLayout(raw)
  } catch (error) {
    throw new Error(
      `Unable to parse persisted layout payload for scope "${scope}" (key "${key}"): ${String(error)}`
    )
  }
  if (!layout) {
    throw new Error(`Invalid persisted layout payload for scope "${scope}" (key "${key}").`)
  }
  return layout
}

export const readLayout = async (
  scope: LaunchpadLayoutScope = 'paged'
): Promise<PersistedLayout | null> => {
  try {
    const raw = await invoke<string | null>('get_layout_payload', { key: getLayoutKey(scope) })
    if (raw === null) return null
    return parsePersistedLayout(raw)
  } catch {
    return null
  }
}

export const readLayoutStrict = async (
  scope: LaunchpadLayoutScope = 'paged'
): Promise<PersistedLayout | null> => {
  const key = getLayoutKey(scope)
  const raw = await invoke<string | null>('get_layout_payload', { key })
  if (raw === null) return null
  return parsePersistedLayoutStrict(raw, scope)
}

// 内容未变化的布局重复写入会放大状态振荡（每次保存都触发下游刷新），按 key 去重。
const lastWrittenPayloadByKey = new Map<string, string>()

export const writeLayout = async (
  items: GridItem[],
  slots: Array<string | null>,
  dockKeys: Array<string | null>,
  pageSize?: number,
  columns?: number,
  geometryKey?: string,
  scrollGroups?: ScrollGroupMeta[],
  scope: LaunchpadLayoutScope = 'paged'
) => {
  const coordinates =
    typeof pageSize === 'number' && typeof columns === 'number' && pageSize > 0 && columns > 0
      ? buildPersistedItemCoordinates(slots, items, pageSize, columns)
      : undefined
  const payload = {
    version: 9,
    items: serializeItems(items),
    slots,
    dockKeys,
    pageSize,
    columns,
    coordinates,
    geometryKey,
    scrollGroups,
  }
  const serialized = JSON.stringify(payload)
  const key = getLayoutKey(scope)
  if (lastWrittenPayloadByKey.get(key) === serialized) return
  lastWrittenPayloadByKey.set(key, serialized)
  await invoke('set_layout_payload', {
    key,
    payload: serialized,
  })
  recordAutoLayoutSnapshot(serialized, scope)
}

/** 读取当前布局的原始 payload（版本迁移、恢复预览都按原串写回，避免二次序列化丢字段）。 */
export const readLayoutPayload = async (
  scope: LaunchpadLayoutScope = 'paged'
): Promise<string | null> => invoke<string | null>('get_layout_payload', { key: getLayoutKey(scope) })

/**
 * 直接把一份原始 payload 写回当前布局。
 *
 * 与 `writeLayout` 的区别：不重算坐标、不记历史快照（预览与撤销都是瞬态），
 * 但会同步写入去重缓存，否则网格下一次保存同内容时会被误判为"已写过"而跳过。
 */
export const applyLayoutPayload = async (
  payload: string,
  scope: LaunchpadLayoutScope = 'paged'
): Promise<void> => {
  const key = getLayoutKey(scope)
  await invoke('set_layout_payload', { key, payload })
  lastWrittenPayloadByKey.set(key, payload)
}

export const writePersistedLayout = async (
  layout: PersistedLayout | null,
  scope: LaunchpadLayoutScope = 'paged'
) => {
  if (!layout) {
    await writeLayout([], [], [], undefined, undefined, undefined, undefined, scope)
    return
  }

  const payload = {
    version: 9,
    items: layout.items,
    slots: layout.slots ?? [],
    dockKeys: layout.dockKeys ?? [],
    pageSize: layout.pageSize,
    columns: layout.columns,
    coordinates: layout.coordinates,
    geometryKey: layout.geometryKey,
    scrollGroups: layout.scrollGroups,
  }
  await invoke('set_layout_payload', {
    key: getLayoutKey(scope),
    payload: JSON.stringify(payload),
  })
}

export const resetLaunchpadLayout = async () => {
  await Promise.all([
    writeLayout([], [], []),
    writeLayout([], [], [], undefined, undefined, undefined, undefined, 'scroll'),
  ])
}

export const hydrateDockKeys = (
  itemIds: string[],
  persisted: Array<string | null> | null | undefined
): string[] =>
  normalizeDockKeys(
    persisted?.map(key => (key ? key.replace(/^(desktop|customapp):/, '') : null)),
    itemIds
  )

const hydrateItemsWithFolderAliases = (
  icons: DesktopIcon[],
  persisted: PersistedItem[] | null
): { items: GridItem[]; collapsedFolderAliases: Map<string, string> } => {
  const iconMap = new Map<string, IconItem>()
  icons.forEach(icon => {
    const key = buildIconSelectionKey(icon)
    iconMap.set(key, { kind: 'icon', key, icon })
  })

  const consumed = new Set<string>()
  const result: GridItem[] = []
  const collapsedFolderAliases = new Map<string, string>()
  const normalizeLegacyKey = (key: string) => key.replace(/^(desktop|customapp):/, '')

  if (persisted) {
    persisted.forEach(item => {
      if (item.type === 'icon') {
        const key = normalizeLegacyKey(item.key)
        if (consumed.has(key)) return
        const iconItem = iconMap.get(key)
        if (!iconItem) return
        consumed.add(key)
        result.push(iconItem)
        return
      }

      const children: IconItem[] = []
      item.children.forEach(persistedKey => {
        const key = normalizeLegacyKey(persistedKey)
        if (consumed.has(key)) return
        const iconItem = iconMap.get(key)
        if (!iconItem) return
        consumed.add(key)
        children.push(iconItem)
      })

      if (children.length >= 2) {
        result.push({
          kind: 'folder',
          id: item.id || makeFolderId(),
          name: item.name || translate('New Folder'),
          size: item.size ?? '1x1',
          children,
        })
      } else if (children.length === 1) {
        result.push(children[0])
        if (item.id) {
          collapsedFolderAliases.set('folder:' + item.id, children[0].key)
        }
      }
    })
  }

  icons.forEach(icon => {
    const key = buildIconSelectionKey(icon)
    if (!consumed.has(key)) {
      result.push({ kind: 'icon', key, icon })
    }
  })

  return { items: result, collapsedFolderAliases }
}

export const hydrateLayout = (
  icons: DesktopIcon[],
  persisted: PersistedLayout | null
): { items: GridItem[]; layout: PersistedLayout | null } => {
  const { items, collapsedFolderAliases } = hydrateItemsWithFolderAliases(
    icons,
    persisted?.items ?? null
  )
  if (!persisted || collapsedFolderAliases.size === 0) {
    return { items, layout: persisted }
  }

  const replaceItemId = (id: string | null): string | null =>
    id === null ? null : (collapsedFolderAliases.get(id) ?? id)

  return {
    items,
    layout: {
      ...persisted,
      slots: persisted.slots?.map(replaceItemId) ?? null,
      dockKeys: persisted.dockKeys.map(replaceItemId),
      coordinates: persisted.coordinates?.map(coordinate => ({
        ...coordinate,
        id: collapsedFolderAliases.get(coordinate.id) ?? coordinate.id,
      })),
      scrollGroups: persisted.scrollGroups?.map(group => ({
        ...group,
        itemIds: group.itemIds.map(id => collapsedFolderAliases.get(id) ?? id),
      })),
    },
  }
}

export const hydrateItems = (icons: DesktopIcon[], persisted: PersistedItem[] | null): GridItem[] =>
  hydrateItemsWithFolderAliases(icons, persisted).items
