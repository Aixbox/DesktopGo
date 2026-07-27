import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { invoke } from '@tauri-apps/api/core'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window'
import { translate } from '@/lib/i18n'
import { getSetting } from '@/lib/settingsStore'
import { applyTheme, getSavedTheme } from '@/lib/theme'
import {
  MAIN_WINDOW_APPEARANCE_SYNC_EVENT,
  SETTINGS_RETURNED_TO_MAIN_EVENT,
  WINDOW_PERSISTENT_SYNC_EVENT,
  type MainWindowAppearanceSyncPayload,
  type WindowPersistentSyncPayload,
} from '@/lib/windowPersistent'
import { applyWindowStyle, getSavedWindowStyle } from '@/lib/windowStyle'
import { LAUNCHPAD_LAYOUT_RESET_EVENT } from '@/components/icon-grid/services/layoutStore'
import { useToast } from '@/components/ui/toast'
import { useIconStore } from '@/stores/iconStore'

const LAUNCHPAD_SHOWN_EVENT = 'launchpad:shown'
const SETTINGS_WINDOW_WIDTH = 800
const SETTINGS_WINDOW_HEIGHT = 600
const EXTERNAL_SHOW_CLICK_GUARD_MS = 350

const waitForWindowGeometrySync = async () => {
  await new Promise<void>(resolve => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      window.clearTimeout(timeoutId)
      resolve()
    }
    const timeoutId = window.setTimeout(finish, 50)
    window.requestAnimationFrame(() => window.requestAnimationFrame(finish))
  })
}

async function ensureSettingsWindowMinSize(settingsWindow: WebviewWindow) {
  const minSize = new LogicalSize(SETTINGS_WINDOW_WIDTH, SETTINGS_WINDOW_HEIGHT)
  await settingsWindow.setMinSize(minSize)
  const currentSize = await settingsWindow.innerSize()
  if (currentSize.width < SETTINGS_WINDOW_WIDTH || currentSize.height < SETTINGS_WINDOW_HEIGHT) {
    await settingsWindow.setSize(minSize)
  }
}

async function waitForSettingsWindowDisposed() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!(await WebviewWindow.getByLabel('settings'))) return
    await new Promise(resolve => window.setTimeout(resolve, 25))
  }
}

interface UseLaunchpadWindowControllerParams {
  fetchIcons: () => Promise<void>
  hydrateSettings: () => Promise<void>
  reloadSearchSettings: () => Promise<void>
  searchInputRef: MutableRefObject<HTMLInputElement | null>
  setLayoutResetToken: (update: (current: number) => number) => void
  preloadGridView: (mode: 'paged' | 'scroll') => void
}

