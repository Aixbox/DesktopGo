import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { getIdentifier, getName, getTauriVersion, getVersion } from '@tauri-apps/api/app'
import { invoke } from '@tauri-apps/api/core'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { openUrl } from '@tauri-apps/plugin-opener'
import { filterIconManagerItems, getPathLeaf, type IconVisibilityFilter } from '@/lib/iconManager'
import { cn } from '@/lib/utils'
import { useIconStore } from '@/stores/iconStore'
import { loadCustomNames } from '@/lib/customNamesStore'
import { translate, useI18n } from '@/lib/i18n'
import {
  THEME_MODE_SYNC_EVENT,
  applyTheme,
  resolveEffectiveThemeMode,
  saveTheme,
} from '@/lib/theme'
import { applyWindowStyle, saveWindowStyle } from '@/lib/windowStyle'
import { DEFAULT_LAUNCHPAD_SHORTCUT, getSetting, setSetting } from '@/lib/settingsStore'
import { DEFAULT_LAUNCHPAD_OPEN_FOCUS_TARGET } from '@/lib/launchpadOpenFocus'
import {
  DEFAULT_AI_CONFIG,
  isAiConfigReady,
  loadAiConfig,
  saveAiConfig,
  type AiConfig,
} from '@/lib/aiConfigStore'
import { MAIN_WINDOW_APPEARANCE_SYNC_EVENT } from '@/lib/windowPersistent'
import {
  LAUNCHPAD_LAYOUT_RESET_EVENT,
  resetLaunchpadLayout,
} from '@/components/icon-grid/services/layoutStore'
import { UpdatePanel } from '@/components/settings/UpdatePanel'
import { Logo, LogoText } from '@/components/Logo'
import { SearchSettingsPanel } from '@/components/search/SearchSettingsPanel'
import { AiOrganizePanel } from '@/components/ai/AiOrganizePanel'
import { AddIconDialog } from '@/components/icons/AddIconDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  SettingGroup,
  SettingCard,
  OptionButton,
  ToggleRow,
} from '@/components/ui/setting-components'
import { useToast } from '@/components/ui/toast'
import type {
  IconManagerItem,
  IconManagerViewMode,
  IconMutationTarget,
  InvalidIconEntry,
  IconSize,
  AppLanguage,
  LaunchpadOpenFocusTarget,
  ThemeMode,
  TitleLineCount,
  WindowMode,
  WindowStyle,
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
  Bot,
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
  Upload,
  SearchX,
  Trash2,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react'

type NavItem = 'settings' | 'search' | 'iconManager' | 'ai' | 'update' | 'about'

const NAV_ITEMS: { key: NavItem; label: string; icon: ReactNode }[] = [
  { key: 'settings', label: '设置', icon: <SettingsIcon className="w-4 h-4" /> },
  { key: 'search', label: '搜索', icon: <Search className="w-4 h-4" /> },
  { key: 'iconManager', label: '图标库', icon: <Images className="w-4 h-4" /> },
  { key: 'ai', label: 'AI 助手', icon: <Bot className="w-4 h-4" /> },
  { key: 'update', label: '更新', icon: <RefreshCw className="w-4 h-4" /> },
  { key: 'about', label: '关于', icon: <Info className="w-4 h-4" /> },
]

const NAV_CONTENT_WIDTH: Record<NavItem, string> = {
  settings: 'max-w-[1120px]',
  search: 'max-w-[1180px]',
  iconManager: 'max-w-[1240px]',
  ai: 'max-w-[1120px]',
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

const WINDOW_STYLE_OPTIONS: {
  label: string
  value: WindowStyle
  description: string
}[] = [
  {
    label: '柔光玻璃',
    value: 'default',
    description: 'DesktopGo 自带的柔和玻璃层次，观感更稳定。',
  },
  {
    label: '亚克力',
    value: 'nativeAcrylic',
    description: '更接近 Windows 原生磨砂亚克力，背景更透，仅主启动台窗口生效。',
  },
]

const LANGUAGE_OPTIONS: { label: string; value: AppLanguage }[] = [
  { label: '简体中文', value: 'zh' },
  { label: 'English', value: 'en' },
]

const LAUNCHPAD_OPEN_FOCUS_OPTIONS: { label: string; value: LaunchpadOpenFocusTarget }[] = [
  { label: '搜索栏', value: 'search' },
  { label: '直接打开', value: 'launchpad' },
]

const LAUNCHPAD_OPEN_FOCUS_DESCRIPTIONS: Record<LaunchpadOpenFocusTarget, string> = {
  search: '每次打开启动台后，搜索栏会立即获得焦点，可以直接输入关键词。',
  launchpad: '每次打开启动台后，不自动激活搜索栏，只显示当前启动台界面。',
}

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
let pendingWindowPersistentSync: Promise<void> = Promise.resolve()
let skipReturnToMainOnClose = false

const ICON_VISIBILITY_FILTER_OPTIONS: { label: string; value: IconVisibilityFilter }[] = [
  { label: '全部', value: 'all' },
  { label: '未隐藏', value: 'visible' },
  { label: '隐藏', value: 'hidden' },
]

const ICON_MANAGER_VIEW_MODE_OPTIONS: {
  label: string
  value: IconManagerViewMode
  icon: ReactNode
}[] = [
  { label: '列表', value: 'list', icon: <List className="h-3.5 w-3.5" /> },
  { label: '宫格', value: 'grid', icon: <LayoutGrid className="h-3.5 w-3.5" /> },
]

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
    return translate('未设置')
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

function buildShortcutFromKeyDown(event: KeyboardEvent<HTMLInputElement>) {
  const hasModifier = event.ctrlKey || event.altKey || event.shiftKey

  if (!hasModifier) {
    return {
      error: translate('快捷键至少需要一个修饰键，例如 Ctrl + Space。'),
    }
  }

  if (!event.code || event.code === 'Unidentified' || SHORTCUT_MODIFIER_CODES.has(event.code)) {
    return {
      error: translate('请在按住修饰键后，再按一个主键，例如 Space、K 或 F1。'),
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
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-no-window-drag="true"
      onPointerDown={event => event.stopPropagation()}
      onDoubleClick={event => event.stopPropagation()}
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
  const { language, setLanguage } = useI18n()
  const { iconSize, windowMode, titleLineCount, dockEnabled, setDockEnabled } = useIconStore()
  const [themeMode, setThemeMode] = useState<ThemeMode>('system')
  const [windowStyle, setWindowStyle] = useState<WindowStyle>('default')
  const [windowPersistentEnabled, setWindowPersistentEnabled] = useState(false)
  const [launchOnStartupEnabled, setLaunchOnStartupEnabled] = useState(true)
  const [isSavingLaunchOnStartup, setIsSavingLaunchOnStartup] = useState(false)
  const [launchpadShortcut, setLaunchpadShortcut] = useState(DEFAULT_LAUNCHPAD_SHORTCUT)
  const [launchpadOpenFocusTarget, setLaunchpadOpenFocusTarget] =
    useState<LaunchpadOpenFocusTarget>(DEFAULT_LAUNCHPAD_OPEN_FOCUS_TARGET)
  const [launchpadShortcutDraft, setLaunchpadShortcutDraft] = useState(
    formatShortcutForInput(DEFAULT_LAUNCHPAD_SHORTCUT)
  )
  const [isRecordingShortcut, setIsRecordingShortcut] = useState(false)
  const [isSavingShortcut, setIsSavingShortcut] = useState(false)
  const shortcutInputRef = useRef<HTMLInputElement | null>(null)
  const toast = useToast()

  useEffect(() => {
    void (async () => {
      try {
        const [
          savedIconSize,
          savedWindowMode,
          savedTitleLineCount,
          savedDockEnabled,
          savedThemeMode,
          savedWindowStyle,
          savedWindowPersistent,
          savedLaunchOnStartup,
          savedLaunchpadShortcut,
          savedLaunchpadOpenFocusTarget,
        ] = await Promise.all([
          getSetting('iconSize'),
          getSetting('windowMode'),
          getSetting('titleLineCount'),
          getSetting('dockEnabled'),
          getSetting('themeMode'),
          getSetting('windowStyle'),
          getSetting('windowPersistent'),
          getSetting('launchOnStartup'),
          getSetting('launchpadShortcut'),
          getSetting('launchpadOpenFocusTarget'),
        ])

        let resolvedLaunchOnStartup = savedLaunchOnStartup
        try {
          const actualLaunchOnStartup = await invoke<boolean>('get_launch_on_startup_enabled')
          resolvedLaunchOnStartup = actualLaunchOnStartup

          if (actualLaunchOnStartup !== savedLaunchOnStartup) {
            void setSetting('launchOnStartup', actualLaunchOnStartup).catch(error =>
              console.error('Failed to sync launch on startup setting:', error)
            )
          }
        } catch (error) {
          console.error('Failed to load launch on startup state:', error)
          toast.error(translate('读取系统开机自启状态失败，已回退到本地设置。'), {
            key: 'settings-launch-on-startup',
            title: translate('开机自启'),
          })
        }

        useIconStore.setState({
          iconSize: savedIconSize,
          windowMode: savedWindowMode,
          titleLineCount: savedTitleLineCount,
          dockEnabled: savedDockEnabled,
        })
        setThemeMode(savedThemeMode)
        setWindowStyle(savedWindowStyle)
        setWindowPersistentEnabled(savedWindowPersistent)
        setLaunchOnStartupEnabled(resolvedLaunchOnStartup)
        setLaunchpadShortcut(savedLaunchpadShortcut)
        setLaunchpadOpenFocusTarget(savedLaunchpadOpenFocusTarget)
        setLaunchpadShortcutDraft(formatShortcutForInput(savedLaunchpadShortcut))
      } catch (e) {
        console.error('Failed to load settings:', e)
        toast.error(translate('加载设置失败：{error}', { error: String(e) }), {
          key: 'settings-general',
          title: translate('设置'),
        })
      } finally {
        void getCurrentWindow().show()
      }
    })()
  }, [toast])

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

  const handleWindowPersistent = (value: boolean) => {
    const previousValue = windowPersistentEnabled
    setWindowPersistentEnabled(value)
    applyWindowStyle(windowStyle, value)
    skipReturnToMainOnClose = !value
    const task = (async () => {
      try {
        await setSetting('windowPersistent', value)
        await invoke('sync_window_persistent_state', { enabled: value })
      } catch (error) {
        console.error('Failed to save window persistent state:', error)
        setWindowPersistentEnabled(previousValue)
        applyWindowStyle(windowStyle, previousValue)
        skipReturnToMainOnClose = !previousValue
        void setSetting('windowPersistent', previousValue).catch(rollbackError => {
          console.error('Failed to rollback window persistent state:', rollbackError)
        })
        toast.error(translate('保存窗口常驻失败：{error}', { error: String(error) }), {
          key: 'settings-window-persistent',
          title: translate('窗口常驻'),
        })
      }
    })()
    pendingWindowPersistentSync = task.catch(() => {
      // 关闭设置窗口前会等待当前同步链结束，这里吞掉异常，避免把 close 链路也打断。
    })
  }

  const handleLaunchpadOpenFocusTarget = (value: LaunchpadOpenFocusTarget) => {
    const previousValue = launchpadOpenFocusTarget
    setLaunchpadOpenFocusTarget(value)
    void setSetting('launchpadOpenFocusTarget', value).catch(error => {
      console.error('Failed to save launchpad open focus target:', error)
      setLaunchpadOpenFocusTarget(previousValue)
      toast.error(translate('保存启动台默认焦点失败：{error}', { error: String(error) }), {
        key: 'settings-launchpad-open-focus',
        title: translate('打开启动台时默认焦点'),
      })
    })
  }

  const syncMainWindowAppearance = useCallback(async () => {
    try {
      const mainWindow = await WebviewWindow.getByLabel('main')
      if (!mainWindow) {
        return
      }

      await mainWindow.emit(MAIN_WINDOW_APPEARANCE_SYNC_EVENT)
    } catch (error) {
      console.error('Failed to sync main window appearance:', error)
    }
  }, [])

  const handleThemeMode = async (value: ThemeMode) => {
    setThemeMode(value)
    applyTheme(value, windowStyle)

    try {
      await saveTheme(value)
      void syncMainWindowAppearance()
    } catch (e) {
      console.error('Failed to save theme mode:', e)
    }

    if (windowStyle === 'nativeAcrylic') {
      void invoke('apply_window_style', {
        style: windowStyle,
        themeMode: resolveEffectiveThemeMode(value, windowStyle),
      }).catch(error => {
        console.error('Failed to refresh native acrylic after theme change:', error)
      })
    }
  }

  useEffect(() => {
    const handleThemeModeSync = (event: Event) => {
      const nextMode = (event as CustomEvent<{ mode?: ThemeMode }>).detail?.mode
      if (!nextMode) return
      setThemeMode(nextMode)
    }

    window.addEventListener(THEME_MODE_SYNC_EVENT, handleThemeModeSync)
    return () => {
      window.removeEventListener(THEME_MODE_SYNC_EVENT, handleThemeModeSync)
    }
  }, [])

  const handleWindowStyle = async (value: WindowStyle) => {
    const previousStyle = windowStyle
    setWindowStyle(value)
    applyWindowStyle(value, windowPersistentEnabled)
    applyTheme(themeMode, value)

    try {
      await saveWindowStyle(value)
    } catch (error) {
      setWindowStyle(previousStyle)
      applyWindowStyle(previousStyle, windowPersistentEnabled)
      applyTheme(themeMode, previousStyle)
      toast.error(translate('保存主题风格失败：{error}', { error: String(error) }), {
        key: 'settings-window-style',
        title: translate('主题风格'),
      })
      return
    }

    try {
      await invoke('apply_window_style', {
        style: value,
        themeMode: resolveEffectiveThemeMode(themeMode, value),
      })
      void syncMainWindowAppearance()
    } catch (error) {
      console.error('Failed to apply window style:', error)
      toast.error(translate('应用主题风格失败：{error}', { error: String(error) }), {
        key: 'settings-window-style',
        title: translate('主题风格'),
      })
    }
  }

  const handleLaunchOnStartup = async (value: boolean) => {
    if (isSavingLaunchOnStartup) {
      return
    }

    setIsSavingLaunchOnStartup(true)

    try {
      const nextEnabled = await invoke<boolean>('update_launch_on_startup_enabled', {
        enabled: value,
      })

      setLaunchOnStartupEnabled(nextEnabled)
      toast.success(
        nextEnabled
          ? translate('已开启开机自启，Windows 登录后会自动启动 DesktopGo。')
          : translate('已关闭开机自启，Windows 登录后不会自动启动 DesktopGo。'),
        {
          key: 'settings-launch-on-startup',
          title: translate('开机自启'),
        }
      )
    } catch (error) {
      console.error('Failed to update launch on startup state:', error)
      toast.error(translate('更新开机自启失败：{error}', { error: String(error) }), {
        key: 'settings-launch-on-startup',
        title: translate('开机自启'),
      })
    } finally {
      setIsSavingLaunchOnStartup(false)
    }
  }

  const handleToggleShortcutRecording = () => {
    if (isRecordingShortcut) {
      setIsRecordingShortcut(false)
      return
    }

    setIsRecordingShortcut(true)
    toast.info(translate('开始录制快捷键，请按下新的组合键。'), {
      key: 'settings-shortcut',
      title: translate('启动台快捷键'),
    })
    window.setTimeout(() => {
      shortcutInputRef.current?.focus()
    }, 0)
  }

  const handleShortcutInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (isRecordingShortcut) {
      return
    }

    setLaunchpadShortcutDraft(event.target.value)
  }

  const handleShortcutInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
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
      return
    }

    const result = buildShortcutFromKeyDown(event)
    if (!result.shortcut) {
      toast.error(result.error ?? translate('未能识别该快捷键。'), {
        key: 'settings-shortcut',
        title: translate('启动台快捷键'),
      })
      return
    }

    setLaunchpadShortcutDraft(result.shortcut)
    setIsRecordingShortcut(false)
    toast.success(
      translate('已捕获 {shortcut}，点击“保存快捷键”后生效。', {
        shortcut: formatShortcutForDisplay(result.shortcut),
      }),
      {
        key: 'settings-shortcut',
        title: translate('启动台快捷键'),
      }
    )
  }

  const handleShortcutInputBlur = () => {
    if (!isRecordingShortcut) {
      return
    }

    setIsRecordingShortcut(false)
  }

  const handleResetLaunchpadShortcut = () => {
    setIsRecordingShortcut(false)
    setLaunchpadShortcutDraft(formatShortcutForInput(DEFAULT_LAUNCHPAD_SHORTCUT))
    toast.info(
      launchpadShortcut === DEFAULT_LAUNCHPAD_SHORTCUT
        ? translate('当前已经是默认快捷键：{shortcut}。', {
            shortcut: formatShortcutForDisplay(DEFAULT_LAUNCHPAD_SHORTCUT),
          })
        : translate('已恢复默认值 {shortcut}，点击“保存快捷键”后生效。', {
            shortcut: formatShortcutForDisplay(DEFAULT_LAUNCHPAD_SHORTCUT),
          }),
      {
        key: 'settings-shortcut',
        title: translate('启动台快捷键'),
      }
    )
  }

  const handleSaveLaunchpadShortcut = async () => {
    if (isSavingShortcut) {
      return
    }

    const previousShortcut = launchpadShortcut
    const draftShortcut = normalizeShortcutDraftText(launchpadShortcutDraft)

    if (!draftShortcut) {
      toast.error(translate('请输入快捷键，例如 Ctrl+Space 或 Ctrl+Alt+K。'), {
        key: 'settings-shortcut',
        title: translate('启动台快捷键'),
      })
      return
    }

    setIsRecordingShortcut(false)
    setIsSavingShortcut(true)

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
      toast.success(
        translate('启动台快捷键已更新为 {shortcut}。', {
          shortcut: formatShortcutForDisplay(normalizedShortcut),
        }),
        {
          key: 'settings-shortcut',
          title: translate('启动台快捷键'),
        }
      )
    } catch (error) {
      console.error('Failed to save launchpad shortcut:', error)
      toast.error(translate('保存快捷键失败：{error}', { error: String(error) }), {
        key: 'settings-shortcut',
        title: translate('启动台快捷键'),
      })
    } finally {
      setIsSavingShortcut(false)
    }
  }

  const normalizedDraftShortcut = normalizeShortcutDraftText(launchpadShortcutDraft)
  const currentShortcutInputValue = formatShortcutForInput(launchpadShortcut)
  const shortcutDraftChanged =
    normalizedDraftShortcut !== normalizeShortcutDraftText(currentShortcutInputValue)
  const shortcutDisplayValue = isRecordingShortcut
    ? translate('请按下新的组合键')
    : launchpadShortcutDraft
  const selectedWindowStyleOption =
    WINDOW_STYLE_OPTIONS.find(option => option.value === windowStyle) ?? WINDOW_STYLE_OPTIONS[0]

  return (
    <div className="space-y-8">
      <section aria-labelledby="settings-appearance-heading">
        <div className="mb-4 border-b border-border/70 pb-3">
          <h2 id="settings-appearance-heading" className="text-base font-semibold">
            {translate('语言与外观')}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {translate('设置界面语言、明暗模式和窗口材质。')}
          </p>
        </div>
        <SettingGroup>
          <SettingCard label={translate('界面语言')}>
            <div className="flex flex-wrap gap-2">
              {LANGUAGE_OPTIONS.map(option => (
                <OptionButton
                  key={option.value}
                  label={translate(option.label)}
                  selected={language === option.value}
                  onClick={() => {
                    void setLanguage(option.value)
                  }}
                />
              ))}
            </div>
          </SettingCard>

          <SettingCard label={translate('主题模式')}>
            <div className="flex flex-wrap gap-2">
              {THEME_OPTIONS.map(opt => (
                <OptionButton
                  key={opt.value}
                  label={translate(opt.label)}
                  selected={themeMode === opt.value}
                  onClick={() => handleThemeMode(opt.value)}
                />
              ))}
            </div>
          </SettingCard>

          <SettingCard label={translate('主题风格')}>
            <div className="flex flex-wrap gap-2">
              {WINDOW_STYLE_OPTIONS.map(option => (
                <OptionButton
                  key={option.value}
                  label={translate(option.label)}
                  selected={windowStyle === option.value}
                  onClick={() => void handleWindowStyle(option.value)}
                />
              ))}
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              {translate(selectedWindowStyleOption.description)}
            </p>
          </SettingCard>
        </SettingGroup>
      </section>

      <section aria-labelledby="settings-layout-heading">
        <div className="mb-4 border-b border-border/70 pb-3">
          <h2 id="settings-layout-heading" className="text-base font-semibold">
            {translate('图标与布局')}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {translate('调整图标、窗口和 Dock 的显示方式。')}
          </p>
        </div>
        <SettingGroup>
          <SettingCard label={translate('图标大小')}>
            <div className="flex flex-wrap gap-2">
              {ICON_SIZE_OPTIONS.map(opt => (
                <OptionButton
                  key={opt.value}
                  label={translate(opt.label)}
                  selected={iconSize === opt.value}
                  onClick={() => handleIconSize(opt.value)}
                />
              ))}
            </div>
          </SettingCard>

          <SettingCard label={translate('窗口大小')}>
            <div className="flex flex-wrap gap-2">
              {WINDOW_MODE_OPTIONS.map(opt => (
                <OptionButton
                  key={opt.value}
                  label={translate(opt.label)}
                  selected={windowMode === opt.value}
                  onClick={() => handleWindowMode(opt.value)}
                />
              ))}
            </div>
          </SettingCard>

          <SettingCard label={translate('标题行数')}>
            <div className="flex flex-wrap gap-2">
              {TITLE_LINE_OPTIONS.map(opt => (
                <OptionButton
                  key={opt.value}
                  label={translate(opt.label)}
                  selected={titleLineCount === opt.value}
                  onClick={() => handleTitleLineCount(opt.value)}
                />
              ))}
            </div>
          </SettingCard>

          <ToggleRow
            title={translate('显示 Dock 栏')}
            description={
              dockEnabled
                ? translate('当前已开启，Dock 会在启动台底部显示。')
                : translate('当前已关闭，Dock 中的图标会回到图标网格。')
            }
            checked={dockEnabled}
            onChange={handleDockEnabled}
          />
        </SettingGroup>
      </section>

      <section aria-labelledby="settings-startup-heading">
        <div className="mb-4 border-b border-border/70 pb-3">
          <h2 id="settings-startup-heading" className="text-base font-semibold">
            {translate('启动行为')}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {translate('控制窗口驻留和登录 Windows 后的启动方式。')}
          </p>
        </div>
        <SettingGroup>
          <ToggleRow
            title={translate('窗口常驻')}
            description={
              windowPersistentEnabled
                ? translate(
                    '当前已开启，点击窗口外部或全屏空白区域都不会自动隐藏，主窗口右上角会显示关闭按钮。'
                  )
                : translate(
                    '当前已关闭，点击窗口外部或全屏空白区域时，主窗口仍会按原来的行为自动隐藏。'
                  )
            }
            checked={windowPersistentEnabled}
            onChange={handleWindowPersistent}
          />
        </SettingGroup>
      </section>

      <section aria-labelledby="settings-shortcut-heading">
        <div className="mb-4 border-b border-border/70 pb-3">
          <h2 id="settings-shortcut-heading" className="text-base font-semibold">
            {translate('快捷键与焦点')}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {translate('设置唤起方式和主窗口打开后的默认位置。')}
          </p>
        </div>
        <SettingGroup>
          <ToggleRow
            title={translate('开机自启')}
            description={
              launchOnStartupEnabled
                ? translate('当前已开启，登录 Windows 后会自动启动 DesktopGo 并保持后台待命。')
                : translate('当前已关闭，登录 Windows 后需要手动启动 DesktopGo。')
            }
            checked={launchOnStartupEnabled}
            onChange={handleLaunchOnStartup}
            disabled={isSavingLaunchOnStartup}
          />

          <SettingCard
            label={translate('打开启动台快捷键')}
            desc={translate(
              '修改唤起启动台的全局快捷键。录制支持 Ctrl、Alt、Shift；像 Ctrl+Space 这种可能被系统或输入法拦截的组合，可以直接手动输入。'
            )}
          >
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-full border border-border/80 bg-background px-2.5 py-1">
                {translate('当前生效：{shortcut}', {
                  shortcut: formatShortcutForDisplay(launchpadShortcut),
                })}
              </span>
              {shortcutDraftChanged ? (
                <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-amber-700 dark:text-amber-300">
                  {translate('待保存：{shortcut}', {
                    shortcut: formatShortcutForDisplay(launchpadShortcutDraft),
                  })}
                </span>
              ) : null}
              {isRecordingShortcut ? (
                <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-blue-600 dark:text-blue-300">
                  {translate('录制中')}
                </span>
              ) : null}
            </div>

            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
              <Input
                ref={shortcutInputRef}
                value={shortcutDisplayValue}
                aria-label={translate('启动台快捷键')}
                placeholder={translate('可手动输入，例如 Ctrl+Space')}
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
                  {isRecordingShortcut ? translate('取消录制') : translate('录制快捷键')}
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleSaveLaunchpadShortcut()}
                  disabled={isSavingShortcut || isRecordingShortcut || !shortcutDraftChanged}
                >
                  {isSavingShortcut ? translate('保存中...') : translate('保存快捷键')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleResetLaunchpadShortcut}
                  disabled={isSavingShortcut}
                >
                  {translate('恢复默认')}
                </Button>
              </div>
            </div>

            <p className="text-xs leading-5 text-muted-foreground">
              {translate(
                '支持手动输入 `Ctrl+Space`、`Ctrl+Alt+K`、`Alt+Shift+P`。录制模式只识别 `Ctrl / Alt / Shift`。'
              )}
            </p>
          </SettingCard>

          <SettingCard
            label={translate('打开启动台时默认焦点')}
            desc={translate('选择唤起启动台后，默认把输入焦点放到搜索栏，还是仅显示主界面。')}
          >
            <div className="flex flex-wrap gap-2">
              {LAUNCHPAD_OPEN_FOCUS_OPTIONS.map(option => (
                <OptionButton
                  key={option.value}
                  label={translate(option.label)}
                  selected={launchpadOpenFocusTarget === option.value}
                  onClick={() => handleLaunchpadOpenFocusTarget(option.value)}
                />
              ))}
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              {translate(LAUNCHPAD_OPEN_FOCUS_DESCRIPTIONS[launchpadOpenFocusTarget])}
            </p>
          </SettingCard>
        </SettingGroup>
      </section>
    </div>
  )
}

