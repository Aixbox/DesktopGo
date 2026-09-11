import type { ThemeMode } from '../types'

export type ThemeSyncPlan = {
  applyMode: ThemeMode
  emitMode: ThemeMode
  saveMode: ThemeMode | null
} | null

/**
 * 默认风格只在 system 模式下跟随系统。
 */
export function planThemeSyncOnSystemPreferenceChange(
  currentMode: ThemeMode,
  _windowStyle: 'default',
  systemPrefersDark: boolean
): ThemeSyncPlan {
  void systemPrefersDark

  if (currentMode === 'system') {
    return {
      applyMode: 'system',
      emitMode: 'system',
      saveMode: null,
    }
  }

  return null
}
