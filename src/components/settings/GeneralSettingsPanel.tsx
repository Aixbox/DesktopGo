import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { invoke } from '@tauri-apps/api/core'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { cn } from '@/lib/utils'
import { useIconStore } from '@/stores/iconStore'
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
import { MAIN_WINDOW_APPEARANCE_SYNC_EVENT } from '@/lib/windowPersistent'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Monitor, Moon, Sun } from 'lucide-react'
import {
  SettingGroup,
  SettingCard,
  SegmentedControl,
  RangeControl,
  ToggleRow,
} from '@/components/ui/setting-components'
import { useToast } from '@/components/ui/toast'
import type {
  IconSize,
  AppLanguage,
  LaunchpadOpenFocusTarget,
  ThemeMode,
  TitleLineCount,
  WindowMode,
  WindowStyle,
} from '@/types'
import {
  ICON_CORNER_RADIUS_MAX,
  ICON_CORNER_RADIUS_MIN,
  ICON_OPACITY_MAX,
  ICON_OPACITY_MIN,
} from '@/types'
import {
  buildShortcutFromKeyDown,
  formatShortcutForDisplay,
  formatShortcutForInput,
  normalizeShortcutDraftText,
} from './shortcut'
import { setSkipReturnToMainOnClose, trackWindowPersistentSync } from './windowPersistentSync'
import { AppearanceSettingsCards } from './AppearanceSettingsCards'

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

const THEME_MODE_ICONS: Record<ThemeMode, ReactNode> = {
  system: <Monitor className="h-4 w-4" />,
  dark: <Moon className="h-4 w-4" />,
  light: <Sun className="h-4 w-4" />,
}

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

