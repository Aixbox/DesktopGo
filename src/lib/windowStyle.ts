import type { WindowStyle } from '@/types'
import { getSetting, setSetting } from '@/lib/settingsStore'

const NATIVE_ACRYLIC_CLASS = 'window-style-native-acrylic'

export function applyWindowStyle(style: WindowStyle) {
  const root = document.documentElement
  root.classList.toggle(NATIVE_ACRYLIC_CLASS, style === 'nativeAcrylic')
}

export async function getSavedWindowStyle(): Promise<WindowStyle> {
  return getSetting('windowStyle')
}

export async function saveWindowStyle(style: WindowStyle): Promise<void> {
  await setSetting('windowStyle', style)
}

export async function initWindowStyle(): Promise<void> {
  const style = await getSavedWindowStyle()
  applyWindowStyle(style)
}
