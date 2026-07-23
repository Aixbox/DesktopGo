import { useCallback, useEffect, useState } from 'react'
import { getIdentifier, getName, getTauriVersion, getVersion } from '@tauri-apps/api/app'
import { openUrl } from '@tauri-apps/plugin-opener'
import { translate, useI18n } from '@/lib/i18n'
import { DEFAULT_LAUNCHPAD_SHORTCUT, getSetting } from '@/lib/settingsStore'
import { Logo, LogoText } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import {
  Info,
  Bug,
  Copy,
  CopyCheck,
  ExternalLink,
  FileText,
  Github,
  Package2,
  ShieldCheck,
} from 'lucide-react'
import { formatShortcutForDisplay } from './shortcut'

type AboutAppInfo = {
  name: string
  version: string
  identifier: string
  tauriVersion: string
}

const ABOUT_APP_INFO_FALLBACK: AboutAppInfo = {
  name: 'DesktopGo',
  version: '1.0.4',
  identifier: 'com.aixbox.desktopgo',
  tauriVersion: '2',
}

const ABOUT_REPOSITORY_URL = 'https://github.com/Aixbox/DesktopGo'
const ABOUT_ISSUES_URL = `${ABOUT_REPOSITORY_URL}/issues`
const ABOUT_RELEASES_URL = `${ABOUT_REPOSITORY_URL}/releases`

