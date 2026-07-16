import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import type {
  DesktopIcon,
  IconContextMenuMode,
  IconMutationTarget,
  IconSize,
  LaunchpadGridViewMode,
  TitleLineCount,
  WindowMode,
} from '../types'
import { ICON_SIZE_CONFIG, WINDOW_SIZE_CONFIG } from '../types'
import { shouldRefreshAfterShellMenuVerb } from '../lib/shellContextMenu'
import { getSetting, setSetting } from '../lib/settingsStore'
import { loadCustomNames, saveCustomNames } from '../lib/customNamesStore'
import { buildIconSelectionKey } from '../lib/iconKey'

export { buildIconSelectionKey }

const resolveSelectableIconKeySet = (icons: DesktopIcon[]) =>
  new Set(icons.map(icon => buildIconSelectionKey(icon)))

interface IconStore {
  icons: DesktopIcon[]
  loading: boolean
  error: string | null
  iconSize: IconSize
  windowMode: WindowMode
  titleLineCount: TitleLineCount
  launchpadGridViewMode: LaunchpadGridViewMode
  dockEnabled: boolean
  iconContextMenuMode: IconContextMenuMode
  selectionMode: boolean
  selectedIconKeys: string[]
  customNames: Record<string, string>
  renameTriggerPath: string | null
  fetchIcons: () => Promise<void>
  launchApp: (path: string) => Promise<void>
  setIconSize: (size: IconSize) => void
  setWindowMode: (mode: WindowMode) => void
  setTitleLineCount: (count: TitleLineCount) => void
  setLaunchpadGridViewMode: (mode: LaunchpadGridViewMode) => void
  setDockEnabled: (enabled: boolean) => void
  setIconContextMenuMode: (mode: IconContextMenuMode) => void
  enterSelectionMode: (initialKey?: string) => void
  toggleSelectIcon: (key: string) => void
  unselectIcons: (keys: string[]) => void
  clearSelection: () => void
  hideSelectedIcons: () => Promise<void>
  hideIcon: (icon: DesktopIcon) => Promise<void>
  deleteSelectedIcons: () => Promise<void>
  showShellContextMenu: (icon: DesktopIcon) => Promise<void>
  applyWindowMode: (mode: WindowMode) => Promise<void>
  hydrateSettings: () => Promise<void>
  setCustomName: (path: string, name: string) => void
  clearCustomName: (path: string) => void
  clearRenameTrigger: () => void
  requestIconRename: (path: string) => void
  setSelectedIconKeys: (keys: string[]) => void
}

