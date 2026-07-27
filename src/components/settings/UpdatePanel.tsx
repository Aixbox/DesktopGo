import { useCallback, useEffect, useMemo, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { getIntlLocale, translate, useI18n } from '@/lib/i18n'
import {
  APP_UPDATER_PROGRESS_EVENT,
  checkForAppUpdate,
  getUpdaterConfigurationStatus,
  installAppUpdate,
  type AppUpdateCheckResult,
  type AppUpdateProgressPayload,
  type UpdaterConfigurationStatus,
} from '@/lib/updater'
import {
  CheckCircle2,
  Download,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from 'lucide-react'

type InstallStage = 'idle' | 'downloading' | 'installing' | 'finished'

function formatBytes(value: number | null): string {
  if (!value || value <= 0) {
    return translate('未知大小')
  }

  const units = ['B', 'KB', 'MB', 'GB']
  let size = value
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  const precision = unitIndex === 0 ? 0 : 1
  return `${size.toFixed(precision)} ${units[unitIndex]}`
}

function formatReleaseDate(value: string | null): string | null {
  if (!value) return null

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat(getIntlLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export function UpdatePanel() {
  useI18n()

  const [configStatus, setConfigStatus] = useState<UpdaterConfigurationStatus | null>(null)
  const [checkResult, setCheckResult] = useState<AppUpdateCheckResult | null>(null)
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [checking, setChecking] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [installStage, setInstallStage] = useState<InstallStage>('idle')
  const [downloadedBytes, setDownloadedBytes] = useState(0)
  const [contentLength, setContentLength] = useState<number | null>(null)
  const toast = useToast()

  const applyConfigurationStatus = useCallback((nextStatus: UpdaterConfigurationStatus) => {
    setConfigStatus(nextStatus)
    if (!nextStatus.configured) {
      setCheckResult(null)
    }
  }, [])

  const reportConfigurationError = useCallback(
    (error: unknown) => {
      const message = translate('读取更新配置失败：{error}', { error: String(error) })
      setConfigStatus(null)
      setCheckResult(null)
      toast.error(message, {
        key: 'update-panel',
        title: translate('应用更新'),
      })
    },
    [toast]
  )

  const refreshConfiguration = useCallback(
    async (options?: { notifySuccess?: boolean }) => {
      setLoadingConfig(true)
      try {
        const nextStatus = await getUpdaterConfigurationStatus()
        applyConfigurationStatus(nextStatus)
        if (options?.notifySuccess) {
          toast.info(nextStatus.message ?? translate('更新配置已刷新。'), {
            key: 'update-panel',
            title: translate('应用更新'),
          })
        }
      } catch (error) {
        reportConfigurationError(error)
      } finally {
        setLoadingConfig(false)
      }
    },
    [applyConfigurationStatus, reportConfigurationError, toast]
  )

  useEffect(() => {
    let active = true

    void getUpdaterConfigurationStatus()
      .then(nextStatus => {
        if (active) applyConfigurationStatus(nextStatus)
      })
      .catch(error => {
        if (active) reportConfigurationError(error)
      })
      .finally(() => {
        if (active) setLoadingConfig(false)
      })

    return () => {
      active = false
    }
  }, [applyConfigurationStatus, reportConfigurationError])

  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | null = null

    void getCurrentWindow()
      .listen<AppUpdateProgressPayload>(APP_UPDATER_PROGRESS_EVENT, event => {
        const payload = event.payload

        switch (payload.event) {
          case 'started': {
            const nextContentLength =
              payload.data?.contentLength ?? payload.data?.content_length ?? null
            setInstalling(true)
            setInstallStage('downloading')
            setDownloadedBytes(0)
            setContentLength(nextContentLength)
            break
          }
          case 'progress': {
            const nextDownloadedBytes =
              payload.data?.downloadedLength ?? payload.data?.downloaded_length ?? 0
            const nextContentLength =
              payload.data?.contentLength ?? payload.data?.content_length ?? null
            setInstalling(true)
            setInstallStage('downloading')
            setDownloadedBytes(nextDownloadedBytes)
            setContentLength(nextContentLength)
            break
          }
          case 'installing':
            setInstalling(true)
            setInstallStage('installing')
            break
          case 'beforeExit':
            toast.info(translate('安装程序即将接管，应用会自动退出。'), {
              key: 'update-install',
              title: translate('应用更新'),
              duration: 3200,
            })
            break
          case 'finished':
            setInstalling(false)
            setInstallStage('finished')
            toast.success(translate('更新安装流程已完成。请重新打开应用确认版本。'), {
              key: 'update-install',
              title: translate('应用更新'),
              duration: 4200,
            })
            void refreshConfiguration()
            break
          case 'error':
            setInstalling(false)
            setInstallStage('idle')
            toast.error(payload.data?.message ?? translate('更新安装失败。'), {
              key: 'update-install',
              title: translate('应用更新'),
            })
            break
        }
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
  }, [refreshConfiguration, toast])

  const progressPercent = useMemo(() => {
    if (!contentLength || contentLength <= 0) {
      return null
    }
    return Math.max(0, Math.min(100, (downloadedBytes / contentLength) * 100))
  }, [contentLength, downloadedBytes])

  const currentVersion = checkResult?.currentVersion ?? configStatus?.currentVersion ?? '--'
  const currentTarget = checkResult?.target ?? configStatus?.target ?? '--'
  const updateInfo = checkResult?.update
  const releaseDate = formatReleaseDate(updateInfo?.date ?? null)

  async function handleCheck() {
    setChecking(true)
    setInstallStage('idle')
    setDownloadedBytes(0)
    setContentLength(null)

    try {
      const result = await checkForAppUpdate()
      setCheckResult(result)
      toast[result.available ? 'success' : 'info'](
        result.available
          ? translate('发现新版本 v{version}，可以开始下载安装。', {
              version: result.update?.version ?? '',
            })
          : (result.message ?? translate('当前已是最新版本。')),
        {
          key: 'update-panel',
          title: translate('应用更新'),
        }
      )
    } catch (error) {
      setCheckResult(null)
      console.error('Failed to check for app updates:', error)
      toast.error(translate('检查更新失败，请确认网络连接后重试。'), {
        key: 'update-panel',
        title: translate('应用更新'),
        duration: 8000,
        action: {
          label: translate('重试'),
          onClick: () => void handleCheck(),
        },
      })
    } finally {
      setChecking(false)
    }
  }

  async function handleInstall() {
    if (!checkResult?.available) return

    setInstalling(true)
    setInstallStage('downloading')
    setDownloadedBytes(0)
    setContentLength(null)

    try {
      await installAppUpdate()
      setInstalling(false)
      setInstallStage('finished')
    } catch (error) {
      setInstalling(false)
      setInstallStage('idle')
      console.error('Failed to download and install app update:', error)
      toast.error(translate('下载安装更新失败，请稍后重试。'), {
        key: 'update-install',
        title: translate('应用更新'),
        duration: 8000,
        action: {
          label: translate('重试'),
          onClick: () => void handleInstall(),
        },
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] xl:items-start">
        <div className="space-y-4">
          <div className="rounded-md border border-border/80 bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">{translate('应用更新')}</p>
                <p className="text-xs text-muted-foreground">
                  {translate('当前版本 v{version}，当前目标 {target}', {
                    version: currentVersion,
                    target: currentTarget,
                  })}
                </p>
              </div>
              <div className="rounded-full border border-border/80 bg-muted px-3 py-1 text-xs text-foreground/75">
                {configStatus?.configured ? translate('更新已接入') : translate('等待配置')}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                onClick={() => void handleCheck()}
                disabled={loadingConfig || checking || installing}
              >
                {checking ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {translate('检查更新')}
              </Button>
              <Button
                variant="secondary"
                onClick={() => void handleInstall()}
                disabled={!checkResult?.available || checking || installing}
              >
                {installing ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {translate('下载并安装')}
              </Button>
              <Button
                variant="outline"
                onClick={() => void refreshConfiguration({ notifySuccess: true })}
                disabled={loadingConfig || checking || installing}
              >
                {translate('刷新配置')}
              </Button>
            </div>
          </div>

          <div className="rounded-md border border-border/80 bg-card p-4">
            <div className="flex items-start gap-3">
              {configStatus?.configured ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
              ) : (
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />
              )}
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">{translate('当前状态')}</p>
                <p className="max-w-md text-xs leading-5 text-muted-foreground">
                  {configStatus?.configured
                    ? translate(
                        '更新能力已接入。检查结果会显示在右下角，下载安装时会在下方展示进度。'
                      )
                    : translate('当前尚未接入 updater 配置，检查更新与安装功能暂时不可用。')}
                </p>
                {!configStatus?.configured ? (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-900/80 dark:text-foreground/80">
                    {translate(
                      '还缺少 updater 配置。请在 src-tauri/tauri.conf.json 中设置 plugins.updater.pubkey 和 plugins.updater.endpoints。正式发布时还需要 TAURI_SIGNING_PRIVATE_KEY 用于生成签名更新包。'
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {installStage !== 'idle' ? (
            <div className="rounded-md border border-border/80 bg-card p-4">
              <div className="flex items-start gap-3">
                {installStage === 'finished' ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
                ) : (
                  <LoaderCircle className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-blue-600 dark:text-blue-300" />
                )}
                <div className="w-full space-y-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">{translate('安装进度')}</p>
                    <p className="text-xs text-muted-foreground">
                      {installStage === 'downloading' && translate('正在下载更新包')}
                      {installStage === 'installing' && translate('正在启动安装程序')}
                      {installStage === 'finished' && translate('更新安装流程已完成')}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full bg-blue-600 transition-all duration-300 dark:bg-blue-400 ${
                          progressPercent === null ? 'w-1/2 animate-pulse' : ''
                        }`}
                        style={
                          progressPercent === null ? undefined : { width: `${progressPercent}%` }
                        }
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {progressPercent === null
                        ? contentLength
                          ? translate('已准备下载 {size}', {
                              size: formatBytes(contentLength),
                            })
                          : translate('正在等待安装程序返回下载信息...')
                        : translate('已下载 {downloaded} / {total} ({percent}%)', {
                            downloaded: formatBytes(downloadedBytes),
                            total: formatBytes(contentLength),
                            percent: progressPercent.toFixed(1),
                          })}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          {updateInfo ? (
            <div className="rounded-md border border-border/80 bg-card p-4">
              <div className="flex items-start gap-3">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300" />
                <div className="space-y-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      {translate('检测到新版本 v{version}', { version: updateInfo.version })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {translate('基于目标 {target}{dateSuffix}', {
                        target: updateInfo.target,
                        dateSuffix: releaseDate
                          ? translate('，发布时间 {date}', { date: releaseDate })
                          : '',
                      })}
                    </p>
                  </div>
                  <div className="rounded-md border border-border/75 bg-background px-3 py-2 text-xs leading-5 text-muted-foreground">
                    {updateInfo.body?.trim() ? (
                      <p className="whitespace-pre-wrap">{updateInfo.body}</p>
                    ) : (
                      <p>{translate('当前更新没有附带发布说明。')}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
