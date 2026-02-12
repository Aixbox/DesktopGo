import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import type { DesktopIcon, IconSize, TitleLineCount, WindowMode } from '../types'
import { ICON_SIZE_CONFIG, WINDOW_SIZE_CONFIG } from '../types'
import { getSetting, setSetting, syncLegacySettingsFromLocalStorage } from '../lib/settingsStore'

interface IconStore {
  icons: DesktopIcon[]
  loading: boolean
  error: string | null
  iconSize: IconSize
  windowMode: WindowMode
  titleLineCount: TitleLineCount
  selectionMode: boolean
  selectedIconIds: string[]
  fetchIcons: () => Promise<void>
  launchApp: (path: string) => Promise<void>
  setIconSize: (size: IconSize) => void
  setWindowMode: (mode: WindowMode) => void
  setTitleLineCount: (count: TitleLineCount) => void
  enterSelectionMode: (initialId?: string) => void
  toggleSelectIcon: (id: string) => void
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
  selectionMode: false,
  selectedIconIds: [],

  fetchIcons: async () => {
    set({ loading: true, error: null })
    try {
      const { iconSize } = get()
      const iconSizeValue = ICON_SIZE_CONFIG[iconSize].logicalSize
      const icons = await invoke<DesktopIcon[]>('get_desktop_icons', { iconSize: iconSizeValue })
      const iconIdSet = new Set(icons.map(icon => icon.id))
      const { selectedIconIds, selectionMode } = get()
      const nextSelectedIds = selectedIconIds.filter(id => iconIdSet.has(id))
      set({
        icons,
        loading: false,
        selectedIconIds: nextSelectedIds,
        selectionMode: selectionMode && nextSelectedIds.length > 0,
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
    set({ iconSize: size, selectionMode: false, selectedIconIds: [] })
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

  enterSelectionMode: (initialId?: string) => {
    set(state => {
      if (!initialId) {
        return { selectionMode: true }
      }
      if (state.selectedIconIds.includes(initialId)) {
        return { selectionMode: true }
      }
      return {
        selectionMode: true,
        selectedIconIds: [...state.selectedIconIds, initialId],
      }
    })
  },

  toggleSelectIcon: (id: string) => {
    set(state => {
      if (!state.selectionMode) {
        return {}
      }
      const selected = state.selectedIconIds.includes(id)
      const nextSelectedIds = selected
        ? state.selectedIconIds.filter(currentId => currentId !== id)
        : [...state.selectedIconIds, id]

      return {
        selectedIconIds: nextSelectedIds,
        selectionMode: nextSelectedIds.length > 0,
      }
    })
  },

  clearSelection: () => {
    set({ selectionMode: false, selectedIconIds: [] })
  },

  hideSelectedIcons: async () => {
    const ids = get().selectedIconIds
    if (ids.length === 0) return
    try {
      await invoke<number>('hide_desktop_icons', { ids })
      set({ selectionMode: false, selectedIconIds: [] })
      await get().fetchIcons()
    } catch (e) {
      console.error('Failed to hide icons:', e)
    }
  },

  deleteSelectedIcons: async () => {
    const ids = get().selectedIconIds
    if (ids.length === 0) return
    try {
      await invoke<number>('delete_desktop_icons', { ids })
      set({ selectionMode: false, selectedIconIds: [] })
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
    await syncLegacySettingsFromLocalStorage()
    const [iconSize, windowMode, titleLineCount] = await Promise.all([
      getSetting('iconSize'),
      getSetting('windowMode'),
      getSetting('titleLineCount'),
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

    if (Object.keys(nextState).length > 0) {
      set(nextState)
    }
  },
}))
