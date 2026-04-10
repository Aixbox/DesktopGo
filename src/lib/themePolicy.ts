import type { ThemeMode, WindowStyle } from '../types'

export type ThemeSyncPlan = {
  applyMode: ThemeMode
  emitMode: ThemeMode
  saveMode: ThemeMode | null
  refreshNativeAcrylic: boolean
} | null

export function resolveEffectiveThemeMode(
  mode: ThemeMode,
  _windowStyle: WindowStyle = 'default'
): ThemeMode {
  return mode
}

/**
 * 默认风格只在 system 模式下跟随系统。
 * nativeAcrylic 由于会被 Windows 的系统主题直接影响，因此系统主题变化时，
 * 应用主题也必须同步到当前系统深浅色，否则会出现“亚克力变了但组件没变”。
 */
export function planThemeSyncOnSystemPreferenceChange(
  currentMode: ThemeMode,
  windowStyle: WindowStyle,
  systemPrefersDark: boolean
): ThemeSyncPlan {
  const systemMode: ThemeMode = systemPrefersDark ? 'dark' : 'light'

  if (windowStyle === 'nativeAcrylic') {
    return {
      applyMode: systemMode,
      emitMode: systemMode,
      saveMode: systemMode,
      refreshNativeAcrylic: true,
    }
  }

  if (currentMode === 'system') {
    return {
      applyMode: 'system',
      emitMode: 'system',
      saveMode: null,
      refreshNativeAcrylic: false,
    }
  }

  return null
}
