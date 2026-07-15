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
import { buildIconSelectionKey } from '../../../stores/iconStore'

export const LAYOUT_KEY = 'desktopgo.launchpad.layout.v1'
export const LAUNCHPAD_LAYOUT_RESET_EVENT = 'launchpad:layout-reset'

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

export const readLayout = async (): Promise<PersistedLayout | null> => {
  try {
    const raw = await invoke<string | null>('get_layout_payload', { key: LAYOUT_KEY })
    if (!raw) return null
    const parsed = JSON.parse(raw) as
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
    if (!Array.isArray(parsed.items)) return null
    if (parsed.version === 1) return { items: parsed.items, slots: null, dockKeys: [] }
    if (parsed.version === 2 && Array.isArray(parsed.slots)) {
      return {
        items: parsed.items,
        slots: parsed.slots.map(slot => (typeof slot === 'string' ? slot : null)),
        dockKeys: [],
      }
    }
    if (
      (parsed.version !== 3 &&
        parsed.version !== 4 &&
        parsed.version !== 5 &&
        parsed.version !== 6 &&
        parsed.version !== 7 &&
        parsed.version !== 8) ||
      !Array.isArray(parsed.slots) ||
      !Array.isArray(parsed.dockKeys)
    ) {
      return null
    }
    const result: PersistedLayout = {
      items: parsed.items,
      slots: parsed.slots.map(slot => (typeof slot === 'string' ? slot : null)),
      dockKeys: parsed.dockKeys.map(key => (typeof key === 'string' ? key : null)),
    }
    if (parsed.version === 5) {
      if (typeof parsed.pageSize === 'number' && parsed.pageSize > 0)
        result.pageSize = parsed.pageSize
      if (typeof parsed.columns === 'number' && parsed.columns > 0) result.columns = parsed.columns
    }
    if (parsed.version === 6) {
      if (typeof parsed.pageSize === 'number' && parsed.pageSize > 0)
        result.pageSize = parsed.pageSize
      if (typeof parsed.columns === 'number' && parsed.columns > 0) result.columns = parsed.columns
      result.coordinates = normalizePersistedItemCoordinates(parsed.coordinates)
    }
    if (parsed.version === 7 || parsed.version === 8) {
      if (typeof parsed.pageSize === 'number' && parsed.pageSize > 0)
        result.pageSize = parsed.pageSize
      if (typeof parsed.columns === 'number' && parsed.columns > 0) result.columns = parsed.columns
      result.coordinates = normalizePersistedItemCoordinates(parsed.coordinates)
      if (typeof parsed.geometryKey === 'string' && parsed.geometryKey.length > 0) {
        result.geometryKey = parsed.geometryKey
      }
      if (parsed.version === 8 && Array.isArray(parsed.scrollGroups)) {
        const validIcons = new Set<ScrollGroupIcon>(SCROLL_GROUP_ICONS)
        result.scrollGroups = parsed.scrollGroups.flatMap(entry => {
          if (!entry || typeof entry !== 'object') return []
          const name = 'name' in entry && typeof entry.name === 'string' ? entry.name.trim() : ''
          const icon = 'icon' in entry && typeof entry.icon === 'string' ? entry.icon : ''
          if (!name || !validIcons.has(icon as ScrollGroupIcon)) return []
          return [{ name, icon: icon as ScrollGroupIcon } satisfies ScrollGroupMeta]
        })
      }
    }
    return result
  } catch {
    return null
  }
}

export const writeLayout = async (
  items: GridItem[],
  slots: Array<string | null>,
  dockKeys: Array<string | null>,
  pageSize?: number,
  columns?: number,
  geometryKey?: string,
  scrollGroups?: ScrollGroupMeta[]
) => {
  const coordinates =
    typeof pageSize === 'number' && typeof columns === 'number' && pageSize > 0 && columns > 0
      ? buildPersistedItemCoordinates(slots, items, pageSize, columns)
      : undefined
  const payload = {
    version: 8,
    items: serializeItems(items),
    slots,
    dockKeys,
    pageSize,
    columns,
    coordinates,
    geometryKey,
    scrollGroups,
  }
  await invoke('set_layout_payload', { key: LAYOUT_KEY, payload: JSON.stringify(payload) })
}

export const writePersistedLayout = async (layout: PersistedLayout | null) => {
  if (!layout) {
    await writeLayout([], [], [])
    return
  }

  const payload = {
    version: 8,
    items: layout.items,
    slots: layout.slots ?? [],
    dockKeys: layout.dockKeys ?? [],
    pageSize: layout.pageSize,
    columns: layout.columns,
    coordinates: layout.coordinates,
    geometryKey: layout.geometryKey,
    scrollGroups: layout.scrollGroups,
  }
  await invoke('set_layout_payload', { key: LAYOUT_KEY, payload: JSON.stringify(payload) })
}

export const resetLaunchpadLayout = async () => {
  await writeLayout([], [], [])
}

export const hydrateDockKeys = (
  itemIds: string[],
  persisted: Array<string | null> | null | undefined
): string[] =>
  normalizeDockKeys(
    persisted?.map(key => (key ? key.replace(/^(desktop|customapp):/, '') : null)),
    itemIds
  )

export const hydrateItems = (
  icons: DesktopIcon[],
  persisted: PersistedItem[] | null
): GridItem[] => {
  const iconMap = new Map<string, IconItem>()
  icons.forEach(icon => {
    const key = buildIconSelectionKey(icon)
    iconMap.set(key, { kind: 'icon', key, icon })
  })

  const consumed = new Set<string>()
  const result: GridItem[] = []
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
      }
    })
  }

  icons.forEach(icon => {
    const key = buildIconSelectionKey(icon)
    if (!consumed.has(key)) {
      result.push({ kind: 'icon', key, icon })
    }
  })

  return result
}
