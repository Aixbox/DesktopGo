import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getIdentifier, getName, getTauriVersion, getVersion } from '@tauri-apps/api/app'
import { invoke } from '@tauri-apps/api/core'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { openUrl } from '@tauri-apps/plugin-opener'
import {
  filterIconManagerItems,
  getPathLeaf,
  type IconSourceFilter,
  type IconVisibilityFilter,
} from '@/lib/iconManager'
import { cn } from '@/lib/utils'
import { useIconStore } from '@/stores/iconStore'
import { applyTheme, saveTheme } from '@/lib/theme'
import { DEFAULT_LAUNCHPAD_SHORTCUT, getSetting, setSetting } from '@/lib/settingsStore'
import {
  LAUNCHPAD_LAYOUT_RESET_EVENT,
  resetLaunchpadLayout,
} from '@/components/icon-grid/services/layoutStore'
import { UpdatePanel } from '@/components/settings/UpdatePanel'
import { Logo, LogoText } from '@/components/Logo'
import { SearchSettingsPanel } from '@/components/search/SearchSettingsPanel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  SettingGroup,
  SettingCard,
  OptionButton,
  ToggleRow,
} from '@/components/ui/setting-components'
import type {
  IconManagerItem,
  IconManagerViewMode,
  IconMutationTarget,
  IconSize,
  ThemeMode,
  TitleLineCount,
  WindowMode,
} from '@/types'
import {
  Settings as SettingsIcon,
  RefreshCw,
  Info,
  Images,
  Search,
  Minus,
  Square,
  Bug,
  Copy,
  CopyCheck,
  ExternalLink,
  FileText,
  Github,
  Package2,
  ShieldCheck,
  X,
  LayoutGrid,
  List,
} from 'lucide-react'

type NavItem = 'settings' | 'search' | 'iconManager' | 'update' | 'about'

const NAV_ITEMS: { key: NavItem; label: string; icon: React.ReactNode }[] = [
  { key: 'settings', label: '设置', icon: <SettingsIcon className="w-4 h-4" /> },
  { key: 'search', label: '搜索', icon: <Search className="w-4 h-4" /> },
  { key: 'iconManager', label: '图标管理', icon: <Images className="w-4 h-4" /> },
  { key: 'update', label: '更新', icon: <RefreshCw className="w-4 h-4" /> },
  { key: 'about', label: '关于', icon: <Info className="w-4 h-4" /> },
]

const NAV_CONTENT_WIDTH: Record<NavItem, string> = {
  settings: 'max-w-[1120px]',
  search: 'max-w-[1180px]',
  iconManager: 'max-w-[1240px]',
  update: 'max-w-[1240px]',
  about: 'max-w-[1360px]',
}

const ICON_SIZE_OPTIONS: { label: string; value: IconSize }[] = [
  { label: '大图标', value: 'large' },
  { label: '中等图标', value: 'medium' },
  { label: '小图标', value: 'small' },
]

const WINDOW_MODE_OPTIONS: { label: string; value: WindowMode }[] = [
  { label: '全屏', value: 'fullscreen' },
  { label: '大窗口', value: 'large' },
  { label: '中等窗口', value: 'medium' },
  { label: '小窗口', value: 'small' },
]

const TITLE_LINE_OPTIONS: { label: string; value: TitleLineCount }[] = [
  { label: '一行标题', value: 'one' },
  { label: '两行标题', value: 'two' },
]

const THEME_OPTIONS: { label: string; value: ThemeMode }[] = [
  { label: '跟随系统', value: 'system' },
  { label: '深色模式', value: 'dark' },
  { label: '浅色模式', value: 'light' },
]

type AboutAppInfo = {
  name: string
  version: string
  identifier: string
  tauriVersion: string
}

const ABOUT_APP_INFO_FALLBACK: AboutAppInfo = {
  name: 'DesktopGo',
  version: '0.1.0',
  identifier: 'com.binuo.desktopgo',
  tauriVersion: '2',
}

const ABOUT_REPOSITORY_URL = 'https://github.com/Aixbox/DesktopGo'
const ABOUT_ISSUES_URL = `${ABOUT_REPOSITORY_URL}/issues`
const ABOUT_RELEASES_URL = `${ABOUT_REPOSITORY_URL}/releases`

type IconSyncAction =
  | 'desktopIncremental'
  | 'desktopFull'
  | 'customappIncremental'
  | 'customappFull'

type IconSyncCommand =
  | 'sync_new_desktop_icons'
  | 'sync_full_desktop_icons'
  | 'sync_new_customapp_icons'
  | 'sync_full_customapp_icons'

type IconSyncMode = 'incremental' | 'full'

type IconSyncResult = {
  mode: string
  scanned_count: number
  added_count: number
  total_count: number
}

type IconSyncFeedback = {
  source: 'desktop' | 'customapp'
  tone: 'success' | 'error'
  text: string
}

const ICON_VISIBILITY_FILTER_OPTIONS: { label: string; value: IconVisibilityFilter }[] = [
  { label: '全部', value: 'all' },
  { label: '未隐藏', value: 'visible' },
  { label: '隐藏', value: 'hidden' },
]

const ICON_SOURCE_FILTER_OPTIONS: { label: string; value: IconSourceFilter }[] = [
  { label: '全部来源', value: 'all' },
  { label: '桌面', value: 'desktop' },
  { label: '自定义应用', value: 'customapp' },
]

const ICON_MANAGER_VIEW_MODE_OPTIONS: {
  label: string
  value: IconManagerViewMode
  icon: React.ReactNode
}[] = [
  { label: '列表', value: 'list', icon: <List className="h-3.5 w-3.5" /> },
  { label: '宫格', value: 'grid', icon: <LayoutGrid className="h-3.5 w-3.5" /> },
]

const ICON_SYNC_ACTIONS: Record<
  IconSyncAction,
  {
    title: string
    buttonLabel: string
    command: IconSyncCommand
    source: 'desktop' | 'customapp'
    sourceLabel: string
    mode: IconSyncMode
    desc: string
    impact: string
    toneLabel: string
    confirmTitle?: string
    confirmDesc?: string
    confirmLabel?: string
  }
> = {
  desktopIncremental: {
    title: '导入新增项',
    buttonLabel: '立即导入',
    command: 'sync_new_desktop_icons',
    source: 'desktop',
    sourceLabel: '桌面',
    mode: 'incremental',
    desc: '扫描桌面，只补进新增图标，不改动已有快照记录。',
    impact: '适合日常维护，风险最低，可直接执行。',
    toneLabel: '推荐',
  },
  desktopFull: {
    title: '全量对账',
    buttonLabel: '开始对账',
    command: 'sync_full_desktop_icons',
    source: 'desktop',
    sourceLabel: '桌面',
    mode: 'full',
    desc: '重新对照当前桌面状态，补齐缺失项并清理失效记录。',
    impact: '适合批量整理后执行，会更新快照结果，需要二次确认。',
    toneLabel: '谨慎',
    confirmTitle: '确认执行桌面全量对账',
    confirmDesc: '该操作会重新扫描整个桌面，补齐缺失项并清理快照中的失效记录，不会删除磁盘文件。',
    confirmLabel: '确认对账',
  },
  customappIncremental: {
    title: '导入新增项',
    buttonLabel: '立即导入',
    command: 'sync_new_customapp_icons',
    source: 'customapp',
    sourceLabel: '自定义应用',
    mode: 'incremental',
    desc: '扫描当前生效目录，只补进新增图标，不改动已有快照记录。',
    impact: '适合新增应用后执行，风险最低，可直接执行。',
    toneLabel: '推荐',
  },
  customappFull: {
    title: '全量对账',
    buttonLabel: '开始对账',
    command: 'sync_full_customapp_icons',
    source: 'customapp',
    sourceLabel: '自定义应用',
    mode: 'full',
    desc: '重新对照当前目录内容，补齐缺失项并清理失效记录。',
    impact: '适合整理目录后执行，会更新快照结果，需要二次确认。',
    toneLabel: '谨慎',
    confirmTitle: '确认执行自定义应用全量对账',
    confirmDesc:
      '该操作会扫描当前自定义应用目录（仅一级目录），补齐缺失项并清理快照中的失效记录，不会删除磁盘文件。',
    confirmLabel: '确认对账',
  },
}