function IconManagerPanel() {
  useI18n()

  const [pendingMutation, setPendingMutation] = useState<{
    type: 'hide' | 'unhide' | 'delete'
    icon: IconManagerItem
  } | null>(null)
  const [addIconDialogOpen, setAddIconDialogOpen] = useState(false)
  const [mutating, setMutating] = useState(false)
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [layoutResetting, setLayoutResetting] = useState(false)
  const [scanningInvalidIcons, setScanningInvalidIcons] = useState(false)
  const [deletingInvalidIcons, setDeletingInvalidIcons] = useState(false)
  const [invalidIconScanOpen, setInvalidIconScanOpen] = useState(false)
  const [invalidIconResults, setInvalidIconResults] = useState<InvalidIconEntry[]>([])
  const [selectedInvalidIconKeys, setSelectedInvalidIconKeys] = useState<string[]>([])
  const [allIcons, setAllIcons] = useState<IconManagerItem[]>([])
  const [viewMode, setViewMode] = useState<IconManagerViewMode>('list')
  const [searchInput, setSearchInput] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [visibilityFilter, setVisibilityFilter] = useState<IconVisibilityFilter>('all')
  const [aiOrganizeOpen, setAiOrganizeOpen] = useState(false)
  const [customNames, setCustomNames] = useState<Record<string, string>>({})
  const toast = useToast()

  const refreshIconManagerList = useCallback(async () => {
    setListLoading(true)
    setListError(null)
    try {
      const icons = await invoke<IconManagerItem[]>('get_icon_manager_items', { iconSize: 48 })
      setAllIcons(icons)
    } catch (e) {
      setListError(String(e))
      toast.error(translate('加载图标库失败：{error}', { error: String(e) }), {
        key: 'icon-library-list',
        title: translate('图标库'),
      })
    } finally {
      setListLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void getSetting('iconManagerViewMode')
      .then(setViewMode)
      .catch(e => console.error('Failed to load icon manager view mode:', e))
    void refreshIconManagerList()
    void loadCustomNames()
      .then(setCustomNames)
      .catch(e => console.error('Failed to load custom names:', e))
  }, [refreshIconManagerList])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchKeyword(searchInput.trim().toLowerCase())
    }, 200)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const filteredIcons = useMemo(
    () =>
      filterIconManagerItems(allIcons, {
        visibilityFilter,
        searchKeyword,
      }),
    [allIcons, visibilityFilter, searchKeyword]
  )

  const handleViewModeChange = (nextMode: IconManagerViewMode) => {
    if (nextMode === viewMode) return
    setViewMode(nextMode)
    void setSetting('iconManagerViewMode', nextMode).catch(e =>
      console.error('Failed to save icon manager view mode:', e)
    )
  }

  const notifyMainWindow = async () => {
    const mainWindow = await WebviewWindow.getByLabel('main')
    if (mainWindow) {
      await mainWindow.emit(LAUNCHPAD_LAYOUT_RESET_EVENT)
    }
  }

  const handleIconCreated = async () => {
    await refreshIconManagerList()
    await notifyMainWindow()
  }

  const undoVisibilityMutation = async (
    mutation: NonNullable<typeof pendingMutation> & { type: 'hide' | 'unhide' }
  ) => {
    setMutating(true)
    try {
      const command = mutation.type === 'hide' ? 'unhide_icons' : 'hide_icons'
      await invoke<number>(command, { targets: [{ id: mutation.icon.id }] })
      await refreshIconManagerList()
      await notifyMainWindow()
      toast.success(translate('操作已撤销。'), {
        key: 'icon-library-action',
        title: translate('图标库'),
      })
    } catch (error) {
      console.error('Failed to undo icon visibility change:', error)
      toast.error(translate('撤销失败，请刷新图标库后重试。'), {
        key: 'icon-library-action',
        title: translate('图标库'),
      })
    } finally {
      setMutating(false)
    }
  }

  const handleConfirmMutation = async () => {
    if (!pendingMutation) return
    const mutation = pendingMutation
    setMutating(true)
    try {
      const targets: IconMutationTarget[] = [{ id: mutation.icon.id }]
      const command =
        mutation.type === 'unhide'
          ? 'unhide_icons'
          : mutation.type === 'delete'
            ? 'delete_icons'
            : 'hide_icons'
      const actionLabel =
        mutation.type === 'unhide' ? '显示' : mutation.type === 'delete' ? '移出图标库' : '隐藏'
      const affected = await invoke<number>(command, { targets })
      const visibilityMutation =
        mutation.type === 'delete' ? null : { type: mutation.type, icon: mutation.icon }
      await refreshIconManagerList()
      await notifyMainWindow()
      toast.success(
        translate('{action}完成，影响 {count} 项。', {
          action: translate(actionLabel),
          count: affected,
        }),
        {
          key: 'icon-library-action',
          title: translate('图标库'),
          duration: visibilityMutation ? 8000 : undefined,
          action: visibilityMutation
            ? {
                label: translate('撤销'),
                onClick: () => void undoVisibilityMutation(visibilityMutation),
              }
            : undefined,
        }
      )
    } catch (e) {
      console.error('Failed to update icon library item:', e)
      toast.error(translate('操作失败，请稍后重试。'), {
        key: 'icon-library-action',
        title: translate('图标库'),
      })
    } finally {
      setMutating(false)
      setPendingMutation(null)
    }
  }

  const handleResetLaunchpadIcons = async () => {
    if (layoutResetting) return
    const confirmed = window.confirm(
      translate('确定要重置图标布局吗？这会清空当前宫格排序、文件夹和 Dock 排布。')
    )
    if (!confirmed) return

    setLayoutResetting(true)
    try {
      await resetLaunchpadLayout()
      await notifyMainWindow()
      toast.success(translate('图标布局已重置。'), {
        key: 'icon-library-layout',
        title: translate('图标库'),
      })
    } catch (e) {
      toast.error(translate('重置图标布局失败：{error}', { error: String(e) }), {
        key: 'icon-library-layout',
        title: translate('图标库'),
      })
    } finally {
      setLayoutResetting(false)
    }
  }

  const invalidIconKey = (icon: InvalidIconEntry) => icon.id

  const handleScanInvalidIcons = async () => {
    if (scanningInvalidIcons || deletingInvalidIcons) return
    setScanningInvalidIcons(true)
    try {
      const results = await invoke<InvalidIconEntry[]>('scan_invalid_icons')
      setInvalidIconResults(results)
      setSelectedInvalidIconKeys(results.map(invalidIconKey))
      setInvalidIconScanOpen(true)
    } catch (e) {
      toast.error(translate('扫描失效图标失败：{error}', { error: String(e) }), {
        key: 'icon-library-invalid-scan',
        title: translate('图标库'),
      })
    } finally {
      setScanningInvalidIcons(false)
    }
  }

  const handleToggleInvalidIcon = (key: string) => {
    setSelectedInvalidIconKeys(current =>
      current.includes(key) ? current.filter(item => item !== key) : [...current, key]
    )
  }

  const handleDeleteInvalidIcons = async () => {
    const selectedKeySet = new Set(selectedInvalidIconKeys)
    const targets: IconMutationTarget[] = invalidIconResults
      .filter(icon => selectedKeySet.has(invalidIconKey(icon)))
      .map(icon => ({ id: icon.id }))
    if (targets.length === 0 || deletingInvalidIcons) return

    const confirmed = window.confirm(
      translate('确定将选中的 {count} 个失效图标移出图标库吗？不会删除原始文件。', {
        count: targets.length,
      })
    )
    if (!confirmed) return

    setDeletingInvalidIcons(true)
    try {
      const affected = await invoke<number>('delete_icons', { targets })
      toast.success(translate('已移出 {count} 个失效图标。', { count: affected }), {
        key: 'icon-library-invalid-delete',
        title: translate('图标库'),
      })
      const remaining = await invoke<InvalidIconEntry[]>('scan_invalid_icons')
      setInvalidIconResults(remaining)
      setSelectedInvalidIconKeys([])
      await refreshIconManagerList()
      await notifyMainWindow()
    } catch (e) {
      toast.error(translate('删除失效图标失败：{error}', { error: String(e) }), {
        key: 'icon-library-invalid-delete',
        title: translate('图标库'),
      })
    } finally {
      setDeletingInvalidIcons(false)
    }
  }

  const mutationDialogText = pendingMutation
    ? pendingMutation.type === 'hide'
      ? {
          title: translate('确认隐藏图标'),
          desc: translate('将隐藏图标“{name}”。隐藏后不会在启动台显示。', {
            name: pendingMutation.icon.name,
          }),
          confirmLabel: translate('确认隐藏'),
          confirmVariant: 'default' as const,
        }
      : pendingMutation.type === 'unhide'
        ? {
            title: translate('确认显示图标'),
            desc: translate('图标“{name}”将重新显示在启动台。', {
              name: pendingMutation.icon.name,
            }),
            confirmLabel: translate('确认显示'),
            confirmVariant: 'default' as const,
          }
        : {
            title: translate('确认移出图标库'),
            desc: translate('将“{name}”移出图标库，不会删除原始程序、文件或文件夹。', {
              name: pendingMutation.icon.name,
            }),
            confirmLabel: translate('移出图标库'),
            confirmVariant: 'destructive' as const,
          }
    : null

  const controlsDisabled =
    mutating || listLoading || layoutResetting || scanningInvalidIcons || deletingInvalidIcons
  const selectedInvalidIconKeySet = new Set(selectedInvalidIconKeys)
  const selectedInvalidIconCount = invalidIconResults.filter(icon =>
    selectedInvalidIconKeySet.has(invalidIconKey(icon))
  ).length
  const allInvalidIconsSelected =
    invalidIconResults.length > 0 && selectedInvalidIconCount === invalidIconResults.length

  return (
    <>
      <div className="min-w-0 space-y-5">
        <div className="flex flex-col gap-4 border-b border-border/80 pb-5 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl space-y-1.5">
            <h2 className="text-lg font-semibold">{translate('图标库')}</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              {translate('导入常用应用、快捷方式和文件；文件夹可以直接拖入启动台。')}
            </p>
          </div>
          <Button onClick={() => setAddIconDialogOpen(true)} disabled={mutating || layoutResetting}>
            <Upload className="h-4 w-4" />
            {translate('导入图标')}
          </Button>
        </div>

        <div className="min-w-0 space-y-3 rounded-md border border-border/80 bg-card p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-0 flex-[1_1_24rem] flex-wrap items-center gap-2">
              <Input
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder={translate('搜索图标名称或路径')}
                className="min-w-0 flex-[1_1_15rem]"
              />
              <div className="flex flex-wrap items-center gap-2">
                {ICON_VISIBILITY_FILTER_OPTIONS.map(opt => (
                  <OptionButton
                    key={opt.value}
                    label={translate(opt.label)}
                    selected={visibilityFilter === opt.value}
                    onClick={() => setVisibilityFilter(opt.value)}
                  />
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAiOrganizeOpen(true)}
                disabled={controlsDisabled || allIcons.length === 0}
              >
                <Bot className="h-3.5 w-3.5" />
                {translate('AI 整理')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleScanInvalidIcons()}
                disabled={controlsDisabled || allIcons.length === 0}
              >
                {scanningInvalidIcons ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <SearchX className="h-3.5 w-3.5" />
                )}
                {scanningInvalidIcons ? translate('正在扫描...') : translate('扫描失效图标')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetLaunchpadIcons}
                disabled={controlsDisabled}
              >
                {layoutResetting ? translate('重置中...') : translate('重置布局')}
              </Button>
              <div className="inline-flex h-9 rounded-lg border border-border/90 bg-background p-1">
                {ICON_MANAGER_VIEW_MODE_OPTIONS.map(option => {
                  const selected = viewMode === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-label={translate(option.label)}
                      title={translate(option.label)}
                      aria-pressed={selected}
                      onClick={() => handleViewModeChange(option.value)}
                      className={cn(
                        'inline-flex h-full w-8 items-center justify-center rounded-md transition-colors',
                        selected
                          ? 'bg-accent text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {option.icon}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {translate('图标库共 {total} 项，当前显示 {filtered} 项。', {
              total: allIcons.length,
              filtered: filteredIcons.length,
            })}
          </p>

          <div
            className={cn(
              'min-h-52',
              viewMode === 'grid'
                ? 'grid content-start gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,10rem),1fr))]'
                : 'space-y-2'
            )}
          >
            {listLoading ? (
              <div className="col-span-full flex min-h-44 items-center justify-center text-sm text-muted-foreground">
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                {translate('图标库加载中...')}
              </div>
            ) : listError && allIcons.length === 0 ? (
              <div
                role="alert"
                className="col-span-full flex min-h-44 flex-col items-center justify-center gap-3 px-4 text-center"
              >
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-300" />
                <div className="max-w-md space-y-1">
                  <p className="text-sm font-medium">{translate('图标库加载失败，请重试。')}</p>
                  <p className="break-words text-xs text-muted-foreground" title={listError}>
                    {translate('现有布局不会被修改。')}
                  </p>
                </div>
                <Button size="sm" onClick={() => void refreshIconManagerList()}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  {translate('重试')}
                </Button>
              </div>
            ) : filteredIcons.length === 0 ? (
              <div className="col-span-full flex min-h-44 flex-col items-center justify-center gap-3 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <Upload className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {allIcons.length === 0
                      ? translate('图标库还是空的')
                      : translate('没有符合当前条件的图标')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {allIcons.length === 0
                      ? translate('导入应用、快捷方式或文件，开始创建你的启动台。')
                      : translate('尝试调整搜索词或显示状态。')}
                  </p>
                </div>
                {allIcons.length === 0 ? (
                  <Button
                    size="sm"
                    onClick={() => setAddIconDialogOpen(true)}
                    disabled={controlsDisabled}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {translate('导入图标')}
                  </Button>
                ) : null}
              </div>
            ) : (
              filteredIcons.map(icon => {
                const compactPathLabel = getPathLeaf(icon.target_path || icon.path) || '-'
                const visibilityBadgeClass = icon.hidden
                  ? 'border-orange-500/30 bg-orange-500/15 text-orange-700 dark:text-orange-300'
                  : 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'

                return (
                  <article
                    key={icon.id}
                    className={cn(
                      'border border-border/80 bg-background',
                      viewMode === 'grid'
                        ? 'rounded-lg p-3'
                        : 'flex flex-wrap items-center gap-3 rounded-lg p-3'
                    )}
                  >
                    <div className="flex min-w-0 flex-[1_1_16rem] items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/70 bg-muted/35">
                        {icon.icon_base64 ? (
                          <img
                            src={icon.icon_base64}
                            alt={icon.name}
                            className="h-full w-full object-contain"
                            loading="lazy"
                          />
                        ) : (
                          <span className="text-[10px] text-muted-foreground">
                            {translate('无图标')}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p
                            className={cn(
                              'font-medium',
                              viewMode === 'grid'
                                ? 'overflow-hidden text-sm leading-4 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]'
                                : 'truncate text-sm'
                            )}
                            title={icon.name || translate('未命名')}
                          >
                            {icon.name || translate('未命名')}
                          </p>
                          <span
                            className={cn(
                              'rounded border px-1.5 py-0.5 text-[10px]',
                              visibilityBadgeClass
                            )}
                          >
                            {icon.hidden ? translate('隐藏') : translate('显示中')}
                          </span>
                        </div>
                        <p
                          className="mt-1 truncate text-xs text-muted-foreground"
                          title={icon.target_path || icon.path}
                        >
                          {viewMode === 'grid' ? compactPathLabel : icon.target_path || icon.path}
                        </p>
                      </div>
                    </div>

                    <div
                      className={cn(
                        'flex min-w-0 flex-wrap gap-2',
                        viewMode === 'grid' ? 'mt-3' : 'flex-[1_1_12rem]'
                      )}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setPendingMutation({ type: icon.hidden ? 'unhide' : 'hide', icon })
                        }
                        disabled={mutating}
                        className="min-w-0 flex-1 whitespace-normal"
                      >
                        {icon.hidden ? translate('显示') : translate('隐藏')}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setPendingMutation({ type: 'delete', icon })}
                        disabled={mutating}
                        className="min-w-0 flex-1 whitespace-normal"
                      >
                        {viewMode === 'grid' ? translate('移出') : translate('移出图标库')}
                      </Button>
                    </div>
                  </article>
                )
              })
            )}
          </div>
        </div>
      </div>

      <AddIconDialog
        open={addIconDialogOpen}
        onOpenChange={setAddIconDialogOpen}
        onCreated={handleIconCreated}
      />

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
                {translate('取消')}
              </Button>
              <Button
                variant={mutationDialogText.confirmVariant}
                size="sm"
                onClick={handleConfirmMutation}
                disabled={mutating}
              >
                {mutating ? translate('处理中...') : mutationDialogText.confirmLabel}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {invalidIconScanOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/22 p-4 backdrop-blur-[1px] dark:bg-black/45">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="invalid-icon-scan-title"
            className="flex max-h-[min(42rem,calc(100vh-2rem))] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-border/80 px-4 py-4 sm:px-5">
              <div className="min-w-0 space-y-1">
                <h3 id="invalid-icon-scan-title" className="text-base font-semibold">
                  {translate('失效图标扫描')}
                </h3>
                <p className="text-xs leading-5 text-muted-foreground">
                  {translate('仅检查入口和目标是否存在；请确认网络盘或移动设备已连接。')}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={translate('关闭')}
                onClick={() => setInvalidIconScanOpen(false)}
                disabled={deletingInvalidIcons}
                className="shrink-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {invalidIconResults.length === 0 ? (
              <div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-3 px-5 py-10 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">{translate('未发现失效图标')}</p>
                  <p className="text-xs leading-5 text-muted-foreground">
                    {translate('当前图标库中的入口和目标均可访问。')}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-muted/15 px-4 py-3 sm:px-5">
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={allInvalidIconsSelected}
                      onChange={() =>
                        setSelectedInvalidIconKeys(
                          allInvalidIconsSelected ? [] : invalidIconResults.map(invalidIconKey)
                        )
                      }
                      disabled={deletingInvalidIcons}
                      className="h-4 w-4 rounded border-border accent-primary"
                    />
                    {translate('全选')}
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {translate('发现 {total} 项，已选择 {selected} 项。', {
                      total: invalidIconResults.length,
                      selected: selectedInvalidIconCount,
                    })}
                  </p>
                </div>

                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3 sm:px-5">
                  {invalidIconResults.map(icon => {
                    const key = invalidIconKey(icon)
                    const reasonLabel =
                      icon.reason === 'entry_missing'
                        ? translate('入口文件不存在')
                        : icon.reason === 'target_unresolved'
                          ? translate('无法解析快捷方式目标')
                          : translate('目标文件不存在')
                    return (
                      <label
                        key={key}
                        className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/80 bg-background p-3 transition-colors hover:bg-muted/20"
                      >
                        <input
                          type="checkbox"
                          checked={selectedInvalidIconKeySet.has(key)}
                          onChange={() => handleToggleInvalidIcon(key)}
                          disabled={deletingInvalidIcons}
                          className="mt-1 h-4 w-4 shrink-0 rounded border-border accent-primary"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-medium" title={icon.name}>
                              {icon.name || translate('未命名')}
                            </p>
                            <span className="rounded border border-destructive/25 bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive">
                              {reasonLabel}
                            </span>
                          </div>
                          <p
                            className="mt-1 truncate text-xs text-muted-foreground"
                            title={icon.target_path || icon.path}
                          >
                            {icon.target_path || icon.path}
                          </p>
                        </div>
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                      </label>
                    )
                  })}
                </div>
              </>
            )}

            <div className="flex flex-wrap justify-end gap-2 border-t border-border/80 bg-muted/15 px-4 py-3 sm:px-5">
              <Button
                type="button"
                variant="outline"
                onClick={() => setInvalidIconScanOpen(false)}
                disabled={deletingInvalidIcons}
                className="min-w-0 flex-1 sm:flex-none"
              >
                {translate('关闭')}
              </Button>
              {invalidIconResults.length > 0 ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => void handleDeleteInvalidIcons()}
                  disabled={deletingInvalidIcons || selectedInvalidIconCount === 0}
                  className="min-w-0 flex-1 sm:flex-none"
                >
                  {deletingInvalidIcons ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  {deletingInvalidIcons
                    ? translate('正在删除...')
                    : translate('删除所选（{count}）', { count: selectedInvalidIconCount })}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <AiOrganizePanel
        open={aiOrganizeOpen}
        icons={allIcons.filter(icon => !icon.hidden)}
        customNames={customNames}
        onClose={() => setAiOrganizeOpen(false)}
        onPreviewed={notifyMainWindow}
        onApplied={notifyMainWindow}
      />
    </>
  )
}

function AiPanel() {
  useI18n()
  const toast = useToast()
  const [config, setConfig] = useState<AiConfig>(DEFAULT_AI_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const saved = await loadAiConfig()
        setConfig(saved)
      } catch (e) {
        console.error('Failed to load AI config:', e)
        toast.error(translate('加载 AI 配置失败：{error}', { error: String(e) }), {
          key: 'settings-ai',
          title: translate('AI 助手'),
        })
      } finally {
        setLoading(false)
      }
    })()
  }, [toast])

  const updateField = <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => {
    setConfig(current => ({ ...current, [key]: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const next: AiConfig = {
        ...config,
        baseUrl: config.baseUrl.trim(),
        model: config.model.trim(),
        apiKey: config.apiKey.trim(),
        enabled: isAiConfigReady(config),
      }
      await saveAiConfig(next)
      setConfig(next)
      toast.success(translate('AI 配置已保存。'), {
        key: 'settings-ai',
        title: translate('AI 助手'),
      })
    } catch (e) {
      toast.error(translate('保存 AI 配置失败：{error}', { error: String(e) }), {
        key: 'settings-ai',
        title: translate('AI 助手'),
      })
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (!isAiConfigReady(config)) {
      toast.error(translate('请先填写接口地址、API Key 和模型名称。'), {
        key: 'settings-ai',
        title: translate('AI 助手'),
      })
      return
    }
    setTesting(true)
    try {
      await invoke('ai_classify_icons', {
        config: {
          base_url: config.baseUrl.trim(),
          api_key: config.apiKey.trim(),
          model: config.model.trim(),
          custom_prompt: config.customPrompt,
        },
        icons: [
          {
            key: 'test:1',
            name: 'Google Chrome',
            target_leaf: 'chrome.exe',
            item_type: 'shortcut',
          },
          {
            key: 'test:2',
            name: 'Microsoft Edge',
            target_leaf: 'msedge.exe',
            item_type: 'shortcut',
          },
        ],
      })
      toast.success(translate('连接成功，AI 配置可用。'), {
        key: 'settings-ai',
        title: translate('AI 助手'),
      })
    } catch (e) {
      toast.error(translate('连接失败：{error}', { error: String(e) }), {
        key: 'settings-ai',
        title: translate('AI 助手'),
      })
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">{translate('加载中...')}</p>
  }

  return (
    <div className="space-y-6">
      <div className="max-w-3xl space-y-2">
        <h2 className="text-lg font-semibold">{translate('AI 助手')}</h2>
        <p className="text-sm text-muted-foreground">
          {translate(
            '配置一个兼容 OpenAI 接口的模型，之后可在启动台右键菜单使用「AI 智能整理」，让 AI 按用途把图标归类到文件夹。'
          )}
        </p>
      </div>

      <SettingCard
        label={translate('模型接入配置')}
        desc={translate(
          '支持任意兼容 OpenAI Chat Completions 的服务，例如 OpenAI、DeepSeek、Moonshot 或本地 Ollama。'
        )}
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground/80">
              {translate('接口地址（Base URL）')}
            </label>
            <Input
              value={config.baseUrl}
              onChange={e => updateField('baseUrl', e.target.value)}
              placeholder="https://api.openai.com/v1"
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground/80">{translate('API Key')}</label>
            <Input
              type="password"
              value={config.apiKey}
              onChange={e => updateField('apiKey', e.target.value)}
              placeholder="sk-..."
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground/80">
              {translate('模型名称')}
            </label>
            <Input
              value={config.model}
              onChange={e => updateField('model', e.target.value)}
              placeholder="gpt-4o-mini"
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground/80">
              {translate('自定义分类提示词（可选）')}
            </label>
            <textarea
              value={config.customPrompt}
              onChange={e => updateField('customPrompt', e.target.value)}
              placeholder={translate('例如：把所有游戏单独归到「游戏」文件夹。')}
              rows={3}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500/25"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void handleSave()} disabled={saving || testing}>
              {saving ? translate('保存中...') : translate('保存配置')}
            </Button>
            <Button
              variant="outline"
              onClick={() => void handleTest()}
              disabled={saving || testing}
            >
              {testing ? translate('测试中...') : translate('测试连接')}
            </Button>
          </div>
        </div>
      </SettingCard>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/8 p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">{translate('安全提示')}</p>
            <p className="text-xs leading-5 text-muted-foreground">
              {translate(
                'API Key 以明文保存在本地配置文件中，请勿在不信任的设备上填写。整理时仅向模型发送图标名称、目标程序名和类型，不会上传完整文件路径。'
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function AboutPanel() {
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

export function Settings() {
  const { language } = useI18n()
  const [activeNav, setActiveNav] = useState<NavItem>('settings')
  const [isMaximized, setIsMaximized] = useState(false)
  const isClosingRef = useRef(false)
  const shouldReturnToMainOnClose = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('returnToMain') === '1'
  }, [])
  const navItems = useMemo(
    () =>
      NAV_ITEMS.map(item => ({
        ...item,
        label: translate(item.label, undefined, language),
      })),
    [language]
  )

  const activeNavItem = navItems.find(item => item.key === activeNav) ?? navItems[0]

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
      await pendingWindowPersistentSync
      await invoke('close_settings_window', {
        returnToMain: shouldReturnToMainOnClose && !skipReturnToMainOnClose,
      })
    } catch (e) {
      console.error('Failed to close settings window:', e)
    } finally {
      isClosingRef.current = false
    }
  }, [shouldReturnToMainOnClose])

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

  const isTitlebarInteractiveTarget = (target: EventTarget | null) => {
    const element =
      target instanceof Element ? target : target instanceof Node ? target.parentElement : null

    return Boolean(
      element?.closest(
        'button, a, input, textarea, select, [role="button"], [data-no-window-drag="true"]'
      )
    )
  }

  const handleWindowDragStart = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    if (isTitlebarInteractiveTarget(event.target)) return
    void getCurrentWindow()
      .startDragging()
      .catch(e => console.error('Failed to start dragging settings window:', e))
  }

  const handleTitlebarDoubleClick = (event: ReactMouseEvent<HTMLElement>) => {
    if (isTitlebarInteractiveTarget(event.target)) return
    handleToggleMaximizeWindow()
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
    <div className="settings-shell flex h-screen w-screen bg-card text-foreground">
      <aside className="flex w-48 shrink-0 flex-col bg-card">
        <div
          onPointerDown={handleWindowDragStart}
          onDoubleClick={handleTitlebarDoubleClick}
          className="flex h-12 shrink-0 cursor-grab items-center px-4 active:cursor-grabbing"
        >
          <Logo iconSize={20} textSize="sm" className="shrink-0" />
        </div>

        <nav className="flex min-h-0 flex-1 flex-col px-3 py-3">
          <ul className="flex flex-col gap-1">
            {navItems.map(item => (
              <li key={item.key}>
                <button
                  onClick={() => setActiveNav(item.key)}
                  className={`settings-nav-item flex w-full items-center gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors cursor-pointer ${
                    activeNav === item.key
                      ? 'settings-nav-item-active border-transparent text-foreground font-medium'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col bg-card">
        <header
          onPointerDown={handleWindowDragStart}
          onDoubleClick={handleTitlebarDoubleClick}
          className="flex h-12 shrink-0 cursor-grab items-center gap-3 px-4 active:cursor-grabbing"
        >
          <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            {translate('设置 / {label}', { label: activeNavItem.label })}
          </p>

          <div data-no-window-drag="true" className="flex items-center gap-1">
            <WindowControlButton label={translate('最小化')} onClick={handleMinimizeWindow}>
              <Minus className="h-4 w-4" />
            </WindowControlButton>
            <WindowControlButton
              label={isMaximized ? translate('还原窗口') : translate('最大化')}
              onClick={handleToggleMaximizeWindow}
            >
              {isMaximized ? <Copy className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
            </WindowControlButton>
            <WindowControlButton
              label={translate('关闭')}
              tone="danger"
              onClick={() => void closeSettingsWindow()}
            >
              <X className="h-4 w-4" />
            </WindowControlButton>
          </div>
        </header>

        <main className="settings-content-surface settings-main-scroll min-h-0 flex-1 overflow-y-auto rounded-tl-xl border-l border-t border-border/80 bg-background px-6 py-6 xl:px-8">
          <div className={cn('mx-auto w-full', NAV_CONTENT_WIDTH[activeNav])}>
            {activeNav === 'settings' && <SettingsPanel />}
            {activeNav === 'search' && <SearchSettingsPanel />}
            {activeNav === 'iconManager' && <IconManagerPanel />}
            {activeNav === 'ai' && <AiPanel />}
            {activeNav === 'update' && <UpdatePanel />}
            {activeNav === 'about' && <AboutPanel />}
          </div>
        </main>
      </div>
    </div>
  )
}
