import type { ThemeMode } from '@/types'
import { getSetting, setSetting } from '@/lib/settingsStore'
import { planThemeSyncOnSystemPreferenceChange } from './themePolicy'

export const THEME_MODE_SYNC_EVENT = 'desktopgo:theme-mode-sync'
export { planThemeSyncOnSystemPreferenceChange } from './themePolicy'

function emitThemeModeSync(mode: ThemeMode) {
  window.dispatchEvent(
    new CustomEvent(THEME_MODE_SYNC_EVENT, {
      detail: { mode },
    })
  )
}

/**
 * 根据 ThemeMode 设置应用到 <html> 元素上的 dark class
 */
export function applyTheme(mode: ThemeMode) {
  const effectiveMode = mode
  const root = document.documentElement

  if (effectiveMode === 'dark') {
    root.classList.add('dark')
  } else if (effectiveMode === 'light') {
    root.classList.remove('dark')
  } else {
    // system: 跟随系统偏好
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    if (prefersDark) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }
}

/**
 * 从 plugin-store 读取保存的主题模式
 */
export async function getSavedTheme(): Promise<ThemeMode> {
  return getSetting('themeMode')
}

export async function saveTheme(mode: ThemeMode): Promise<void> {
  await setSetting('themeMode', mode)
}

/**
 * 初始化主题，并设置系统主题变化监听
 */
export async function initTheme(): Promise<() => void> {
  const mode = await getSavedTheme()
  applyTheme(mode)

  // 监听系统主题偏好变化。
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  const handleChange = () => {
    void (async () => {
      const currentMode = await getSavedTheme()
      const plan = planThemeSyncOnSystemPreferenceChange(currentMode, 'default', mediaQuery.matches)

      if (!plan) {
        return
      }

      if (plan.saveMode && currentMode !== plan.saveMode) {
        await saveTheme(plan.saveMode)
      }

      applyTheme(plan.applyMode)
      emitThemeModeSync(plan.emitMode)
    })().catch(e => {
      console.error('Failed to sync system theme change:', e)
    })
  }
  mediaQuery.addEventListener('change', handleChange)

  return () => mediaQuery.removeEventListener('change', handleChange)
}
