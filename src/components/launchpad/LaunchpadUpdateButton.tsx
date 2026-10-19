import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { RefreshCw } from 'lucide-react'
import { translate } from '@/lib/i18n'
import { APP_UPDATE_AVAILABLE_EVENT, type AppUpdateAvailablePayload } from '@/lib/updater'

export function LaunchpadUpdateButton() {
  const [hasUpdate, setHasUpdate] = useState(false)

  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | null = null

    console.log('LaunchpadUpdateButton: Initializing...')

    // 监听更新可用事件
    void getCurrentWindow()
      .listen<AppUpdateAvailablePayload>(APP_UPDATE_AVAILABLE_EVENT, () => {
        console.log('LaunchpadUpdateButton: Received update available event')
        if (!disposed) {
          setHasUpdate(true)
        }
      })
      .then(fn => {
        if (disposed) {
          fn()
          return
        }
        unlisten = fn
        console.log('LaunchpadUpdateButton: Event listener registered')
      })

    // 启动时检查是否有持久化的更新信息
    void invoke('check_persisted_update')
      .then((available: unknown) => {
        console.log('LaunchpadUpdateButton: check_persisted_update result:', available)
        if (!disposed && available === true) {
          setHasUpdate(true)
        }
      })
      .catch(error => {
        console.warn('LaunchpadUpdateButton: check_persisted_update failed:', error)
      })

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])

  if (!hasUpdate) {
    return null
  }

  const handleClick = async () => {
    console.log('Update button clicked, opening settings window...')
    console.log('Window before invoke:', window)

    try {
      await invoke('create_settings_window', {
        returnToMain: true,
        tab: 'update',
      })
      await invoke('activate_settings_window')
      console.log('Settings window created/shown successfully')
    } catch (error: unknown) {
      console.error('Failed to open settings for update:', error)
    }
  }

  return (
    <div className="launchpad-glass-panel-strong flex items-center rounded-xl border border-amber-500/50 bg-amber-500/10 px-1.5 py-1 shadow-lg shadow-amber-500/20">
      <button
        type="button"
        aria-label={translate('应用更新')}
        title={translate('发现新版本，点击查看')}
        data-no-window-drag="true"
        onClick={event => {
          console.log('Update button onClick triggered')
          event.stopPropagation()
          event.preventDefault()
          void handleClick()
        }}
        className="relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-sm border border-transparent text-amber-600 transition-all duration-150 hover:bg-amber-500/20 hover:text-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 dark:text-amber-400 dark:hover:text-amber-300"
      >
        <span className="flex h-4 w-4 items-center justify-center">
          <RefreshCw className="h-4 w-4" />
        </span>
        {/* 红点提示 */}
        <span className="absolute right-1 top-1 h-2 w-2 animate-pulse rounded-full bg-red-500 ring-2 ring-background" />
      </button>
    </div>
  )
}
