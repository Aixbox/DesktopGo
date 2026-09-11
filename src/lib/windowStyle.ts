import type { WindowStyle } from '@/types'
import { getSetting, setSetting } from '@/lib/settingsStore'

export function applyWindowStyle(_style: WindowStyle = 'default', _persistentEnabled = false) {
  const root = document.documentElement
  root.classList.remove('window-style-native-acrylic', 'window-style-native-mica')
}

export async function getSavedWindowStyle(): Promise<WindowStyle> {
  const style = await getSetting('windowStyle')
  return style === 'default' ? style : 'default'
}

export async function saveWindowStyle(_style: WindowStyle = 'default'): Promise<void> {
  await setSetting('windowStyle', 'default')
}

export async function initWindowStyle(): Promise<void> {
  await getSavedWindowStyle()
  applyWindowStyle()
}
