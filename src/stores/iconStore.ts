import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import type { DesktopIcon } from '../types'

interface IconStore {
  icons: DesktopIcon[]
  loading: boolean
  error: string | null
  fetchIcons: () => Promise<void>
  launchApp: (path: string) => Promise<void>
}

export const useIconStore = create<IconStore>(set => ({
  icons: [],
  loading: false,
  error: null,

  fetchIcons: async () => {
    set({ loading: true, error: null })
    try {
      const icons = await invoke<DesktopIcon[]>('get_desktop_icons')
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
}))
