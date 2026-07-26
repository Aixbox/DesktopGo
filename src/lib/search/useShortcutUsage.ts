import { useCallback, useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import {
  createDefaultShortcutUsageState,
  normalizeShortcutUsageState,
  type ShortcutUsageState,
} from './shortcutUsage'
import {
  clearStoredShortcutUsage,
  loadShortcutUsage,
  recordStoredShortcutLaunch,
  saveShortcutUsageEnabled,
  SHORTCUT_USAGE_CHANGED_EVENT,
} from './shortcutUsageStore'

export function useShortcutUsage() {
  const [state, setState] = useState<ShortcutUsageState>(createDefaultShortcutUsageState)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<unknown>(null)

  const reload = useCallback(async () => {
    try {
      setState(await loadShortcutUsage())
      setLoadError(null)
    } catch (error) {
      setLoadError(error)
      console.error('Failed to load shortcut usage:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let disposed = false
    let detachListener: (() => void) | null = null

    void loadShortcutUsage()
      .then(next => {
        if (disposed) return
        setState(next)
        setLoadError(null)
      })
      .catch(error => {
        if (!disposed) setLoadError(error)
        console.error('Failed to load shortcut usage:', error)
      })
      .finally(() => {
        if (!disposed) setLoading(false)
      })
    void listen<ShortcutUsageState>(SHORTCUT_USAGE_CHANGED_EVENT, event => {
      if (!disposed) setState(normalizeShortcutUsageState(event.payload))
    })
      .then(unlisten => {
        if (disposed) unlisten()
        else detachListener = unlisten
      })
      .catch(error => {
        if (!disposed) setLoadError(error)
        console.error('Failed to listen for shortcut usage changes:', error)
      })

    const handleFocus = () => void reload()
    window.addEventListener('focus', handleFocus)
    return () => {
      disposed = true
      window.removeEventListener('focus', handleFocus)
      detachListener?.()
    }
  }, [reload])

  const recordLaunch = useCallback(async (shortcutId: string) => {
    try {
      setState(await recordStoredShortcutLaunch(shortcutId))
    } catch (error) {
      console.error('Failed to record shortcut launch:', error)
    }
  }, [])

  const setEnabled = useCallback(async (enabled: boolean) => {
    const next = await saveShortcutUsageEnabled(enabled)
    setState(next)
  }, [])

  const clear = useCallback(async () => {
    const next = await clearStoredShortcutUsage()
    setState(next)
  }, [])

  return { state, loading, loadError, reload, recordLaunch, setEnabled, clear }
}