export function GeneralSettingsPanel() {
  const { language, setLanguage } = useI18n()
  const {
    iconSize,
    iconCornerRadius,
    iconOpacity,
    windowMode,
    titleLineCount,
    dockEnabled,
    setIconCornerRadius,
    setIconOpacity,
    setDockEnabled,
  } = useIconStore()
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
          savedIconCornerRadius,
          savedIconOpacity,
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
          getSetting('iconCornerRadius'),
          getSetting('iconOpacity'),
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
          iconCornerRadius: savedIconCornerRadius,
          iconOpacity: savedIconOpacity,
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
    setSkipReturnToMainOnClose(!value)
    const task = (async () => {
      try {
        await setSetting('windowPersistent', value)
        await invoke('sync_window_persistent_state', { enabled: value })
      } catch (error) {
        console.error('Failed to save window persistent state:', error)
        setWindowPersistentEnabled(previousValue)
        applyWindowStyle(windowStyle, previousValue)
        setSkipReturnToMainOnClose(!previousValue)
        void setSetting('windowPersistent', previousValue).catch(rollbackError => {
          console.error('Failed to rollback window persistent state:', rollbackError)
        })
        toast.error(translate('保存窗口常驻失败：{error}', { error: String(error) }), {
          key: 'settings-window-persistent',
          title: translate('窗口常驻'),
        })
      }
    })()
    trackWindowPersistentSync(
      task.catch(() => {
        // 关闭设置窗口前会等待当前同步链结束，这里吞掉异常，避免把 close 链路也打断。
      })
    )
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

  const syncMainWindowAppearance = useCallback(
    async (payload: { iconCornerRadius?: number; iconOpacity?: number } = {}) => {
      try {
        const mainWindow = await WebviewWindow.getByLabel('main')
        if (!mainWindow) {
          return
        }

        await mainWindow.emit(MAIN_WINDOW_APPEARANCE_SYNC_EVENT, payload)
      } catch (error) {
        console.error('Failed to sync main window appearance:', error)
      }
    },
    []
  )

  const handleIconCornerRadius = (value: number) => {
    setIconCornerRadius(value)
    void syncMainWindowAppearance({ iconCornerRadius: value })
  }

  const handleIconOpacity = (value: number) => {
    setIconOpacity(value)
    void syncMainWindowAppearance({ iconOpacity: value })
  }

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
            <SegmentedControl
              ariaLabel={translate('界面语言')}
              options={LANGUAGE_OPTIONS.map(option => ({
                ...option,
                label: translate(option.label),
              }))}
              value={language}
              onChange={value => void setLanguage(value)}
            />
          </SettingCard>

          <SettingCard label={translate('主题模式')}>
            <SegmentedControl
              ariaLabel={translate('主题模式')}
              options={THEME_OPTIONS.map(option => ({
                ...option,
                icon: THEME_MODE_ICONS[option.value],
                label: translate(option.label),
              }))}
              value={themeMode}
              onChange={handleThemeMode}
            />
          </SettingCard>

          <SettingCard label={translate('主题风格')}>
            <SegmentedControl
              ariaLabel={translate('主题风格')}
              options={WINDOW_STYLE_OPTIONS.map(option => ({
                ...option,
                label: translate(option.label),
              }))}
              value={windowStyle}
              onChange={value => void handleWindowStyle(value)}
            />
            <p className="text-xs leading-5 text-muted-foreground">
              {translate(selectedWindowStyleOption.description)}
            </p>
          </SettingCard>

          <AppearanceSettingsCards onAppearanceChange={syncMainWindowAppearance} />
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
            <SegmentedControl
              ariaLabel={translate('图标大小')}
              options={ICON_SIZE_OPTIONS.map(option => ({
                ...option,
                label: translate(option.label),
              }))}
              value={iconSize}
              onChange={handleIconSize}
            />
          </SettingCard>

          <SettingCard
            label={translate('图标圆角')}
            desc={translate('调整图标画面的圆角比例，文件夹缩略图会同比例变化。')}
          >
            <RangeControl
              label={translate('图标圆角')}
              value={iconCornerRadius}
              min={ICON_CORNER_RADIUS_MIN}
              max={ICON_CORNER_RADIUS_MAX}
              valueLabel={`${iconCornerRadius}%`}
              onChange={handleIconCornerRadius}
            />
          </SettingCard>

          <SettingCard
            label={translate('图标不透明度')}
            desc={translate('只调整图标画面的透明度，不影响名称和点击区域。')}
          >
            <RangeControl
              label={translate('图标不透明度')}
              value={iconOpacity}
              min={ICON_OPACITY_MIN}
              max={ICON_OPACITY_MAX}
              valueLabel={`${iconOpacity}%`}
              onChange={handleIconOpacity}
            />
          </SettingCard>

          <SettingCard label={translate('窗口大小')}>
            <SegmentedControl
              ariaLabel={translate('窗口大小')}
              options={WINDOW_MODE_OPTIONS.map(option => ({
                ...option,
                label: translate(option.label),
              }))}
              value={windowMode}
              onChange={handleWindowMode}
            />
          </SettingCard>

          <SettingCard label={translate('标题行数')}>
            <SegmentedControl
              ariaLabel={translate('标题行数')}
              options={TITLE_LINE_OPTIONS.map(option => ({
                ...option,
                label: translate(option.label),
              }))}
              value={titleLineCount}
              onChange={handleTitleLineCount}
            />
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
                <span className="accent-tonal rounded-full border px-2.5 py-1">
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
                  isRecordingShortcut && 'border-ring/60 ring-2 ring-ring/15'
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
            <SegmentedControl
              ariaLabel={translate('打开启动台时默认焦点')}
              options={LAUNCHPAD_OPEN_FOCUS_OPTIONS.map(option => ({
                ...option,
                label: translate(option.label),
              }))}
              value={launchpadOpenFocusTarget}
              onChange={handleLaunchpadOpenFocusTarget}
            />
            <p className="text-xs leading-5 text-muted-foreground">
              {translate(LAUNCHPAD_OPEN_FOCUS_DESCRIPTIONS[launchpadOpenFocusTarget])}
            </p>
          </SettingCard>
        </SettingGroup>
      </section>
    </div>
  )
}