export function useLaunchpadWindowController({
  fetchIcons,
  hydrateSettings,
  reloadSearchSettings,
  searchInputRef,
  setLayoutResetToken,
  preloadGridView,
}: UseLaunchpadWindowControllerParams) {
  const toast = useToast()
  const launchpadSurfaceRef = useRef<HTMLDivElement | null>(null)
  const bypassNextFocusGuardRef = useRef(false)
  const suppressBackgroundClickUntilRef = useRef(0)
  const [windowPersistentEnabled, setWindowPersistentEnabled] = useState(false)
  const [mainWindowAlwaysOnTopEnabled, setMainWindowAlwaysOnTopEnabled] = useState(false)

  const syncWindowPersistentState = useCallback(async () => {
    try {
      setWindowPersistentEnabled(await getSetting('windowPersistent'))
    } catch (error) {
      console.error('Failed to sync window persistent state:', error)
    }
  }, [])

  const syncMainWindowAlwaysOnTopState = useCallback(async () => {
    try {
      setMainWindowAlwaysOnTopEnabled(
        await invoke<boolean>('get_main_window_always_on_top_enabled')
      )
    } catch (error) {
      console.error('Failed to sync launchpad always-on-top state:', error)
    }
  }, [])

  const syncWindowAppearance = useCallback(async () => {
    try {
      const [savedWindowStyle, persistentEnabled, savedTheme] = await Promise.all([
        getSavedWindowStyle(),
        getSetting('windowPersistent'),
        getSavedTheme(),
      ])
      setWindowPersistentEnabled(persistentEnabled)
      applyTheme(savedTheme, savedWindowStyle)
      applyWindowStyle(savedWindowStyle, persistentEnabled)
    } catch (error) {
      console.error('Failed to sync launchpad appearance:', error)
    }
  }, [])

  const syncExternalState = useCallback(async () => {
    try {
      const state = useIconStore.getState()
      state.clearSelection()
      await state.hydrateSettings()
      await state.fetchIcons()
      await syncWindowPersistentState()
      await syncMainWindowAlwaysOnTopState()
      await reloadSearchSettings()
      await syncWindowAppearance()
    } catch (error) {
      console.error('Failed to sync launchpad state:', error)
    }
  }, [
    reloadSearchSettings,
    syncMainWindowAlwaysOnTopState,
    syncWindowAppearance,
    syncWindowPersistentState,
  ])

  useEffect(() => {
    void (async () => {
      try {
        await hydrateSettings()
        const { windowMode, launchpadGridViewMode, applyWindowMode } = useIconStore.getState()
        preloadGridView(launchpadGridViewMode)
        await applyWindowMode(windowMode)
        await waitForWindowGeometrySync()
        await fetchIcons()
        await syncWindowPersistentState()
        await syncMainWindowAlwaysOnTopState()
        await syncWindowAppearance()
      } catch (error) {
        console.error('Failed to initialize launchpad settings:', error)
      } finally {
        void invoke('notify_main_window_ready').catch(error => {
          console.error('Failed to notify launchpad readiness:', error)
        })
      }
    })()
  }, [
    fetchIcons,
    hydrateSettings,
    preloadGridView,
    syncMainWindowAlwaysOnTopState,
    syncWindowAppearance,
    syncWindowPersistentState,
  ])

  const applyLaunchpadOpenFocus = useCallback(async () => {
    try {
      const target = await getSetting('launchpadOpenFocusTarget')
      window.requestAnimationFrame(() => {
        if (target === 'search') {
          searchInputRef.current?.focus({ preventScroll: true })
          return
        }
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
        launchpadSurfaceRef.current?.focus({ preventScroll: true })
      })
    } catch (error) {
      console.error('Failed to apply launchpad open focus target:', error)
    }
  }, [searchInputRef])

  useEffect(() => {
    const unlisten = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (!focused) return
      if (bypassNextFocusGuardRef.current) {
        bypassNextFocusGuardRef.current = false
        suppressBackgroundClickUntilRef.current = 0
      } else {
        suppressBackgroundClickUntilRef.current = performance.now() + EXTERNAL_SHOW_CLICK_GUARD_MS
      }
      void syncExternalState()
    })
    return () => {
      unlisten.then(fn => fn())
    }
  }, [syncExternalState])

  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | null = null
    void getCurrentWindow()
      .listen<MainWindowAppearanceSyncPayload>(MAIN_WINDOW_APPEARANCE_SYNC_EVENT, event => {
        const nextAppearance: Partial<{ iconCornerRadius: number; iconOpacity: number }> = {}
        if (typeof event.payload?.iconCornerRadius === 'number') {
          nextAppearance.iconCornerRadius = event.payload.iconCornerRadius
        }
        if (typeof event.payload?.iconOpacity === 'number') {
          nextAppearance.iconOpacity = event.payload.iconOpacity
        }
        if (Object.keys(nextAppearance).length > 0) useIconStore.setState(nextAppearance)
        void syncWindowAppearance()
      })
      .then(fn => {
        if (disposed) fn()
        else unlisten = fn
      })
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [syncWindowAppearance])

  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | null = null
    void getCurrentWindow()
      .listen(LAUNCHPAD_SHOWN_EVENT, () => void applyLaunchpadOpenFocus())
      .then(fn => {
        if (disposed) fn()
        else unlisten = fn
      })
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [applyLaunchpadOpenFocus])

  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | null = null
    void getCurrentWindow()
      .listen<WindowPersistentSyncPayload>(WINDOW_PERSISTENT_SYNC_EVENT, event => {
        const enabled = Boolean(event.payload?.enabled)
        setWindowPersistentEnabled(enabled)
        void getSavedWindowStyle()
          .then(style => applyWindowStyle(style, enabled))
          .catch(error => {
            console.error('Failed to sync launchpad window style after persistent change:', error)
          })
        if (!enabled) bypassNextFocusGuardRef.current = true
      })
      .then(fn => {
        if (disposed) fn()
        else unlisten = fn
      })
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])

  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | null = null
    void getCurrentWindow()
      .listen(SETTINGS_RETURNED_TO_MAIN_EVENT, () => {
        bypassNextFocusGuardRef.current = true
        suppressBackgroundClickUntilRef.current = 0
      })
      .then(fn => {
        if (disposed) fn()
        else unlisten = fn
      })
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])

  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | null = null
    void getCurrentWindow()
      .listen(LAUNCHPAD_LAYOUT_RESET_EVENT, () => {
        setLayoutResetToken(current => current + 1)
        void syncExternalState()
      })
      .then(fn => {
        if (disposed) fn()
        else unlisten = fn
      })
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [setLayoutResetToken, syncExternalState])

  const requestCloseLaunchpad = useCallback(() => {
    void invoke('toggle_window').catch(error => {
      console.error('Failed to hide launchpad window:', error)
    })
  }, [])

  const handleMinimizeWindow = useCallback(() => {
    void getCurrentWindow()
      .minimize()
      .catch(error => console.error('Failed to minimize launchpad window:', error))
  }, [])

  const handleToggleAlwaysOnTop = useCallback(() => {
    const nextEnabled = !mainWindowAlwaysOnTopEnabled
    void invoke<boolean>('set_main_window_always_on_top_enabled', { enabled: nextEnabled })
      .then(setMainWindowAlwaysOnTopEnabled)
      .catch(error => {
        console.error('Failed to update launchpad always-on-top state:', error)
      })
  }, [mainWindowAlwaysOnTopEnabled])

  const handleWindowTopDragStart = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    const target = event.target
    const element =
      target instanceof Element ? target : target instanceof Node ? target.parentElement : null
    if (
      element?.closest(
        'button, a, input, textarea, select, [role="button"], [data-no-window-drag="true"]'
      )
    ) {
      return
    }
    event.stopPropagation()
    void getCurrentWindow()
      .startDragging()
      .catch(error => console.error('Failed to start dragging launchpad window:', error))
  }

  const openSettings = async () => {
    const existing = await WebviewWindow.getByLabel('settings')
    if (existing) {
      await existing.destroy().catch(error => {
        console.error('Failed to dispose existing settings window:', error)
      })
      await waitForSettingsWindowDisposed()
    }
    const settingsWindow = new WebviewWindow('settings', {
      url: 'index.html?page=settings&returnToMain=1',
      title: translate('设置'),
      width: SETTINGS_WINDOW_WIDTH,
      height: SETTINGS_WINDOW_HEIGHT,
      minWidth: SETTINGS_WINDOW_WIDTH,
      minHeight: SETTINGS_WINDOW_HEIGHT,
      center: true,
      resizable: true,
      decorations: false,
      shadow: true,
      visible: false,
    })
    settingsWindow.once('tauri://created', async () => {
      await ensureSettingsWindowMinSize(settingsWindow)
      await invoke('activate_settings_window')
    })
    settingsWindow.once('tauri://error', error => {
      console.error('Failed to create settings window:', error)
      toast.error(translate('无法打开设置窗口，请重试。'), {
        key: 'settings-window',
        title: translate('设置'),
      })
    })
  }

  return {
    handleMinimizeWindow,
    handleToggleAlwaysOnTop,
    handleWindowTopDragStart,
    isBackgroundCloseSuppressed: () => performance.now() < suppressBackgroundClickUntilRef.current,
    launchpadSurfaceRef,
    mainWindowAlwaysOnTopEnabled,
    openSettings,
    requestCloseLaunchpad,
    windowPersistentEnabled,
  }
}