const ICON_SYNC_GROUPS: {
  source: 'desktop' | 'customapp'
  title: string
  desc: string
  actions: [IconSyncAction, IconSyncAction]
}[] = [
  {
    source: 'desktop',
    title: '桌面图标',
    desc: '适合把桌面新增或整理后的图标状态同步回应用快照。',
    actions: ['desktopIncremental', 'desktopFull'],
  },
  {
    source: 'customapp',
    title: '自定义应用目录',
    desc: '适合维护当前配置的自定义应用目录中的图标快照。',
    actions: ['customappIncremental', 'customappFull'],
  },
]

type ShortcutStatusTone = 'default' | 'success' | 'error'

const SHORTCUT_MODIFIER_CODES = new Set([
  'ControlLeft',
  'ControlRight',
  'ShiftLeft',
  'ShiftRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
])

const SHORTCUT_KEY_DISPLAY_LABELS: Record<string, string> = {
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ArrowUp: 'Up',
  Backquote: '`',
  Backslash: '\\',
  BracketLeft: '[',
  BracketRight: ']',
  CapsLock: 'Caps Lock',
  Comma: ',',
  ContextMenu: 'Menu',
  Delete: 'Delete',
  Enter: 'Enter',
  Equal: '=',
  Escape: 'Esc',
  Home: 'Home',
  Insert: 'Insert',
  Minus: '-',
  PageDown: 'Page Down',
  PageUp: 'Page Up',
  Period: '.',
  PrintScreen: 'Print Screen',
  Quote: "'",
  ScrollLock: 'Scroll Lock',
  Semicolon: ';',
  Slash: '/',
  Space: 'Space',
  Tab: 'Tab',
}

function formatShortcutToken(token: string) {
  const normalizedToken = token.trim()
  const lowerToken = normalizedToken.toLowerCase()

  switch (lowerToken) {
    case 'control':
    case 'ctrl':
      return 'Ctrl'
    case 'alt':
    case 'option':
      return 'Alt'
    case 'shift':
      return 'Shift'
    case 'super':
    case 'command':
    case 'cmd':
      return 'Super'
    case 'commandorcontrol':
    case 'commandorctrl':
    case 'cmdorctrl':
    case 'cmdorcontrol':
      return 'Ctrl'
    default:
      break
  }

  const mappedLabel = SHORTCUT_KEY_DISPLAY_LABELS[normalizedToken]
  if (mappedLabel) {
    return mappedLabel
  }

  if (/^key[a-z]$/i.test(normalizedToken)) {
    return normalizedToken.slice(3).toUpperCase()
  }

  if (/^digit[0-9]$/i.test(normalizedToken)) {
    return normalizedToken.slice(5)
  }

  if (/^numpad[0-9]$/i.test(normalizedToken)) {
    return `Num ${normalizedToken.slice(6)}`
  }

  if (/^f[0-9]{1,2}$/i.test(normalizedToken)) {
    return normalizedToken.toUpperCase()
  }

  return normalizedToken.charAt(0).toUpperCase() + normalizedToken.slice(1)
}

function formatShortcutForDisplay(shortcut: string) {
  const tokens = shortcut
    .split('+')
    .map(token => token.trim())
    .filter(Boolean)

  if (tokens.length === 0) {
    return '未设置'
  }

  return tokens.map(formatShortcutToken).join(' + ')
}

function formatShortcutForInput(shortcut: string) {
  const tokens = shortcut
    .split('+')
    .map(token => token.trim())
    .filter(Boolean)

  if (tokens.length === 0) {
    return ''
  }

  return tokens.map(formatShortcutToken).join('+')
}

function normalizeShortcutDraftText(shortcut: string) {
  return shortcut
    .trim()
    .replace(/\s*\+\s*/g, '+')
    .replace(/\s+/g, ' ')
}

function buildShortcutFromKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
  const hasModifier = event.ctrlKey || event.altKey || event.shiftKey

  if (!hasModifier) {
    return {
      error: '快捷键至少需要一个修饰键，例如 Ctrl + Space。',
    }
  }

  if (!event.code || event.code === 'Unidentified' || SHORTCUT_MODIFIER_CODES.has(event.code)) {
    return {
      error: '请在按住修饰键后，再按一个主键，例如 Space、K 或 F1。',
    }
  }

  const tokens: string[] = []
  if (event.ctrlKey) {
    tokens.push('Ctrl')
  }
  if (event.altKey) {
    tokens.push('Alt')
  }
  if (event.shiftKey) {
    tokens.push('Shift')
  }
  tokens.push(event.code)

  return {
    shortcut: tokens.join('+'),
  }
}