export const useIconStore = create<IconStore>((set, get) => ({
  icons: [],
  loading: false,
  error: null,
  iconSize: 'medium',
  windowMode: 'medium',
  titleLineCount: 'two',
  launchpadGridViewMode: 'paged',
  dockEnabled: true,
  iconContextMenuMode: 'custom',
  selectionMode: false,
  selectedIconKeys: [],
  customNames: {},
  renameTriggerPath: null,

  fetchIcons: async () => {
    if (get().icons.length === 0) {
      set({ loading: true, error: null })
    }
    try {
      const { iconSize } = get()
      const iconSizeValue = ICON_SIZE_CONFIG[iconSize].logicalSize
      const icons = await invoke<DesktopIcon[]>('get_icons', {
        iconSize: iconSizeValue,
      })
      const iconKeySet = new Set(icons.map(icon => buildIconSelectionKey(icon)))
      const { selectedIconKeys, selectionMode } = get()
      const nextSelectedKeys = selectedIconKeys.filter(key => iconKeySet.has(key))
      set({
        icons,
        loading: false,
        selectedIconKeys: nextSelectedKeys,
        selectionMode,
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
    void setSetting('iconSize', size).catch(e => {
      console.error('Failed to persist icon size:', e)
    })
    get().fetchIcons()
  },

  setWindowMode: (mode: WindowMode) => {
    set({ windowMode: mode })
    void setSetting('windowMode', mode).catch(e => {
      console.error('Failed to persist window mode:', e)
    })
    void get().applyWindowMode(mode)
  },

  setTitleLineCount: (count: TitleLineCount) => {
    set({ titleLineCount: count })
    void setSetting('titleLineCount', count).catch(e => {
      console.error('Failed to persist title line count:', e)
    })
  },

  setLaunchpadGridViewMode: (mode: LaunchpadGridViewMode) => {
    set({ launchpadGridViewMode: mode, selectionMode: false, selectedIconKeys: [] })
    void setSetting('launchpadGridViewMode', mode).catch(e => {
      console.error('Failed to persist launchpad grid view mode:', e)
    })
  },

  setDockEnabled: (enabled: boolean) => {
    set({ dockEnabled: enabled })
    void setSetting('dockEnabled', enabled).catch(e => {
      console.error('Failed to persist dock enabled state:', e)
    })
  },

  setIconContextMenuMode: (mode: IconContextMenuMode) => {
    set({ iconContextMenuMode: mode })
    void setSetting('iconContextMenuMode', mode).catch(e => {
      console.error('Failed to persist icon context menu mode:', e)
    })
  },

  enterSelectionMode: (initialKey?: string) => {
    set(state => {
      const selectableKeySet = resolveSelectableIconKeySet(state.icons)
      const selectedIconKeys = state.selectedIconKeys.filter(key => selectableKeySet.has(key))
      if (!initialKey) {
        return { selectionMode: true, selectedIconKeys }
      }
      if (!selectableKeySet.has(initialKey)) {
        return { selectionMode: true, selectedIconKeys }
      }
      if (selectedIconKeys.includes(initialKey)) {
        return { selectionMode: true, selectedIconKeys }
      }
      return {
        selectionMode: true,
        selectedIconKeys: [...selectedIconKeys, initialKey],
      }
    })
  },

  toggleSelectIcon: (key: string) => {
    set(state => {
      if (!state.selectionMode) {
        return {}
      }
      const selectableKeySet = resolveSelectableIconKeySet(state.icons)
      const selectedIconKeys = state.selectedIconKeys.filter(currentKey =>
        selectableKeySet.has(currentKey)
      )
      if (!selectableKeySet.has(key)) {
        return {
          selectedIconKeys,
        }
      }
      const selected = selectedIconKeys.includes(key)
      const nextSelectedKeys = selected
        ? selectedIconKeys.filter(currentKey => currentKey !== key)
        : [...selectedIconKeys, key]

      return {
        selectedIconKeys: nextSelectedKeys,
      }
    })
  },

  unselectIcons: (keys: string[]) => {
    if (keys.length === 0) return
    const keySet = new Set(keys)
    set(state => {
      const nextSelectedKeys = state.selectedIconKeys.filter(currentKey => !keySet.has(currentKey))
      return {
        selectedIconKeys: nextSelectedKeys,
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
      .map(icon => ({ id: icon.id }))

    if (targets.length === 0) return

    try {
      await invoke<number>('hide_icons', { targets })
      set({ selectionMode: false, selectedIconKeys: [] })
      await get().fetchIcons()
    } catch (e) {
      console.error('Failed to hide icons:', e)
    }
  },

  hideIcon: async (icon: DesktopIcon) => {
    try {
      await invoke<number>('hide_icons', { targets: [{ id: icon.id }] })
      set(state => ({
        selectedIconKeys: state.selectedIconKeys.filter(key => key !== buildIconSelectionKey(icon)),
      }))
      await get().fetchIcons()
    } catch (e) {
      console.error('Failed to hide icon:', e)
    }
  },

  deleteSelectedIcons: async () => {
    const { selectedIconKeys, icons } = get()
    if (selectedIconKeys.length === 0) return

    const selectedKeySet = new Set(selectedIconKeys)
    const targets: IconMutationTarget[] = icons
      .filter(icon => selectedKeySet.has(buildIconSelectionKey(icon)))
      .map(icon => ({ id: icon.id }))

    if (targets.length === 0) return

    try {
      await invoke<number>('delete_icons', { targets })
      set({ selectionMode: false, selectedIconKeys: [] })
      await get().fetchIcons()
    } catch (e) {
      console.error('Failed to delete icons:', e)
    }
  },

  showShellContextMenu: async (icon: DesktopIcon) => {
    try {
      const selectedVerb = await invoke<string | null>('show_shell_context_menu', {
        path: icon.path,
      })
      if (selectedVerb === null) {
        return
      }
      if (selectedVerb.toLowerCase() === 'rename') {
        set({ renameTriggerPath: icon.path })
        return
      }
      if (!shouldRefreshAfterShellMenuVerb(selectedVerb)) {
        return
      }

      await get().fetchIcons()
    } catch (e) {
      console.error('显示 Windows Shell 右键菜单失败：', e)
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
    const [
      iconSize,
      windowMode,
      titleLineCount,
      launchpadGridViewMode,
      dockEnabled,
      iconContextMenuMode,
      customNames,
    ] = await Promise.all([
      getSetting('iconSize'),
      getSetting('windowMode'),
      getSetting('titleLineCount'),
      getSetting('launchpadGridViewMode'),
      getSetting('dockEnabled'),
      getSetting('iconContextMenuMode'),
      loadCustomNames(),
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
    if (current.launchpadGridViewMode !== launchpadGridViewMode) {
      nextState.launchpadGridViewMode = launchpadGridViewMode
    }
    if (current.dockEnabled !== dockEnabled) {
      nextState.dockEnabled = dockEnabled
    }
    if (current.iconContextMenuMode !== iconContextMenuMode) {
      nextState.iconContextMenuMode = iconContextMenuMode
    }
    nextState.customNames = customNames

    if (Object.keys(nextState).length > 0) {
      set(nextState)
    }
  },

  setCustomName: (path: string, name: string) => {
    const trimmed = name.trim()
    set(state => {
      const next = { ...state.customNames }
      if (trimmed.length === 0) {
        delete next[path]
      } else {
        next[path] = trimmed
      }
      void saveCustomNames(next).catch(e => {
        console.error('Failed to persist custom names:', e)
      })
      return { customNames: next }
    })
  },

  clearCustomName: (path: string) => {
    set(state => {
      if (!(path in state.customNames)) return {}
      const next = { ...state.customNames }
      delete next[path]
      void saveCustomNames(next).catch(e => {
        console.error('Failed to persist custom names:', e)
      })
      return { customNames: next }
    })
  },

  clearRenameTrigger: () => {
    set({ renameTriggerPath: null })
  },

  requestIconRename: (path: string) => {
    set({ renameTriggerPath: path })
  },

  setSelectedIconKeys: (keys: string[]) => {
    set(state => {
      if (!state.selectionMode) return {}
      const selectableKeySet = resolveSelectableIconKeySet(state.icons)
      const seen = new Set<string>()
      const nextSelectedKeys: string[] = []
      for (const key of keys) {
        if (!selectableKeySet.has(key) || seen.has(key)) continue
        seen.add(key)
        nextSelectedKeys.push(key)
      }
      if (
        nextSelectedKeys.length === state.selectedIconKeys.length &&
        nextSelectedKeys.every((k, i) => k === state.selectedIconKeys[i])
      ) {
        return {}
      }
      return { selectedIconKeys: nextSelectedKeys }
    })
  },
}))
