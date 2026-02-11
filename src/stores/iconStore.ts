import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import type { DesktopIcon, IconSize, TitleLineCount, WindowMode } from '../types'
import { ICON_SIZE_CONFIG, WINDOW_SIZE_CONFIG } from '../types'

interface IconStore {
  icons: DesktopIcon[]
  loading: boolean
  error: string | null
  iconSize: IconSize
  windowMode: WindowMode
  titleLineCount: TitleLineCount
  fetchIcons: () => Promise<void>
  launchApp: (path: string) => Promise<void>
  setIconSize: (size: IconSize) => void
  setWindowMode: (mode: WindowMode) => void
  setTitleLineCount: (count: TitleLineCount) => void
  applyWindowMode: (mode: WindowMode) => Promise<void>
}

const getSavedIconSize = (): IconSize => {
  const saved = localStorage.getItem('iconSize')
  if (saved === 'large' || saved === 'medium' || saved === 'small') return saved
  return 'medium'
}

const getSavedWindowMode = (): WindowMode => {
  const saved = localStorage.getItem('windowMode')
  if (saved === 'fullscreen' || saved === 'large' || saved === 'medium' || saved === 'small') return saved
  return 'fullscreen'
}

const getSavedTitleLineCount = (): TitleLineCount => {
  const saved = localStorage.getItem('titleLineCount')
  if (saved === 'one' || saved === 'two') return saved
  return 'two'
}

export const useIconStore = create<IconStore>((set, get) => ({
  icons: [],
  loading: false,
  error: null,
  iconSize: getSavedIconSize(),
  windowMode: getSavedWindowMode(),
  titleLineCount: getSavedTitleLineCount(),

  fetchIcons: async () => {
    set({ loading: true, error: null })
    try {
      const { iconSize } = get()
      const iconSizeValue = ICON_SIZE_CONFIG[iconSize].logicalSize
      const icons = await invoke<DesktopIcon[]>('get_desktop_icons', { iconSize: iconSizeValue })
      set({ icons, loading: false })
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
    localStorage.setItem('iconSize', size)
    set({ iconSize: size })
    get().fetchIcons()
  },

  setWindowMode: (mode: WindowMode) => {
    localStorage.setItem('windowMode', mode)
    set({ windowMode: mode })
    get().applyWindowMode(mode)
  },

  setTitleLineCount: (count: TitleLineCount) => {
    localStorage.setItem('titleLineCount', count)
    set({ titleLineCount: count })
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
}))
