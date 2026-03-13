import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import type {
  DesktopIcon,
  IconMutationTarget,
  IconSize,
  TitleLineCount,
  WindowMode,
} from '../types'
import { ICON_SIZE_CONFIG, WINDOW_SIZE_CONFIG } from '../types'
import { getSetting, setSetting } from '../lib/settingsStore'

export const buildIconSelectionKey = (icon: Pick<DesktopIcon, 'id' | 'source'>): string =>
  `${icon.source}:${icon.id}`

interface IconStore {
  icons: DesktopIcon[]
  loading: boolean
  error: string | null
  iconSize: IconSize
  windowMode: WindowMode
  titleLineCount: TitleLineCount
  dockEnabled: boolean
  selectionMode: boolean
  selectedIconKeys: string[]
  fetchIcons: () => Promise<void>
  launchApp: (path: string) => Promise<void>
  setIconSize: (size: IconSize) => void
  setWindowMode: (mode: WindowMode) => void
  setTitleLineCount: (count: TitleLineCount) => void
  setDockEnabled: (enabled: boolean) => void
  enterSelectionMode: (initialKey?: string) => void
  toggleSelectIcon: (key: string) => void
  clearSelection: () => void
  hideSelectedIcons: () => Promise<void>
  deleteSelectedIcons: () => Promise<void>
  applyWindowMode: (mode: WindowMode) => Promise<void>
  hydrateSettings: () => Promise<void>
}

export const useIconStore = create<IconStore>((set, get) => ({
  icons: [],
  loading: false,
  error: null,
  iconSize: 'medium',
  windowMode: 'fullscreen',
  titleLineCount: 'two',
  dockEnabled: true,
  selectionMode: false,
  selectedIconKeys: [],

  fetchIcons: async () => {
    set({ loading: true, error: null })
    try {
      const { iconSize } = get()
      const iconSizeValue = ICON_SIZE_CONFIG[iconSize].logicalSize
      const customAppDir = (await getSetting('customAppDir')).trim()
      const icons = await invoke<DesktopIcon[]>('get_desktop_icons', {
        iconSize: iconSizeValue,
        customAppDir: customAppDir || null,
      })
      const iconKeySet = new Set(icons.map(icon => buildIconSelectionKey(icon)))
      const { selectedIconKeys, selectionMode } = get()
      const nextSelectedKeys = selectedIconKeys.filter(key => iconKeySet.has(key))
      set({
        icons,
        loading: false,
        selectedIconKeys: nextSelectedKeys,
        selectionMode: selectionMode && nextSelectedKeys.length > 0,
      })
    } catch (e) {
      set({ error: String(e), loading: false })
    }
  },

  launchApp: async (path: string) => {
    try {
      await invoke('launch_app', { path })
      await invoke('toggle_window')
    } catch (e) {
      console.error('Failed to launch app:', e)
    }
  },

  setIconSize: (size: IconSize) => {
    set({ iconSize: size, selectionMode: false, selectedIconKeys: [] })
    void setSetting('iconSize', size).catch((e) => {
      console.error('Failed to persist icon size:', e)
    })
    get().fetchIcons()
  },

  setWindowMode: (mode: WindowMode) => {
    set({ windowMode: mode })
    void setSetting('windowMode', mode).catch((e) => {
      console.error('Failed to persist window mode:', e)
    })
    void get().applyWindowMode(mode)
  },

  setTitleLineCount: (count: TitleLineCount) => {
    set({ titleLineCount: count })
    void setSetting('titleLineCount', count).catch((e) => {
      console.error('Failed to persist title line count:', e)
    })
  },

  setDockEnabled: (enabled: boolean) => {
    set({ dockEnabled: enabled })
    void setSetting('dockEnabled', enabled).catch((e) => {
      console.error('Failed to persist dock enabled state:', e)
    })
  },

  enterSelectionMode: (initialKey?: string) => {
    set(state => {
      if (!initialKey) {
        return { selectionMode: true }
      }
      if (state.selectedIconKeys.includes(initialKey)) {
        return { selectionMode: true }
      }
      return {
        selectionMode: true,
        selectedIconKeys: [...state.selectedIconKeys, initialKey],
      }
    })
  },

  toggleSelectIcon: (key: string) => {
    set(state => {
      if (!state.selectionMode) {
        return {}
      }
      const selected = state.selectedIconKeys.includes(key)
      const nextSelectedKeys = selected
        ? state.selectedIconKeys.filter(currentKey => currentKey !== key)
        : [...state.selectedIconKeys, key]

      return {
        selectedIconKeys: nextSelectedKeys,
        selectionMode: nextSelectedKeys.length > 0,
      }
    })
  },

  clearSelection: () => {
    set({ selectionMode: false, selectedIconKeys: [] })
  },

  hideSelectedIcons: async () => {
    const { selectedIconKeys, icons } = get()
    if (selectedIconKeys.length === 0) return

    const selectedKeySet = new Set(selectedIconKeys)
    const targets: IconMutationTarget[] = icons
      .filter(icon => selectedKeySet.has(buildIconSelectionKey(icon)))
      .map(icon => ({ id: icon.id, source: icon.source }))

    if (targets.length === 0) return

    try {
      await invoke<number>('hide_desktop_icons', { targets })
      set({ selectionMode: false, selectedIconKeys: [] })
      await get().fetchIcons()
    } catch (e) {
      console.error('Failed to hide icons:', e)
    }
  },

  deleteSelectedIcons: async () => {
    const { selectedIconKeys, icons } = get()
    if (selectedIconKeys.length === 0) return

    const selectedKeySet = new Set(selectedIconKeys)
    const targets: IconMutationTarget[] = icons
      .filter(icon => selectedKeySet.has(buildIconSelectionKey(icon)))
      .map(icon => ({ id: icon.id, source: icon.source }))

    if (targets.length === 0) return

    try {
      await invoke<number>('delete_desktop_icons', { targets })
      set({ selectionMode: false, selectedIconKeys: [] })
      await get().fetchIcons()
    } catch (e) {
      console.error('Failed to delete icons:', e)
    }
  },

  applyWindowMode: async (mode: WindowMode) => {
    try {
      if (mode === 'fullscreen') {
        await invoke('set_window_mode', { mode })
      } else {
        const config = WINDOW_SIZE_CONFIG[mode]
        await invoke('set_window_mode', { mode, width: config.width, height: config.height })
      }
    } catch (e) {
      console.error('Failed to set window mode:', e)
    }
  },

  hydrateSettings: async () => {
    const [iconSize, windowMode, titleLineCount, dockEnabled] = await Promise.all([
      getSetting('iconSize'),
      getSetting('windowMode'),
      getSetting('titleLineCount'),
      getSetting('dockEnabled'),
    ])
    const current = get()
    const nextState: Partial<IconStore> = {}

    if (current.iconSize !== iconSize) {
      nextState.iconSize = iconSize
    }
    if (current.windowMode !== windowMode) {
      nextState.windowMode = windowMode
    }
    if (current.titleLineCount !== titleLineCount) {
      nextState.titleLineCount = titleLineCount
    }
    if (current.dockEnabled !== dockEnabled) {
      nextState.dockEnabled = dockEnabled
    }

    if (Object.keys(nextState).length > 0) {
      set(nextState)
    }
  },
}))
