import { invoke } from '@tauri-apps/api/core'
import { normalizeDockKeys } from '../domain/dock'
import type { GridItem, IconItem, PersistedItem, PersistedLayout } from '../model'
import { makeFolderId } from '../model'
import type { DesktopIcon } from '../../../types'
import { buildIconSelectionKey } from '../../../stores/iconStore'

const LAYOUT_KEY = 'desktopgo.launchpad.layout.v1'

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

export const readLayout = async (): Promise<PersistedLayout | null> => {
  try {
    const raw = await invoke<string | null>('get_layout_payload', { key: LAYOUT_KEY })
    if (!raw) return null
    const parsed = JSON.parse(raw) as
      | { version: 1; items: PersistedItem[] }
      | { version: 2; items: PersistedItem[]; slots: unknown[] }
      | { version: 3; items: PersistedItem[]; slots: unknown[]; dockKeys: unknown[] }
      | { version: 4; items: PersistedItem[]; slots: unknown[]; dockKeys: unknown[] }
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
      (parsed.version !== 3 && parsed.version !== 4) ||
      !Array.isArray(parsed.slots) ||
      !Array.isArray(parsed.dockKeys)
    ) {
      return null
    }
    return {
      items: parsed.items,
      slots: parsed.slots.map(slot => (typeof slot === 'string' ? slot : null)),
      dockKeys: parsed.dockKeys.map(key => (typeof key === 'string' ? key : null)),
    }
  } catch {
    return null
  }
}

export const writeLayout = async (
  items: GridItem[],
  slots: Array<string | null>,
  dockKeys: Array<string | null>
) => {
  const payload = {
    version: 4,
    items: serializeItems(items),
    slots,
    dockKeys,
  }
  await invoke('set_layout_payload', { key: LAYOUT_KEY, payload: JSON.stringify(payload) })
}

export const hydrateDockKeys = (
  itemIds: string[],
  persisted: Array<string | null> | null | undefined
): string[] => normalizeDockKeys(persisted, itemIds)

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

  if (persisted) {
    persisted.forEach(item => {
      if (item.type === 'icon') {
        if (consumed.has(item.key)) return
        const iconItem = iconMap.get(item.key)
        if (!iconItem) return
        consumed.add(item.key)
        result.push(iconItem)
        return
      }

      const children: IconItem[] = []
      item.children.forEach(key => {
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
          name: item.name || 'New Folder',
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
