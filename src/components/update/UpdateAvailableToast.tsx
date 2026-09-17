import { useEffect } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { invoke } from '@tauri-apps/api/core'
import { translate } from '@/lib/i18n'
import {
  APP_UPDATE_AVAILABLE_EVENT,
  type AppUpdateAvailablePayload,
} from '@/lib/updater'
import { useToast } from '@/components/ui/toast'

/**
 * 主窗口内的启动更新提示：监听后端启动自动检查的结果事件，
 * 发现新版本时弹出可跳转设置的 toast。挂载于主窗口（启动台）；
 * 设置窗口有自己的更新面板，不挂载本组件。
 */
export function UpdateAvailableToast() {
  const toast = useToast()

  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | null = null

    void getCurrentWindow()
      .listen<AppUpdateAvailablePayload>(APP_UPDATE_AVAILABLE_EVENT, event => {
        const { version } = event.payload
        toast.info(
          translate('发现新版本 v{version}，可到设置中下载安装。', { version }),
          {
            key: 'update-available',
            title: translate('应用更新'),
            duration: 10_000,
            action: {
              label: translate('去更新'),
              onClick: () => {
                void invoke('create_settings_window', { returnToMain: true }).catch(
                  (error: unknown) => {
                    console.error('Failed to open settings for update:', error)
                  }
                )
              },
            },
          }
        )
      })
      .then(fn => {
        if (disposed) {
          fn()
          return
        }
        unlisten = fn
      })

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [toast])

  return null
}