export function AboutPanel() {
  const { language } = useI18n()
  const [appInfo, setAppInfo] = useState<AboutAppInfo>(ABOUT_APP_INFO_FALLBACK)
  const [copied, setCopied] = useState(false)
  const [launchpadShortcutMeta, setLaunchpadShortcutMeta] = useState(
    translate('全局快捷键 {shortcut}', {
      shortcut: formatShortcutForDisplay(DEFAULT_LAUNCHPAD_SHORTCUT),
    })
  )
  const toast = useToast()

  useEffect(() => {
    let disposed = false

    void Promise.allSettled([getName(), getVersion(), getIdentifier(), getTauriVersion()])
      .then(([nameResult, versionResult, identifierResult, tauriVersionResult]) => {
        if (disposed) return

        const nextAppInfo: AboutAppInfo = {
          name: nameResult.status === 'fulfilled' ? nameResult.value : ABOUT_APP_INFO_FALLBACK.name,
          version:
            versionResult.status === 'fulfilled'
              ? versionResult.value
              : ABOUT_APP_INFO_FALLBACK.version,
          identifier:
            identifierResult.status === 'fulfilled'
              ? identifierResult.value
              : ABOUT_APP_INFO_FALLBACK.identifier,
          tauriVersion:
            tauriVersionResult.status === 'fulfilled'
              ? tauriVersionResult.value
              : ABOUT_APP_INFO_FALLBACK.tauriVersion,
        }

        setAppInfo(nextAppInfo)

        const failedCount = [
          nameResult,
          versionResult,
          identifierResult,
          tauriVersionResult,
        ].filter(result => result.status === 'rejected').length

        if (failedCount > 0) {
          toast.error(translate('部分应用信息未能读取，已使用当前项目的回退值。'), {
            key: 'about-panel',
            title: translate('关于'),
          })
        }
      })
      .catch(error => {
        if (disposed) return
        toast.error(translate('读取应用信息失败：{error}', { error: String(error) }), {
          key: 'about-panel',
          title: translate('关于'),
        })
      })

    void getSetting('launchpadShortcut')
      .then(shortcut => {
        if (disposed) return
        setLaunchpadShortcutMeta(
          translate('全局快捷键 {shortcut}', { shortcut: formatShortcutForDisplay(shortcut) })
        )
      })
      .catch(error => {
        if (disposed) return
        console.error('Failed to load launchpad shortcut for about panel:', error)
        setLaunchpadShortcutMeta(translate('全局快捷键可自定义'))
      })

    return () => {
      disposed = true
    }
  }, [language, toast])

  useEffect(() => {
    if (!copied) return

    const timeout = window.setTimeout(() => {
      setCopied(false)
    }, 1800)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [copied])

  const openExternalLink = useCallback(
    async (url: string, label: string) => {
      try {
        await openUrl(url)
        toast.info(translate('已打开{label}。', { label }), {
          key: 'about-panel',
          title: translate('关于'),
        })
      } catch (error) {
        toast.error(translate('打开{label}失败：{error}', { label, error: String(error) }), {
          key: 'about-panel',
          title: translate('关于'),
        })
      }
    },
    [toast]
  )

  const handleCopyDiagnostic = useCallback(async () => {
    if (!navigator.clipboard?.writeText) {
      toast.error(translate('当前环境不支持复制诊断信息。'), {
        key: 'about-panel',
        title: translate('关于'),
      })
      return
    }

    const diagnosticText = [
      `${appInfo.name} v${appInfo.version}`,
      translate('Identifier: {identifier}', { identifier: appInfo.identifier }),
      translate('Runtime: Tauri {version}', { version: appInfo.tauriVersion }),
      translate('Search dependency: Installed Everything'),
      translate('Update channel: GitHub Releases latest.json'),
    ].join('\n')

    try {
      await navigator.clipboard.writeText(diagnosticText)
      setCopied(true)
      toast.success(translate('已复制版本与诊断信息。'), {
        key: 'about-panel',
        title: translate('关于'),
      })
    } catch (error) {
      toast.error(translate('复制诊断信息失败：{error}', { error: String(error) }), {
        key: 'about-panel',
        title: translate('关于'),
      })
    }
  }, [appInfo, toast])

  const featureCards = [
    {
      title: translate('启动台'),
      description: translate('用统一入口承接桌面常用应用，适合键盘优先和快速唤起场景。'),
      meta: launchpadShortcutMeta,
    },
    {
      title: translate('文件搜索'),
      description: translate('搜索能力依赖已安装的 Everything，状态异常时会在设置页明确提示。'),
      meta: translate('Installed Everything only'),
    },
    {
      title: translate('图标库'),
      description: translate('导入并管理启动台中的应用、文件和文件夹，支持隐藏、移出与智能整理。'),
      meta: translate('统一图标库'),
    },
    {
      title: translate('应用更新'),
      description: translate('更新页读取 GitHub Releases 的 updater 清单，下载与安装过程可见。'),
      meta: translate('GitHub Releases latest.json'),
    },
  ]

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[28px] border border-border/90 bg-gradient-to-br from-card via-muted to-background px-6 py-6 shadow-sm">
        <div className="pointer-events-none absolute inset-0 opacity-70">
          <div className="absolute -right-12 top-0 h-36 w-36 rounded-full bg-blue-500/10 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-28 w-28 rounded-full bg-emerald-500/10 blur-3xl" />
        </div>

        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-card px-3 py-1 text-xs font-medium text-foreground/75 shadow-sm">
              <Info className="h-3.5 w-3.5" />
              {translate('桌面启动、搜索与整理工具')}
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <Logo iconSize={36} textSize="lg" />
                <span className="rounded-full border border-border/80 bg-card px-3 py-1 font-mono text-xs text-foreground/75 shadow-sm">
                  v{appInfo.version}
                </span>
              </div>
              <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                {translate(
                  'DesktopGo 把桌面启动、文件搜索、图标整理和应用更新收进一个统一入口里。关于页现在直接暴露版本、运行时和项目入口，方便你确认当前构建、提交反馈，或跳转查看发布记录。'
                )}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:w-[24rem]">
            <div className="rounded-2xl border border-border/85 bg-card p-4 shadow-sm">
              <LogoText size="sm" />
              <p className="mt-2 text-base font-medium text-foreground">{translate('本地优先')}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {translate('没有账号系统；主要设置、布局和搜索配置都保存在本地环境。')}
              </p>
            </div>
            <div className="rounded-2xl border border-border/85 bg-card p-4 shadow-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {translate('支持入口')}
              </p>
              <p className="mt-2 text-base font-medium text-foreground">
                {translate('反馈直达项目')}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {translate('仓库、Issue 和 Release 入口都放在这里，定位问题时不需要再找路径。')}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.25fr_0.95fr]">
        <div className="space-y-4 rounded-3xl border border-border/90 bg-card p-5 shadow-sm">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              {translate('功能概览')}
            </p>
            <h3 className="text-lg font-semibold text-foreground">
              {translate('当前构建包含的核心能力')}
            </h3>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {featureCards.map(card => (
              <article
                key={card.title}
                className="rounded-2xl border border-border/85 bg-background p-4 shadow-sm transition-colors hover:bg-accent"
              >
                <p className="text-sm font-medium text-foreground">{card.title}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{card.description}</p>
                <p className="mt-3 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  {card.meta}
                </p>
              </article>
            ))}
          </div>
        </div>

        <div className="space-y-4 rounded-3xl border border-border/90 bg-card p-5 shadow-sm">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              {translate('项目入口')}
            </p>
            <h3 className="text-lg font-semibold text-foreground">
              {translate('仓库、发布和反馈入口')}
            </h3>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => void openExternalLink(ABOUT_REPOSITORY_URL, translate('GitHub 仓库'))}
            >
              <Github className="h-4 w-4" />
              {translate('GitHub 仓库')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => void openExternalLink(ABOUT_ISSUES_URL, translate('问题反馈'))}
            >
              <Bug className="h-4 w-4" />
              {translate('提交问题')}
            </Button>
            <Button
              variant="outline"
              onClick={() => void openExternalLink(ABOUT_RELEASES_URL, translate('发布说明'))}
            >
              <FileText className="h-4 w-4" />
              {translate('发布说明')}
            </Button>
            <Button variant="outline" onClick={() => void handleCopyDiagnostic()}>
              {copied ? <CopyCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? translate('已复制') : translate('复制诊断')}
            </Button>
          </div>

          <div className="rounded-2xl border border-border/85 bg-background p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <Package2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">{translate('更新通道')}</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {translate(
                    '当前 updater 设计为从 GitHub Releases 读取 latest.json 并完成签名校验与安装流程。'
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border/85 bg-background p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">{translate('诊断建议')}</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {translate(
                    '提交问题前先复制上面的诊断信息，至少带上版本号、应用标识符和 Tauri 运行时版本。'
                  )}
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void openExternalLink(ABOUT_REPOSITORY_URL, translate('项目主页'))}
            className="group flex w-full items-center justify-between rounded-2xl border border-border/85 bg-background px-4 py-3 text-left shadow-sm transition-colors hover:bg-accent"
          >
            <div>
              <p className="text-sm font-medium text-foreground">{translate('项目主页')}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {ABOUT_REPOSITORY_URL.replace('https://', '')}
              </p>
            </div>
            <ExternalLink className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </button>
        </div>
      </section>
    </div>
  )
}