function WindowControlButton({
  label,
  onClick,
  tone = 'default',
  children,
}: {
  label: string
  onClick: () => void
  tone?: 'default' | 'danger'
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-sm transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${
        tone === 'danger'
          ? 'text-muted-foreground hover:bg-red-500/12 hover:text-red-500 dark:hover:text-red-300'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      }`}
    >
      <span className="flex h-4 w-4 items-center justify-center">{children}</span>
    </button>
  )
}

function SettingsPanel() {
  const { iconSize, windowMode, titleLineCount, dockEnabled, setDockEnabled } = useIconStore()
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark')
  const [launchpadShortcut, setLaunchpadShortcut] = useState(DEFAULT_LAUNCHPAD_SHORTCUT)
  const [launchpadShortcutDraft, setLaunchpadShortcutDraft] = useState(
    formatShortcutForInput(DEFAULT_LAUNCHPAD_SHORTCUT)
  )
  const [shortcutStatusText, setShortcutStatusText] = useState('')
  const [shortcutStatusTone, setShortcutStatusTone] = useState<ShortcutStatusTone>('default')
  const [isRecordingShortcut, setIsRecordingShortcut] = useState(false)
  const [isSavingShortcut, setIsSavingShortcut] = useState(false)
  const shortcutInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const [
          savedIconSize,
          savedWindowMode,
          savedTitleLineCount,
          savedDockEnabled,
          savedThemeMode,
          savedLaunchpadShortcut,
        ] = await Promise.all([
          getSetting('iconSize'),
          getSetting('windowMode'),
          getSetting('titleLineCount'),
          getSetting('dockEnabled'),
          getSetting('themeMode'),
          getSetting('launchpadShortcut'),
        ])

        useIconStore.setState({
          iconSize: savedIconSize,
          windowMode: savedWindowMode,
          titleLineCount: savedTitleLineCount,
          dockEnabled: savedDockEnabled,
        })
        setThemeMode(savedThemeMode)
        setLaunchpadShortcut(savedLaunchpadShortcut)
        setLaunchpadShortcutDraft(formatShortcutForInput(savedLaunchpadShortcut))
        setShortcutStatusText(
          `当前生效快捷键：${formatShortcutForDisplay(savedLaunchpadShortcut)}。`
        )
      } catch (e) {
        console.error('Failed to load settings:', e)
      } finally {
        void getCurrentWindow().show()
      }
    })()
  }, [])

  const handleIconSize = (value: IconSize) => {
    void setSetting('iconSize', value).catch(e => console.error('Failed to save icon size:', e))
    useIconStore.setState({ iconSize: value })
  }

  const handleWindowMode = async (value: WindowMode) => {
    void setSetting('windowMode', value).catch(e => console.error('Failed to save window mode:', e))
    useIconStore.setState({ windowMode: value })
    const mainWindow = await WebviewWindow.getByLabel('main')
    if (mainWindow) {
      await mainWindow.close()
    }
  }

  const handleTitleLineCount = (value: TitleLineCount) => {
    void setSetting('titleLineCount', value).catch(e =>
      console.error('Failed to save title line count:', e)
    )
    useIconStore.setState({ titleLineCount: value })
  }

  const handleDockEnabled = (value: boolean) => {
    setDockEnabled(value)
  }

  const handleThemeMode = (value: ThemeMode) => {
    void saveTheme(value).catch(e => console.error('Failed to save theme mode:', e))
    setThemeMode(value)
    applyTheme(value)
  }

  const handleToggleShortcutRecording = () => {
    if (isRecordingShortcut) {
      setIsRecordingShortcut(false)
      setShortcutStatusTone('default')
      setShortcutStatusText('已取消录制，当前快捷键未变化。')
      return
    }

    setIsRecordingShortcut(true)
    setShortcutStatusTone('default')
    setShortcutStatusText(
      '请按下新的组合键。录制仅识别 Ctrl、Alt、Shift；像 Ctrl+Space 这种组合可以直接手动输入。'
    )
    window.setTimeout(() => {
      shortcutInputRef.current?.focus()
    }, 0)
  }

  const handleShortcutInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (isRecordingShortcut) {
      return
    }

    setLaunchpadShortcutDraft(event.target.value)
    setShortcutStatusTone('default')
    setShortcutStatusText(
      '已更新待保存的快捷键文本。像 Ctrl+Space 这种录制不到的组合，可以直接手动输入后保存。'
    )
  }

  const handleShortcutInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isRecordingShortcut) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    if (event.repeat) {
      return
    }

    if (
      event.code === 'Escape' &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.shiftKey &&
      !event.metaKey
    ) {
      setIsRecordingShortcut(false)
      setShortcutStatusTone('default')
      setShortcutStatusText('已取消录制，当前快捷键未变化。')
      return
    }

    const result = buildShortcutFromKeyDown(event)
    if (!result.shortcut) {
      setShortcutStatusTone('error')
      setShortcutStatusText(result.error ?? '未能识别该快捷键。')
      return
    }

    setLaunchpadShortcutDraft(result.shortcut)
    setIsRecordingShortcut(false)
    setShortcutStatusTone('default')
    setShortcutStatusText(
      `已捕获 ${formatShortcutForDisplay(result.shortcut)}，点击“保存快捷键”后生效。`
    )
  }

  const handleShortcutInputBlur = () => {
    if (!isRecordingShortcut) {
      return
    }

    setIsRecordingShortcut(false)
    setShortcutStatusTone('default')
    setShortcutStatusText('录制已结束，当前快捷键未变化。')
  }

  const handleResetLaunchpadShortcut = () => {
    setIsRecordingShortcut(false)
    setLaunchpadShortcutDraft(formatShortcutForInput(DEFAULT_LAUNCHPAD_SHORTCUT))
    setShortcutStatusTone('default')
    setShortcutStatusText(
      launchpadShortcut === DEFAULT_LAUNCHPAD_SHORTCUT
        ? `当前已经是默认快捷键：${formatShortcutForDisplay(DEFAULT_LAUNCHPAD_SHORTCUT)}。`
        : `已恢复默认值 ${formatShortcutForDisplay(DEFAULT_LAUNCHPAD_SHORTCUT)}，点击“保存快捷键”后生效。`
    )
  }

  const handleSaveLaunchpadShortcut = async () => {
    if (isSavingShortcut) {
      return
    }

    const previousShortcut = launchpadShortcut
    const draftShortcut = normalizeShortcutDraftText(launchpadShortcutDraft)

    if (!draftShortcut) {
      setShortcutStatusTone('error')
      setShortcutStatusText('请输入快捷键，例如 Ctrl+Space 或 Ctrl+Alt+K。')
      return
    }

    setIsRecordingShortcut(false)
    setIsSavingShortcut(true)
    setShortcutStatusTone('default')
    setShortcutStatusText('正在更新启动台快捷键...')

    try {
      const normalizedShortcut = await invoke<string>('update_launchpad_shortcut', {
        shortcut: draftShortcut,
      })

      try {
        await setSetting('launchpadShortcut', normalizedShortcut)
      } catch (storageError) {
        let rollbackMessage = '已回滚到原快捷键。'

        try {
          await invoke<string>('update_launchpad_shortcut', {
            shortcut: previousShortcut,
          })
        } catch (rollbackError) {
          console.error('Failed to rollback launchpad shortcut registration:', rollbackError)
          rollbackMessage = '回滚也失败了，当前运行时快捷键可能仍是新值。'
        }

        throw new Error(`写入本地设置失败：${String(storageError)} ${rollbackMessage}`)
      }

      setLaunchpadShortcut(normalizedShortcut)
      setLaunchpadShortcutDraft(formatShortcutForInput(normalizedShortcut))
      setShortcutStatusTone('success')
      setShortcutStatusText(
        `启动台快捷键已更新为 ${formatShortcutForDisplay(normalizedShortcut)}。`
      )
    } catch (error) {
      console.error('Failed to save launchpad shortcut:', error)
      setShortcutStatusTone('error')
      setShortcutStatusText(`保存快捷键失败：${String(error)}`)
    } finally {
      setIsSavingShortcut(false)
    }
  }

  const normalizedDraftShortcut = normalizeShortcutDraftText(launchpadShortcutDraft)
  const currentShortcutInputValue = formatShortcutForInput(launchpadShortcut)
  const shortcutDraftChanged =
    normalizedDraftShortcut !== normalizeShortcutDraftText(currentShortcutInputValue)
  const shortcutDisplayValue = isRecordingShortcut ? '请按下新的组合键' : launchpadShortcutDraft
  const shortcutStatusClassName =
    shortcutStatusTone === 'error'
      ? 'text-red-500 dark:text-red-300'
      : shortcutStatusTone === 'success'
        ? 'text-emerald-600 dark:text-emerald-300'
        : 'text-muted-foreground'

  return (
    <>
      <SettingGroup title="主题模式">
        {THEME_OPTIONS.map(opt => (
          <OptionButton
            key={opt.value}
            label={opt.label}
            selected={themeMode === opt.value}
            onClick={() => handleThemeMode(opt.value)}
          />
        ))}
      </SettingGroup>

      <SettingGroup title="图标大小">
        {ICON_SIZE_OPTIONS.map(opt => (
          <OptionButton
            key={opt.value}
            label={opt.label}
            selected={iconSize === opt.value}
            onClick={() => handleIconSize(opt.value)}
          />
        ))}
      </SettingGroup>

      <SettingGroup title="窗口大小">
        {WINDOW_MODE_OPTIONS.map(opt => (
          <OptionButton
            key={opt.value}
            label={opt.label}
            selected={windowMode === opt.value}
            onClick={() => handleWindowMode(opt.value)}
          />
        ))}
      </SettingGroup>

      <SettingGroup title="标题行数">
        {TITLE_LINE_OPTIONS.map(opt => (
          <OptionButton
            key={opt.value}
            label={opt.label}
            selected={titleLineCount === opt.value}
            onClick={() => handleTitleLineCount(opt.value)}
          />
        ))}
      </SettingGroup>

      <div className="mb-6">
        <ToggleRow
          title="显示 Dock 栏"
          description={
            dockEnabled
              ? '当前已开启，Dock 会在启动台底部显示。'
              : '当前已关闭，Dock 中的图标会回到图标网格。'
          }
          checked={dockEnabled}
          onChange={handleDockEnabled}
        />
      </div>

      <div className="mb-6">
        <SettingCard
          label="打开启动台快捷键"
          desc="修改唤起启动台的全局快捷键。录制支持 Ctrl、Alt、Shift；像 Ctrl+Space 这种可能被系统或输入法拦截的组合，可以直接手动输入。"
        >
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border border-border/80 bg-background px-2.5 py-1">
              当前生效：{formatShortcutForDisplay(launchpadShortcut)}
            </span>
            {shortcutDraftChanged ? (
              <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-amber-700 dark:text-amber-300">
                待保存：{formatShortcutForDisplay(launchpadShortcutDraft)}
              </span>
            ) : null}
            {isRecordingShortcut ? (
              <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-blue-600 dark:text-blue-300">
                录制中
              </span>
            ) : null}
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
            <Input
              ref={shortcutInputRef}
              value={shortcutDisplayValue}
              aria-label="启动台快捷键"
              placeholder="可手动输入，例如 Ctrl+Space"
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              onChange={handleShortcutInputChange}
              onKeyDown={handleShortcutInputKeyDown}
              onBlur={handleShortcutInputBlur}
              className={cn(
                'font-medium',
                isRecordingShortcut && 'border-blue-500/60 ring-2 ring-blue-500/15'
              )}
            />

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={isRecordingShortcut ? 'secondary' : 'outline'}
                onClick={handleToggleShortcutRecording}
                disabled={isSavingShortcut}
              >
                {isRecordingShortcut ? '取消录制' : '录制快捷键'}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void handleSaveLaunchpadShortcut()}
                disabled={isSavingShortcut || isRecordingShortcut || !shortcutDraftChanged}
              >
                {isSavingShortcut ? '保存中...' : '保存快捷键'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleResetLaunchpadShortcut}
                disabled={isSavingShortcut}
              >
                恢复默认
              </Button>
            </div>
          </div>

          <p className="text-xs leading-5 text-muted-foreground">
            支持手动输入 `Ctrl+Space`、`Ctrl+Alt+K`、`Alt+Shift+P`。录制模式只识别 `Ctrl / Alt /
            Shift`。
          </p>

          <p className={cn('text-xs leading-5', shortcutStatusClassName)}>
            {shortcutStatusText || '录制后按下组合键，保存成功后会立即生效。'}
          </p>
        </SettingCard>
      </div>
    </>
  )
}

function IconManagerPanel() {
  const [pendingAction, setPendingAction] = useState<IconSyncAction | null>(null)
  const [activeSyncAction, setActiveSyncAction] = useState<IconSyncAction | null>(null)
  const [pendingMutation, setPendingMutation] = useState<{
    type: 'hide' | 'unhide' | 'delete'
    icon: IconManagerItem
  } | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [mutating, setMutating] = useState(false)
  const [listLoading, setListLoading] = useState(false)
  const [layoutResetting, setLayoutResetting] = useState(false)
  const [syncFeedback, setSyncFeedback] = useState<IconSyncFeedback | null>(null)
  const [managerResultText, setManagerResultText] = useState<string>('')
  const [managerErrorText, setManagerErrorText] = useState<string>('')
  const [layoutResetText, setLayoutResetText] = useState('')
  const [defaultCustomAppDir, setDefaultCustomAppDir] = useState('')
  const [customAppDirInput, setCustomAppDirInput] = useState('')
  const [customAppDirText, setCustomAppDirText] = useState('')
  const [effectiveCustomAppDir, setEffectiveCustomAppDir] = useState('')
  const [allIcons, setAllIcons] = useState<IconManagerItem[]>([])
  const [viewMode, setViewMode] = useState<IconManagerViewMode>('list')
  const [searchInput, setSearchInput] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [visibilityFilter, setVisibilityFilter] = useState<IconVisibilityFilter>('all')
  const [sourceFilter, setSourceFilter] = useState<IconSourceFilter>('all')

  const refreshCustomAppDirDisplay = async (options?: { syncInput?: boolean }) => {
    try {
      const [savedCustomAppDir, resolvedDefaultCustomAppDir] = await Promise.all([
        getSetting('customAppDir'),
        invoke<string>('get_default_customapp_dir'),
      ])
      const nextSavedCustomAppDir = savedCustomAppDir.trim()
      const nextEffectiveCustomAppDir = nextSavedCustomAppDir || resolvedDefaultCustomAppDir
      setDefaultCustomAppDir(resolvedDefaultCustomAppDir)
      setEffectiveCustomAppDir(nextEffectiveCustomAppDir)
      if (options?.syncInput) {
        setCustomAppDirInput(nextEffectiveCustomAppDir)
      }
    } catch (e) {
      console.error('Failed to load customapp dir:', e)
    }
  }

  const refreshIconManagerList = async () => {
    setListLoading(true)
    setManagerErrorText('')
    try {
      const savedCustomAppDir = (await getSetting('customAppDir')).trim()
      const icons = await invoke<IconManagerItem[]>('get_icon_manager_items', {
        iconSize: 48,
        customAppDir: savedCustomAppDir || null,
      })
      setAllIcons(icons)
    } catch (e) {
      setManagerErrorText(`加载图标列表失败：${String(e)}`)
    } finally {
      setListLoading(false)
    }
  }

  useEffect(() => {
    void getSetting('iconManagerViewMode')
      .then(setViewMode)
      .catch(e => console.error('Failed to load icon manager view mode:', e))

    void (async () => {
      await refreshCustomAppDirDisplay({ syncInput: true })
      await refreshIconManagerList()
    })()
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchKeyword(searchInput.trim().toLowerCase())
    }, 200)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const filteredIcons = useMemo(() => {
    return filterIconManagerItems(allIcons, {
      visibilityFilter,
      sourceFilter,
      searchKeyword,
    })
  }, [allIcons, visibilityFilter, sourceFilter, searchKeyword])

  const handleViewModeChange = (nextMode: IconManagerViewMode) => {
    if (nextMode === viewMode) return

    // 视图模式属于用户偏好，持久化后可避免每次进入设置页都重新切回常用展示。
    setViewMode(nextMode)
    void setSetting('iconManagerViewMode', nextMode).catch(e =>
      console.error('Failed to save icon manager view mode:', e)
    )
  }

  const runSyncAction = async (actionKey: IconSyncAction) => {
    setSyncing(true)
    setActiveSyncAction(actionKey)
    setSyncFeedback(null)

    try {
      const action = ICON_SYNC_ACTIONS[actionKey]
      let result: IconSyncResult

      if (action.source === 'customapp') {
        const savedCustomAppDir = (await getSetting('customAppDir')).trim()
        result = await invoke<IconSyncResult>(action.command, {
          customAppDir: savedCustomAppDir || null,
        })
      } else {
        result = await invoke<IconSyncResult>(action.command)
      }

      const modeText = action.mode === 'full' ? '全量对账' : '导入新增项'
      setSyncFeedback({
        source: action.source,
        tone: 'success',
        text: `${action.sourceLabel}${modeText}完成：扫描 ${result.scanned_count} 项，新增 ${result.added_count} 项，当前快照共 ${result.total_count} 项。`,
      })
      await refreshCustomAppDirDisplay()
      await refreshIconManagerList()
    } catch (e) {
      const action = ICON_SYNC_ACTIONS[actionKey]
      const modeText = action.mode === 'full' ? '全量对账' : '导入新增项'
      setSyncFeedback({
        source: action.source,
        tone: 'error',
        text: `${action.sourceLabel}${modeText}失败：${String(e)}`,
      })
    } finally {
      setSyncing(false)
      setActiveSyncAction(null)
      setPendingAction(null)
    }
  }

  const handleTriggerSync = (actionKey: IconSyncAction) => {
    const action = ICON_SYNC_ACTIONS[actionKey]
    if (action.mode === 'full') {
      setPendingAction(actionKey)
      return
    }

    void runSyncAction(actionKey)
  }

  const handleConfirmSync = async () => {
    if (!pendingAction) return
    await runSyncAction(pendingAction)
  }

  const handleConfirmMutation = async () => {
    if (!pendingMutation) return
    setMutating(true)
    setManagerResultText('')
    try {
      const targets: IconMutationTarget[] = [
        {
          id: pendingMutation.icon.id,
          source: pendingMutation.icon.source,
        },
      ]

      let command = 'hide_desktop_icons'
      let actionLabel = '隐藏'
      if (pendingMutation.type === 'unhide') {
        command = 'unhide_desktop_icons'
        actionLabel = '取消隐藏'
      } else if (pendingMutation.type === 'delete') {
        command = 'delete_desktop_icons'
        actionLabel = '删除'
      }

      const affected = await invoke<number>(command, { targets })
      const sourceText = pendingMutation.icon.source === 'desktop' ? '桌面' : '自定义应用'
      setManagerResultText(`${actionLabel}完成：${sourceText} 图标影响 ${affected} 项。`)
      await refreshIconManagerList()
    } catch (e) {
      setManagerResultText(`操作失败：${String(e)}`)
    } finally {
      setMutating(false)
      setPendingMutation(null)
    }
  }

  const handlePickCustomAppDir = async () => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        defaultPath:
          customAppDirInput.trim() || effectiveCustomAppDir || defaultCustomAppDir || undefined,
      })

      if (typeof selected === 'string') {
        setCustomAppDirInput(selected)
        setCustomAppDirText('已选择文件夹，请点击“保存路径”后生效。')
      }
    } catch (e) {
      setCustomAppDirText(`选择文件夹失败：${String(e)}`)
    }
  }

  const handleOpenCustomAppDir = async () => {
    const targetDir = customAppDirInput.trim() || effectiveCustomAppDir || defaultCustomAppDir
    if (!targetDir) {
      setCustomAppDirText('没有可打开的目录，请先选择或输入自定义应用目录。')
      return
    }

    try {
      await invoke('launch_app', { path: targetDir })
      setCustomAppDirText(`已打开目录：${targetDir}`)
    } catch (e) {
      setCustomAppDirText(`打开目录失败：${String(e)}`)
    }
  }

  const handleSaveCustomAppDir = async () => {
    try {
      const nextCustomAppDir = customAppDirInput.trim()
      await setSetting('customAppDir', nextCustomAppDir)
      const nextEffectiveCustomAppDir = nextCustomAppDir || defaultCustomAppDir
      setEffectiveCustomAppDir(nextEffectiveCustomAppDir)
      setCustomAppDirText(
        nextCustomAppDir
          ? '路径已保存，后续自定义应用同步将使用该目录。'
          : '已恢复使用默认自定义应用目录。'
      )
      await refreshIconManagerList()
    } catch (e) {
      setCustomAppDirText(`保存失败：${String(e)}`)
    }
  }

  const handleResetCustomAppDir = async () => {
    try {
      await setSetting('customAppDir', '')
      setCustomAppDirInput(defaultCustomAppDir)
      setEffectiveCustomAppDir(defaultCustomAppDir)
      setCustomAppDirText('已恢复默认自定义应用目录。')
      await refreshIconManagerList()
    } catch (e) {
      setCustomAppDirText(`恢复默认失败：${String(e)}`)
    }
  }

  const handleResetLaunchpadIcons = async () => {
    if (layoutResetting) return
    const confirmed = window.confirm(
      '确定要重置图标布局吗？这会清空当前宫格排序、文件夹和 Dock 排布，但不会删除图标记录。'
    )
    if (!confirmed) return

    setLayoutResetting(true)
    setLayoutResetText('正在重置图标布局...')

    try {
      await resetLaunchpadLayout()
      const mainWindow = await WebviewWindow.getByLabel('main')
      if (mainWindow) {
        await mainWindow.emit(LAUNCHPAD_LAYOUT_RESET_EVENT)
        setLayoutResetText('图标布局已重置，主窗口已刷新。')
      } else {
        setLayoutResetText('图标布局已重置，主窗口下次同步时会应用。')
      }
    } catch (e) {
      setLayoutResetText(`重置图标失败：${String(e)}`)
    } finally {
      setLayoutResetting(false)
    }
  }

  const mutationDialogText = pendingMutation
    ? pendingMutation.type === 'hide'
      ? {
          title: '确认隐藏图标',
          desc: `将隐藏图标”${pendingMutation.icon.name}”。隐藏后不会在主页面显示。`,
          confirmLabel: '确认隐藏',
          confirmVariant: 'default' as const,
        }
      : pendingMutation.type === 'unhide'
        ? {
            title: '确认取消隐藏图标',
            desc: `将取消隐藏图标”${pendingMutation.icon.name}”。取消后图标会重新显示。`,
            confirmLabel: '确认取消隐藏',
            confirmVariant: 'default' as const,
          }
        : {
            title: '确认删除图标记录',
            desc: `将删除图标”${pendingMutation.icon.name}”在应用内的记录，不会删除磁盘文件。`,
            confirmLabel: '确认删除',
            confirmVariant: 'destructive' as const,
          }
    : null

  return (
    <>
      <div className="min-w-0 space-y-6">
        <div className="max-w-3xl space-y-2">
          <h2 className="text-lg font-semibold">图标管理</h2>
          <p className="text-sm text-muted-foreground">
            首次进入主页面会自动建立桌面和自定义应用快照，后续由你在这里手动同步和整理。
          </p>
          <p className="text-xs text-muted-foreground">
            日常优先使用“导入新增项”；只有需要清理失效记录时，再执行“全量对账”。
          </p>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)] xl:items-start">
          <div className="min-w-0 space-y-4">
            <SettingCard
              label="自定义图标文件夹"
              desc="自定义应用目录只扫描一级目录。这里修改后，图标列表和后续同步都会使用新目录。"
            >
              <p className="break-all text-xs text-muted-foreground">
                默认目录：{defaultCustomAppDir || '加载中...'}
              </p>
              <p className="break-all text-xs text-muted-foreground">
                当前生效目录：{effectiveCustomAppDir || '加载中...'}
              </p>
              <Input
                value={customAppDirInput}
                onChange={e => setCustomAppDirInput(e.target.value)}
                placeholder="输入自定义应用文件夹绝对路径"
                className="w-full"
                disabled={syncing || mutating || listLoading}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePickCustomAppDir}
                  disabled={syncing || mutating || listLoading}
                >
                  选择文件夹
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenCustomAppDir}
                  disabled={syncing || mutating}
                >
                  打开文件夹
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveCustomAppDir}
                  disabled={syncing || mutating || listLoading}
                >
                  保存路径
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetCustomAppDir}
                  disabled={syncing || mutating || listLoading}
                >
                  恢复默认路径
                </Button>
              </div>
              {customAppDirText ? (
                <p className="break-all text-xs text-muted-foreground">{customAppDirText}</p>
              ) : null}
            </SettingCard>

            {ICON_SYNC_GROUPS.map(group => {
              return (
                <div
                  key={group.source}
                  className="space-y-4 rounded-xl border border-border/90 bg-card p-4 shadow-sm"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium text-foreground">{group.title}</h3>
                      <span className="rounded-full border border-border/70 bg-muted px-2 py-0.5 text-[11px] text-foreground/75">
                        {group.source === 'desktop' ? '桌面来源' : '目录来源'}
                      </span>
                    </div>
                    <p className="text-xs leading-5 text-muted-foreground">{group.desc}</p>
                  </div>

                  <div className="space-y-3">
                    {group.actions.map(actionKey => {
                      const action = ICON_SYNC_ACTIONS[actionKey]
                      const isActive = syncing && activeSyncAction === actionKey
                      const isIncremental = action.mode === 'incremental'

                      return (
                        <div
                          key={actionKey}
                          className={`rounded-lg border px-3 py-3 shadow-sm ${
                            isIncremental
                              ? 'border-border/85 bg-background'
                              : 'border-amber-500/30 bg-amber-500/8'
                          }`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1 space-y-1.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-medium text-foreground">
                                  {action.title}
                                </p>
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[11px] ${
                                    isIncremental
                                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                      : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                  }`}
                                >
                                  {action.toneLabel}
                                </span>
                              </div>
                              <p className="text-xs leading-5 text-muted-foreground">
                                {action.desc}
                              </p>
                              <p className="text-[11px] leading-5 text-muted-foreground/90">
                                {action.impact}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2 self-center">
                              <span
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] ${
                                  isIncremental
                                    ? 'border border-border/70 bg-muted text-foreground/75'
                                    : 'bg-amber-500/12 text-amber-700 dark:text-amber-300'
                                }`}
                              >
                                {isActive ? (
                                  <>
                                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                    处理中
                                  </>
                                ) : isIncremental ? (
                                  '直接执行'
                                ) : (
                                  '需确认'
                                )}
                              </span>
                            </div>
                            <Button
                              size="sm"
                              variant={isIncremental ? 'default' : 'outline'}
                              onClick={() => handleTriggerSync(actionKey)}
                              disabled={syncing || mutating || layoutResetting}
                              className={
                                isIncremental
                                  ? ''
                                  : 'border-amber-500/30 text-amber-700 hover:bg-amber-500/10 hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200'
                              }
                            >
                              {isActive ? (
                                <>
                                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                  {`${action.buttonLabel}中...`}
                                </>
                              ) : (
                                action.buttonLabel
                              )}
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {syncFeedback?.source === group.source ? (
                    <div
                      className={`break-all rounded-lg border px-3 py-2 text-xs leading-5 ${
                        syncFeedback.tone === 'error'
                          ? 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
                          : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      }`}
                      role={syncFeedback.tone === 'error' ? 'alert' : 'status'}
                      aria-live="polite"
                    >
                      {syncFeedback.text}
                    </div>
                  ) : null}
                </div>
              )
            })}

            <SettingCard
              label="图标布局重置"
              desc="重置后会恢复默认图标布局，并清空当前创建的文件夹和 Dock 排布，不会删除图标快照记录。"
            >
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetLaunchpadIcons}
                  disabled={layoutResetting || syncing || mutating}
                >
                  {layoutResetting ? '重置中...' : '重置图标'}
                </Button>
              </div>
              {layoutResetText ? (
                <p className="break-all text-xs text-muted-foreground">{layoutResetText}</p>
              ) : null}
            </SettingCard>
          </div>

          <div className="min-w-0 space-y-3 rounded-lg border border-border/90 bg-card p-4 shadow-sm">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center xl:flex-1">
                <Input
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  placeholder="搜索图标名称或路径"
                  className="w-full md:min-w-[220px] md:flex-1 xl:max-w-md"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void refreshIconManagerList()}
                  disabled={listLoading || syncing || mutating}
                  className="w-full md:w-auto"
                >
                  刷新列表
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">展示方式</span>
                <div className="inline-flex rounded-lg border border-border/90 bg-background p-1 shadow-sm">
                  {ICON_MANAGER_VIEW_MODE_OPTIONS.map(option => {
                    const selected = viewMode === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => handleViewModeChange(option.value)}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                          selected
                            ? 'bg-accent text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        {option.icon}
                        <span>{option.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {ICON_VISIBILITY_FILTER_OPTIONS.map(opt => (
                <OptionButton
                  key={opt.value}
                  label={opt.label}
                  selected={visibilityFilter === opt.value}
                  onClick={() => setVisibilityFilter(opt.value)}
                />
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {ICON_SOURCE_FILTER_OPTIONS.map(opt => (
                <OptionButton
                  key={opt.value}
                  label={opt.label}
                  selected={sourceFilter === opt.value}
                  onClick={() => setSourceFilter(opt.value)}
                />
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              图标总数 {allIcons.length} 项，当前筛选结果 {filteredIcons.length} 项，当前为
              {viewMode === 'list' ? '列表' : '宫格'}展示。
            </p>

            {managerErrorText ? (
              <p className="break-all text-sm text-red-600 dark:text-red-300">{managerErrorText}</p>
            ) : null}
            {managerResultText ? (
              <p className="max-w-3xl break-all text-sm text-muted-foreground" aria-live="polite">
                {managerResultText}
              </p>
            ) : null}

            <div
              className={
                viewMode === 'grid'
                  ? 'grid items-start gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,9.5rem),1fr))]'
                  : 'space-y-2'
              }
            >
              {listLoading ? (
                <p className="text-sm text-muted-foreground">图标列表加载中...</p>
              ) : filteredIcons.length === 0 ? (
                <p className="text-sm text-muted-foreground">当前筛选条件下没有图标。</p>
              ) : (
                filteredIcons.map(icon => {
                  const sourceLabel = icon.source === 'desktop' ? '桌面' : '自定义应用'
                  const compactPathLabel = getPathLeaf(icon.target_path || icon.path) || '-'
                  const sourceBadgeClass =
                    icon.source === 'desktop'
                      ? 'border-blue-500/30 bg-blue-500/15 text-blue-700 dark:text-blue-300'
                      : 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  const visibilityBadgeClass = icon.hidden
                    ? 'border-orange-500/30 bg-orange-500/15 text-orange-700 dark:text-orange-300'
                    : 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  if (viewMode === 'grid') {
                    return (
                      <div
                        key={`${icon.source}:${icon.id}`}
                        title={`路径：${icon.path}\n目标：${icon.target_path || '-'}`}
                        className="min-w-0 self-start rounded-md border border-border/85 bg-background p-2.5 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/70 bg-muted/35">
                            {icon.icon_base64 ? (
                              <img
                                src={icon.icon_base64}
                                alt={icon.name}
                                className="h-full w-full object-contain"
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                                无图标
                              </div>
                            )}
                          </div>

                          <div className="flex min-w-0 flex-wrap justify-end gap-1">
                            <span
                              className={`rounded border px-1.5 py-0.5 text-[10px] leading-none ${sourceBadgeClass}`}
                            >
                              {sourceLabel}
                            </span>
                            <span
                              className={`rounded border px-1.5 py-0.5 text-[10px] leading-none ${visibilityBadgeClass}`}
                            >
                              {icon.hidden ? '隐藏' : '未隐藏'}
                            </span>
                          </div>
                        </div>

                        <div className="mt-2 min-w-0 space-y-1">
                          <p
                            className="min-w-0 overflow-hidden text-left text-sm font-medium leading-4 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [overflow-wrap:anywhere]"
                            title={icon.name || '未命名'}
                          >
                            {icon.name || '未命名'}
                          </p>
                          <p
                            className="min-w-0 truncate text-left text-[11px] text-muted-foreground"
                            title={icon.target_path || icon.path}
                          >
                            {compactPathLabel}
                          </p>
                        </div>

                        <div className="mt-2 grid grid-cols-2 gap-1.5">
                          {icon.hidden ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setPendingMutation({ type: 'unhide', icon })}
                              disabled={syncing || mutating}
                              className="h-7 min-w-0 overflow-hidden px-2 text-[11px]"
                            >
                              显示
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setPendingMutation({ type: 'hide', icon })}
                              disabled={syncing || mutating}
                              className="h-7 min-w-0 overflow-hidden px-2 text-[11px]"
                            >
                              隐藏
                            </Button>
                          )}
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setPendingMutation({ type: 'delete', icon })}
                            disabled={syncing || mutating}
                            className="h-7 min-w-0 overflow-hidden px-2 text-[11px]"
                          >
                            删除
                          </Button>
                        </div>
                      </div>
                    )
                  }

                  return (
                    <div
                      key={`${icon.source}:${icon.id}`}
                      title={`路径：${icon.path}\n目标：${icon.target_path || '-'}`}
                      className="rounded-md border border-border/85 bg-background p-3 shadow-sm"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start">
                        <div
                          className={cn(
                            'flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/70 bg-muted/35'
                          )}
                        >
                          {icon.icon_base64 ? (
                            <img
                              src={icon.icon_base64}
                              alt={icon.name}
                              className="h-full w-full object-contain"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                              无图标
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className={cn('truncate text-sm font-medium')}>
                              {icon.name || '未命名'}
                            </p>
                            <span
                              className={`rounded border px-2 py-0.5 text-[11px] ${sourceBadgeClass}`}
                            >
                              {sourceLabel}
                            </span>
                            <span
                              className={`rounded border px-2 py-0.5 text-[11px] ${visibilityBadgeClass}`}
                            >
                              {icon.hidden ? '隐藏' : '未隐藏'}
                            </span>
                          </div>
                          <div className="space-y-1">
                            <p className="break-all text-xs text-muted-foreground md:truncate">
                              路径：{icon.path}
                            </p>
                            <p className="break-all text-xs text-muted-foreground md:truncate">
                              目标：{icon.target_path || '-'}
                            </p>
                          </div>
                        </div>

                        <div className="flex w-full shrink-0 flex-wrap gap-2 md:w-auto md:justify-end">
                          {icon.hidden ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setPendingMutation({ type: 'unhide', icon })}
                              disabled={syncing || mutating}
                              className="flex-1 md:flex-none"
                            >
                              取消隐藏
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setPendingMutation({ type: 'hide', icon })}
                              disabled={syncing || mutating}
                              className="flex-1 md:flex-none"
                            >
                              隐藏
                            </Button>
                          )}
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setPendingMutation({ type: 'delete', icon })}
                            disabled={syncing || mutating}
                            className="flex-1 md:flex-none"
                          >
                            删除
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {pendingAction ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/22 p-4 backdrop-blur-[1px] dark:bg-black/45">
          <div className="w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-xl">
            <h3 className="text-base font-semibold">
              {ICON_SYNC_ACTIONS[pendingAction].confirmTitle}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {ICON_SYNC_ACTIONS[pendingAction].confirmDesc}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPendingAction(null)}
                disabled={syncing}
              >
                取消
              </Button>
              <Button size="sm" onClick={handleConfirmSync} disabled={syncing}>
                {syncing
                  ? `${ICON_SYNC_ACTIONS[pendingAction].buttonLabel}中...`
                  : ICON_SYNC_ACTIONS[pendingAction].confirmLabel}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingMutation && mutationDialogText ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/22 p-4 backdrop-blur-[1px] dark:bg-black/45">
          <div className="w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-xl">
            <h3 className="text-base font-semibold">{mutationDialogText.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{mutationDialogText.desc}</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPendingMutation(null)}
                disabled={mutating}
              >
                取消
              </Button>
              <Button
                variant={mutationDialogText.confirmVariant}
                size="sm"
                onClick={handleConfirmMutation}
                disabled={mutating}
              >
                {mutating ? '处理中...' : mutationDialogText.confirmLabel}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

function AboutPanel() {
  const [appInfo, setAppInfo] = useState<AboutAppInfo>(ABOUT_APP_INFO_FALLBACK)
  const [statusText, setStatusText] = useState('正在读取应用信息...')
  const [copied, setCopied] = useState(false)
  const [launchpadShortcutMeta, setLaunchpadShortcutMeta] = useState(
    `全局快捷键 ${formatShortcutForDisplay(DEFAULT_LAUNCHPAD_SHORTCUT)}`
  )

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

        setStatusText(
          failedCount === 0
            ? '版本、运行时与支持入口已准备好。'
            : '部分应用信息未能读取，已使用当前项目的回退值。'
        )
      })
      .catch(error => {
        if (disposed) return
        setStatusText(`读取应用信息失败：${String(error)}`)
      })

    void getSetting('launchpadShortcut')
      .then(shortcut => {
        if (disposed) return
        setLaunchpadShortcutMeta(`全局快捷键 ${formatShortcutForDisplay(shortcut)}`)
      })
      .catch(error => {
        if (disposed) return
        console.error('Failed to load launchpad shortcut for about panel:', error)
        setLaunchpadShortcutMeta('全局快捷键可自定义')
      })

    return () => {
      disposed = true
    }
  }, [])

  useEffect(() => {
    if (!copied) return

    const timeout = window.setTimeout(() => {
      setCopied(false)
    }, 1800)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [copied])

  const openExternalLink = useCallback(async (url: string, label: string) => {
    try {
      await openUrl(url)
      setStatusText(`已打开${label}。`)
    } catch (error) {
      setStatusText(`打开${label}失败：${String(error)}`)
    }
  }, [])

  const handleCopyDiagnostic = useCallback(async () => {
    if (!navigator.clipboard?.writeText) {
      setStatusText('当前环境不支持复制诊断信息。')
      return
    }

    const diagnosticText = [
      `${appInfo.name} v${appInfo.version}`,
      `Identifier: ${appInfo.identifier}`,
      `Runtime: Tauri ${appInfo.tauriVersion}`,
      'Search dependency: Installed Everything',
      'Update channel: GitHub Releases latest.json',
    ].join('\n')

    try {
      await navigator.clipboard.writeText(diagnosticText)
      setCopied(true)
      setStatusText('已复制版本与诊断信息。')
    } catch (error) {
      setStatusText(`复制诊断信息失败：${String(error)}`)
    }
  }, [appInfo])

  const infoCards = [
    {
      label: '当前版本',
      value: `v${appInfo.version}`,
      hint: '用于定位发布说明与更新状态。',
      mono: true,
    },
    {
      label: '应用标识',
      value: appInfo.identifier,
      hint: '排查安装、权限或 updater 配置时会用到。',
      mono: true,
    },
    {
      label: '运行时',
      value: `Tauri ${appInfo.tauriVersion}`,
      hint: '当前桌面容器与应用壳版本。',
      mono: false,
    },
    {
      label: '技术栈',
      value: 'React 19 · Vite 7 · Rust',
      hint: '界面、构建与本地能力运行在同一桌面应用里。',
      mono: false,
    },
  ]

  const featureCards = [
    {
      title: '启动台',
      description: '用统一入口承接桌面常用应用，适合键盘优先和快速唤起场景。',
      meta: launchpadShortcutMeta,
    },
    {
      title: '文件搜索',
      description: '搜索能力依赖已安装的 Everything，状态异常时会在设置页明确提示。',
      meta: 'Installed Everything only',
    },
    {
      title: '图标管理',
      description: '支持桌面与自定义应用两套来源的增量与全量同步，并保留隐藏与整理能力。',
      meta: '桌面 + 自定义应用',
    },
    {
      title: '应用更新',
      description: '更新页读取 GitHub Releases 的 updater 清单，下载与安装过程可见。',
      meta: 'GitHub Releases latest.json',
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
              桌面启动、搜索与整理工具
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <Logo iconSize={36} textSize="lg" />
                <span className="rounded-full border border-border/80 bg-card px-3 py-1 font-mono text-xs text-foreground/75 shadow-sm">
                  v{appInfo.version}
                </span>
              </div>
              <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                DesktopGo 把桌面启动、文件搜索、图标整理和应用更新收进一个统一入口里。
                关于页现在直接暴露版本、运行时和项目入口，方便你确认当前构建、提交反馈，或跳转查看发布记录。
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:w-[24rem]">
            <div className="rounded-2xl border border-border/85 bg-card p-4 shadow-sm">
              <LogoText size="sm" />
              <p className="mt-2 text-base font-medium text-foreground">本地优先</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                没有账号系统；主要设置、布局和搜索配置都保存在本地环境。
              </p>
            </div>
            <div className="rounded-2xl border border-border/85 bg-card p-4 shadow-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">支持入口</p>
              <p className="mt-2 text-base font-medium text-foreground">反馈直达项目</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                仓库、Issue 和 Release 入口都放在这里，定位问题时不需要再找路径。
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {infoCards.map(card => (
          <article
            key={card.label}
            className="rounded-2xl border border-border/85 bg-card p-4 shadow-sm transition-colors hover:bg-accent"
          >
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {card.label}
            </p>
            <p
              className={`mt-3 text-base font-semibold text-foreground ${
                card.mono ? 'break-all font-mono text-sm' : ''
              }`}
            >
              {card.value}
            </p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{card.hint}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.25fr_0.95fr]">
        <div className="space-y-4 rounded-3xl border border-border/90 bg-card p-5 shadow-sm">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">功能概览</p>
            <h3 className="text-lg font-semibold text-foreground">当前构建包含的核心能力</h3>
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
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">项目入口</p>
            <h3 className="text-lg font-semibold text-foreground">仓库、发布和反馈入口</h3>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void openExternalLink(ABOUT_REPOSITORY_URL, 'GitHub 仓库')}>
              <Github className="h-4 w-4" />
              GitHub 仓库
            </Button>
            <Button
              variant="secondary"
              onClick={() => void openExternalLink(ABOUT_ISSUES_URL, '问题反馈')}
            >
              <Bug className="h-4 w-4" />
              提交问题
            </Button>
            <Button
              variant="outline"
              onClick={() => void openExternalLink(ABOUT_RELEASES_URL, '发布说明')}
            >
              <FileText className="h-4 w-4" />
              发布说明
            </Button>
            <Button variant="outline" onClick={() => void handleCopyDiagnostic()}>
              {copied ? <CopyCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? '已复制' : '复制诊断'}
            </Button>
          </div>

          <div className="rounded-2xl border border-border/85 bg-background p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <Package2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">更新通道</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  当前 updater 设计为从 GitHub Releases 读取{' '}
                  <span className="font-mono">latest.json</span> 并完成签名校验与安装流程。
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border/85 bg-background p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">诊断建议</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  提交问题前先复制上面的诊断信息，至少带上版本号、应用标识符和 Tauri 运行时版本。
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void openExternalLink(ABOUT_REPOSITORY_URL, '项目主页')}
            className="group flex w-full items-center justify-between rounded-2xl border border-border/85 bg-background px-4 py-3 text-left shadow-sm transition-colors hover:bg-accent"
          >
            <div>
              <p className="text-sm font-medium text-foreground">项目主页</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {ABOUT_REPOSITORY_URL.replace('https://', '')}
              </p>
            </div>
            <ExternalLink className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </button>
        </div>
      </section>

      <p className="text-sm text-muted-foreground">{statusText}</p>
    </div>
  )
}

export function Settings() {
  const [activeNav, setActiveNav] = useState<NavItem>('settings')
  const [isMaximized, setIsMaximized] = useState(false)
  const isClosingRef = useRef(false)

  const activeNavItem = NAV_ITEMS.find(item => item.key === activeNav) ?? NAV_ITEMS[0]

  const syncWindowState = useCallback(async () => {
    try {
      setIsMaximized(await getCurrentWindow().isMaximized())
    } catch (e) {
      console.error('Failed to sync settings window state:', e)
    }
  }, [])

  const closeSettingsWindow = useCallback(async () => {
    if (isClosingRef.current) return

    isClosingRef.current = true
    try {
      await getCurrentWindow().destroy()
    } catch (e) {
      console.error('Failed to close settings window:', e)
    } finally {
      isClosingRef.current = false
    }
  }, [])

  useEffect(() => {
    let disposed = false
    let unlistenResize: (() => void) | null = null
    let unlistenClose: (() => void) | null = null

    void syncWindowState()

    void getCurrentWindow()
      .onResized(() => {
        void syncWindowState()
      })
      .then(fn => {
        if (disposed) {
          fn()
          return
        }
        unlistenResize = fn
      })

    void getCurrentWindow()
      .onCloseRequested(event => {
        if (isClosingRef.current) return
        event.preventDefault()
        void closeSettingsWindow()
      })
      .then(fn => {
        if (disposed) {
          fn()
          return
        }
        unlistenClose = fn
      })

    return () => {
      disposed = true
      unlistenResize?.()
      unlistenClose?.()
    }
  }, [closeSettingsWindow, syncWindowState])

  const handleWindowDragStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    void getCurrentWindow()
      .startDragging()
      .catch(e => console.error('Failed to start dragging settings window:', e))
  }

  const handleMinimizeWindow = () => {
    void getCurrentWindow()
      .minimize()
      .catch(e => console.error('Failed to minimize settings window:', e))
  }

  const handleToggleMaximizeWindow = () => {
    void getCurrentWindow()
      .toggleMaximize()
      .then(() => syncWindowState())
      .catch(e => console.error('Failed to toggle settings window size:', e))
  }

  return (
    <div className="settings-shell flex h-screen w-screen flex-col bg-background text-foreground">
      <header className="flex h-12 items-center gap-3 border-b border-border/90 bg-card px-4 shadow-sm">
        <div
          onPointerDown={handleWindowDragStart}
          onDoubleClick={handleToggleMaximizeWindow}
          className="flex min-w-0 flex-1 items-center gap-3 cursor-grab active:cursor-grabbing"
        >
          <Logo iconSize={20} textSize="sm" className="shrink-0" />
          <span className="h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
          <p className="truncate text-sm text-muted-foreground">设置 / {activeNavItem.label}</p>
        </div>

        <div className="flex items-center gap-1">
          <WindowControlButton label="最小化" onClick={handleMinimizeWindow}>
            <Minus className="h-4 w-4" />
          </WindowControlButton>
          <WindowControlButton
            label={isMaximized ? '还原窗口' : '最大化'}
            onClick={handleToggleMaximizeWindow}
          >
            {isMaximized ? <Copy className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
          </WindowControlButton>
          <WindowControlButton
            label="关闭"
            tone="danger"
            onClick={() => void closeSettingsWindow()}
          >
            <X className="h-4 w-4" />
          </WindowControlButton>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="flex w-48 flex-col border-r border-border/90 bg-card px-4 py-3 shadow-sm">
          <ul className="flex flex-col gap-1">
            {NAV_ITEMS.map(item => (
              <li key={item.key}>
                <button
                  onClick={() => setActiveNav(item.key)}
                  className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors cursor-pointer ${
                    activeNav === item.key
                      ? 'border-border/90 bg-background text-foreground shadow-sm font-medium'
                      : 'border-transparent text-muted-foreground hover:border-border/70 hover:bg-accent hover:text-foreground'
                  }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <main className="settings-main-scroll min-h-0 flex-1 overflow-y-auto px-6 py-6 xl:px-8">
          <div className={cn('mx-auto w-full', NAV_CONTENT_WIDTH[activeNav])}>
            {activeNav === 'settings' && <SettingsPanel />}
            {activeNav === 'search' && <SearchSettingsPanel />}
            {activeNav === 'iconManager' && <IconManagerPanel />}
            {activeNav === 'update' && <UpdatePanel />}
            {activeNav === 'about' && <AboutPanel />}
          </div>
        </main>
      </div>
    </div>
  )
}
