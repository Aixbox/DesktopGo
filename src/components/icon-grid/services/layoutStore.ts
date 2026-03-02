import { invoke } from '@tauri-apps/api/core'
import type { DesktopIcon } from '../../../types'
import { buildIconSelectionKey } from '../../../stores/iconStore'
import type { GridItem, IconItem, PersistedItem, PersistedLayout } from '../model'
import { makeFolderId } from '../model'

const LAYOUT_KEY = 'desktopgo.launchpad.layout.v1'

export const serializeItems = (items: GridItem[]): PersistedItem[] =>
  items.map<PersistedItem>(item =>
    item.kind === 'icon'
      ? { type: 'icon', key: item.key }
      : {
          type: 'folder',
          id: item.id,
          name: item.name,
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
    if (!Array.isArray(parsed.items)) return null
    if (parsed.version === 1) return { items: parsed.items, slots: null }
    if (parsed.version !== 2 || !Array.isArray(parsed.slots)) return null
    return {
      items: parsed.items,
      slots: parsed.slots.map(slot => (typeof slot === 'string' ? slot : null)),
    }
  } catch {
    return null
  }
}

export const writeLayout = async (items: GridItem[], slots: Array<string | null>) => {
  const payload = {
    version: 2,
    items: serializeItems(items),
    slots,
  }
  await invoke('set_layout_payload', { key: LAYOUT_KEY, payload: JSON.stringify(payload) })
}

export const hydrateItems = (icons: DesktopIcon[], persisted: PersistedItem[] | null): GridItem[] => {
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
