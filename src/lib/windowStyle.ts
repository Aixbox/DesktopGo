import type { WindowStyle } from '@/types'
import { getSetting, setSetting } from '@/lib/settingsStore'

const NATIVE_ACRYLIC_CLASS = 'window-style-native-acrylic'
const NATIVE_MICA_CLASS = 'window-style-native-mica'

export function applyWindowStyle(style: WindowStyle, persistentEnabled = false) {
  const root = document.documentElement
  const useNativeAcrylic = style === 'nativeAcrylic' && !persistentEnabled
  const useNativeMica = style === 'nativeAcrylic' && persistentEnabled

  root.classList.toggle(NATIVE_ACRYLIC_CLASS, useNativeAcrylic)
  root.classList.toggle(NATIVE_MICA_CLASS, useNativeMica)
}

export async function getSavedWindowStyle(): Promise<WindowStyle> {
  return getSetting('windowStyle')
}

export async function saveWindowStyle(style: WindowStyle): Promise<void> {
  await setSetting('windowStyle', style)
}

export async function initWindowStyle(): Promise<void> {
  const [style, persistentEnabled] = await Promise.all([
    getSavedWindowStyle(),
    getSetting('windowPersistent'),
  ])
  applyWindowStyle(style, persistentEnabled)
}
