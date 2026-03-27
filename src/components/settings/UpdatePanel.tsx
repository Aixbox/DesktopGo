import { useEffect, useMemo, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Button } from '@/components/ui/button'
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
  Globe,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from 'lucide-react'

type InstallStage = 'idle' | 'downloading' | 'installing' | 'finished'

function formatBytes(value: number | null): string {
  if (!value || value <= 0) {
    return '未知大小'
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

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export function UpdatePanel() {
  const [configStatus, setConfigStatus] = useState<UpdaterConfigurationStatus | null>(null)
  const [checkResult, setCheckResult] = useState<AppUpdateCheckResult | null>(null)
  const [statusText, setStatusText] = useState('正在读取更新配置...')
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [checking, setChecking] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [installStage, setInstallStage] = useState<InstallStage>('idle')
  const [downloadedBytes, setDownloadedBytes] = useState(0)
  const [contentLength, setContentLength] = useState<number | null>(null)

  const refreshConfiguration = async () => {
    setLoadingConfig(true)
    try {
      const nextStatus = await getUpdaterConfigurationStatus()
      setConfigStatus(nextStatus)

      if (!nextStatus.configured) {
        setCheckResult(null)
      }

      setStatusText(nextStatus.message ?? '更新配置已刷新。')
    } catch (error) {
      const message = `读取更新配置失败：${String(error)}`
      setConfigStatus(null)
      setCheckResult(null)
      setStatusText(message)
    } finally {
      setLoadingConfig(false)
    }
  }

  useEffect(() => {
    void refreshConfiguration()
  }, [])

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
            setStatusText('正在下载更新包...')
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
            setStatusText(
              nextContentLength
                ? `正在下载更新包（${formatBytes(nextDownloadedBytes)} / ${formatBytes(nextContentLength)}）...`
                : `正在下载更新包（已下载 ${formatBytes(nextDownloadedBytes)}）...`
            )
            break
          }
          case 'installing':
            setInstalling(true)
            setInstallStage('installing')
            setStatusText('下载完成，正在启动安装程序...')
            break
          case 'beforeExit':
            setStatusText('安装程序即将接管，应用会自动退出。')
            break
          case 'finished':
            setInstalling(false)
            setInstallStage('finished')
            setStatusText('更新安装流程已完成。请重新打开应用确认版本。')
            void refreshConfiguration()
            break
          case 'error':
            setInstalling(false)
            setInstallStage('idle')
            setStatusText(payload.data?.message ?? '更新安装失败。')
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
  }, [])

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

  const handleCheck = async () => {
    setChecking(true)
    setInstallStage('idle')
    setDownloadedBytes(0)
    setContentLength(null)

    try {
      const result = await checkForAppUpdate()
      setCheckResult(result)
      setStatusText(
        result.available
          ? `发现新版本 v${result.update?.version ?? ''}，可以开始下载安装。`
          : result.message ?? '当前已是最新版本。'
      )
    } catch (error) {
      setCheckResult(null)
      setStatusText(`检查更新失败：${String(error)}`)
    } finally {
      setChecking(false)
    }
  }

  const handleInstall = async () => {
    if (!checkResult?.available) return

    setInstalling(true)
    setInstallStage('downloading')
    setDownloadedBytes(0)
    setContentLength(null)
    setStatusText('正在准备下载安装更新...')

    try {
      await installAppUpdate()
      setInstalling(false)
      setInstallStage('finished')
      setStatusText('更新安装流程已完成。')
    } catch (error) {
      setInstalling(false)
      setInstallStage('idle')
      setStatusText(`下载安装更新失败：${String(error)}`)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border/90 bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">应用更新</p>
            <p className="text-xs text-muted-foreground">
              当前版本 v{currentVersion}，当前目标 {currentTarget}
            </p>
          </div>
          <div className="rounded-full border border-border/80 bg-muted px-3 py-1 text-xs text-foreground/75">
            {configStatus?.configured ? '更新已接入' : '等待配置'}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => void handleCheck()} disabled={loadingConfig || checking || installing}>
            {checking ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            检查更新
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
            下载并安装
          </Button>
          <Button
            variant="outline"
            onClick={() => void refreshConfiguration()}
            disabled={loadingConfig || checking || installing}
          >
            刷新配置
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border/90 bg-card p-4 shadow-sm">
        <div className="flex items-start gap-3">
          {configStatus?.configured ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
          ) : (
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          )}
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">当前状态</p>
            <p className="text-xs leading-5 text-muted-foreground">{statusText}</p>
            {!configStatus?.configured ? (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-foreground/80">
                还缺少 updater 配置。请在
                <span className="font-medium text-foreground"> src-tauri/tauri.conf.json </span>
                中设置
                <span className="font-medium text-foreground"> plugins.updater.pubkey </span>
                和
                <span className="font-medium text-foreground"> plugins.updater.endpoints </span>
                。正式发布时还需要
                <span className="font-medium text-foreground"> TAURI_SIGNING_PRIVATE_KEY </span>
                用于生成签名更新包。
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border/90 bg-card p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <Globe className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">更新源</p>
            {configStatus?.configured && configStatus.endpoints.length > 0 ? (
              <div className="space-y-2">
                {configStatus.endpoints.map(endpoint => (
                  <div
                    key={endpoint}
                    className="rounded-md border border-border/85 bg-background px-3 py-2 text-xs text-muted-foreground shadow-sm"
                  >
                    {endpoint}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs leading-5 text-muted-foreground">
                建议直接指向静态
                <span className="mx-1 font-medium text-foreground">latest.json</span>
                地址。这个项目的第一版适合用 GitHub Releases 托管。
              </p>
            )}
          </div>
        </div>
      </div>

      {updateInfo ? (
        <div className="rounded-lg border border-border/90 bg-card p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
            <div className="space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">检测到新版本 v{updateInfo.version}</p>
                <p className="text-xs text-muted-foreground">
                  基于目标 {updateInfo.target}
                  {releaseDate ? `，发布时间 ${releaseDate}` : ''}
                </p>
              </div>
              <div className="rounded-md border border-border/85 bg-background px-3 py-2 text-xs leading-5 text-muted-foreground shadow-sm">
                {updateInfo.body?.trim() ? (
                  <p className="whitespace-pre-wrap">{updateInfo.body}</p>
                ) : (
                  <p>当前更新没有附带发布说明。</p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {installStage !== 'idle' ? (
        <div className="rounded-lg border border-border/90 bg-card p-4 shadow-sm">
          <div className="flex items-start gap-3">
            {installStage === 'finished' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
            ) : (
              <LoaderCircle className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-blue-500" />
            )}
            <div className="w-full space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">安装进度</p>
                <p className="text-xs text-muted-foreground">
                  {installStage === 'downloading' && '正在下载更新包'}
                  {installStage === 'installing' && '正在启动安装程序'}
                  {installStage === 'finished' && '更新安装流程已完成'}
                </p>
              </div>

              <div className="space-y-2">
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full bg-blue-500 transition-all duration-300 ${
                      progressPercent === null ? 'w-1/2 animate-pulse' : ''
                    }`}
                    style={progressPercent === null ? undefined : { width: `${progressPercent}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {progressPercent === null
                    ? contentLength
                      ? `已准备下载 ${formatBytes(contentLength)}`
                      : '正在等待安装程序返回下载信息...'
                    : `已下载 ${formatBytes(downloadedBytes)} / ${formatBytes(contentLength)} (${progressPercent.toFixed(1)}%)`}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
