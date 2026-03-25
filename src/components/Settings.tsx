import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { useIconStore } from '@/stores/iconStore'
import { applyTheme, saveTheme } from '@/lib/theme'
import { getSetting, setSetting } from '@/lib/settingsStore'
import {
  LAUNCHPAD_LAYOUT_RESET_EVENT,
  resetLaunchpadLayout,
} from '@/components/icon-grid/services/layoutStore'
import { SearchSettingsPanel } from '@/components/search/SearchSettingsPanel'
import type {
  IconManagerItem,
  IconMutationTarget,
  IconSize,
  IconSource,
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
  Copy,
  X,
} from 'lucide-react'

type NavItem = 'settings' | 'search' | 'iconManager' | 'update' | 'about'

const NAV_ITEMS: { key: NavItem; label: string; icon: React.ReactNode }[] = [
  { key: 'settings', label: '设置', icon: <SettingsIcon className="w-4 h-4" /> },
  { key: 'search', label: '搜索', icon: <Search className="w-4 h-4" /> },
  { key: 'iconManager', label: '图标管理', icon: <Images className="w-4 h-4" /> },
  { key: 'update', label: '更新', icon: <RefreshCw className="w-4 h-4" /> },
  { key: 'about', label: '关于', icon: <Info className="w-4 h-4" /> },
]

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

type IconSyncResult = {
  mode: string
  scanned_count: number
  added_count: number
  total_count: number
}

type IconVisibilityFilter = 'all' | 'visible' | 'hidden'
type IconSourceFilter = 'all' | IconSource

const ICON_VISIBILITY_FILTER_OPTIONS: { label: string; value: IconVisibilityFilter }[] = [
  { label: '全部', value: 'all' },
  { label: '未隐藏', value: 'visible' },
  { label: '隐藏', value: 'hidden' },
]

const ICON_SOURCE_FILTER_OPTIONS: { label: string; value: IconSourceFilter }[] = [
  { label: '全部来源', value: 'all' },
  { label: '桌面', value: 'desktop' },
  { label: 'customapp', value: 'customapp' },
]

const ICON_SYNC_ACTIONS: Record<
  IconSyncAction,
  {
    label: string
    command: IconSyncCommand
    source: 'desktop' | 'customapp'
    sourceLabel: string
    desc: string
    confirmTitle: string
    confirmDesc: string
  }
> = {
  desktopIncremental: {
    label: '桌面新增图标同步',
    command: 'sync_new_desktop_icons',
    source: 'desktop',
    sourceLabel: '桌面',
    desc: '仅追加桌面上新增的图标，已有图标保持不变。',
    confirmTitle: '确认执行桌面新增图标同步',
    confirmDesc: '该操作会扫描桌面并仅新增快照中不存在的图标，不会删除或覆盖已有图标记录。',
  },
  desktopFull: {
    label: '桌面全量图标同步',
    command: 'sync_full_desktop_icons',
    source: 'desktop',
    sourceLabel: '桌面',
    desc: '按当前桌面与快照对账：重叠保留，多出删除，缺失新增。',
    confirmTitle: '确认执行桌面全量图标同步',
    confirmDesc:
      '该操作会重新扫描整个桌面，仅新增缺失项并删除失效项，已存在且重叠的图标记录会保留。',
  },
  customappIncremental: {
    label: 'customapp新增图标同步',
    command: 'sync_new_customapp_icons',
    source: 'customapp',
    sourceLabel: 'customapp',
    desc: '仅追加 customapp 文件夹中新增的图标项，已有图标保持不变。',
    confirmTitle: '确认执行 customapp 新增图标同步',
    confirmDesc: '该操作会扫描 customapp 文件夹（仅一级目录），并仅新增快照中不存在的图标记录。',
  },
  customappFull: {
    label: 'customapp全量图标同步',
    command: 'sync_full_customapp_icons',
    source: 'customapp',
    sourceLabel: 'customapp',
    desc: '按当前 customapp 内容与快照对账：重叠保留，多出删除，缺失新增。',
    confirmTitle: '确认执行 customapp 全量图标同步',
    confirmDesc:
      '该操作会扫描 customapp 文件夹（仅一级目录），仅新增缺失项并删除失效项，已存在且重叠的图标记录会保留。',
  },
}

function SettingGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">{title}</h2>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

function OptionButton({
  label,
  selected,
  onClick,
}: {
  label: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-4 py-2 text-sm transition-all duration-150 cursor-pointer ${
        selected
          ? 'border-blue-500 bg-blue-500/20 text-blue-400'
          : 'border-border bg-secondary text-secondary-foreground hover:border-muted-foreground hover:bg-accent'
      }`}
    >
      {label}
    </button>
  )
}

function ToggleSettingRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-secondary/30 p-4">
        <div className="space-y-1">
          <h2 className="text-sm font-medium text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={() => onChange(!checked)}
          className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border transition-colors duration-200 ${
            checked ? 'border-blue-500 bg-blue-500/90' : 'border-border bg-zinc-500/30'
          }`}
        >
          <span
            className={`absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow-sm transition-transform duration-200 ${
              checked ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    </div>
  )
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
  const [defaultCustomAppDir, setDefaultCustomAppDir] = useState('')
  const [customAppDirInput, setCustomAppDirInput] = useState('')
  const [effectiveCustomAppDir, setEffectiveCustomAppDir] = useState('')
  const [customAppDirText, setCustomAppDirText] = useState('')
  const [layoutResetting, setLayoutResetting] = useState(false)
  const [layoutResetText, setLayoutResetText] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const [
          savedIconSize,
          savedWindowMode,
          savedTitleLineCount,
          savedDockEnabled,
          savedThemeMode,
          savedCustomAppDir,
          resolvedDefaultCustomAppDir,
        ] = await Promise.all([
          getSetting('iconSize'),
          getSetting('windowMode'),
          getSetting('titleLineCount'),
          getSetting('dockEnabled'),
          getSetting('themeMode'),
          getSetting('customAppDir'),
          invoke<string>('get_default_customapp_dir'),
        ])

        useIconStore.setState({
          iconSize: savedIconSize,
          windowMode: savedWindowMode,
          titleLineCount: savedTitleLineCount,
          dockEnabled: savedDockEnabled,
        })
        setThemeMode(savedThemeMode)
        setDefaultCustomAppDir(resolvedDefaultCustomAppDir)

        const nextCustomAppDir = savedCustomAppDir.trim()
        const nextEffectiveCustomAppDir = nextCustomAppDir || resolvedDefaultCustomAppDir
        setCustomAppDirInput(nextEffectiveCustomAppDir)
        setEffectiveCustomAppDir(nextEffectiveCustomAppDir)
      } catch (e) {
        console.error('Failed to load settings:', e)
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

  const handlePickCustomAppDir = async () => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        defaultPath: customAppDirInput.trim() || defaultCustomAppDir || undefined,
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
      setCustomAppDirText('没有可打开的目录，请先选择或输入 customapp 目录。')
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
          ? '路径已保存，后续 customapp 同步将使用该目录。'
          : '已恢复使用默认 customapp 目录。'
      )
    } catch (e) {
      setCustomAppDirText(`保存失败：${String(e)}`)
    }
  }

  const handleResetCustomAppDir = async () => {
    try {
      await setSetting('customAppDir', '')
      setCustomAppDirInput(defaultCustomAppDir)
      setEffectiveCustomAppDir(defaultCustomAppDir)
      setCustomAppDirText('已恢复默认 customapp 目录。')
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

      <ToggleSettingRow
        title="显示 Dock 栏"
        description={
          dockEnabled
            ? '当前已开启，Dock 会在启动台底部显示。'
            : '当前已关闭，Dock 中的图标会回到图标网格。'
        }
        checked={dockEnabled}
        onChange={handleDockEnabled}
      />

      <div className="mb-6">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">图标重置</h2>
        <div className="space-y-3 rounded-lg border border-border bg-secondary/30 p-4">
          <p className="text-xs text-muted-foreground">
            重置后会恢复默认图标布局，并清空当前创建的文件夹和 Dock 排布，不会删除图标快照记录。
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleResetLaunchpadIcons}
              disabled={layoutResetting}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              {layoutResetting ? '重置中...' : '重置图标'}
            </button>
          </div>
          {layoutResetText ? (
            <p className="text-xs text-muted-foreground">{layoutResetText}</p>
          ) : null}
        </div>
      </div>

      <div className="mb-6">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">自定义图标文件夹</h2>
        <div className="space-y-3 rounded-lg border border-border bg-secondary/30 p-4">
          <p className="text-xs text-muted-foreground">
            默认目录：{defaultCustomAppDir || '加载中...'}
          </p>
          <p className="text-xs text-muted-foreground">
            当前生效目录：{effectiveCustomAppDir || '加载中...'}
          </p>
          <input
            value={customAppDirInput}
            onChange={e => setCustomAppDirInput(e.target.value)}
            placeholder="输入 customapp 文件夹绝对路径"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500"
          />
          <p className="text-xs text-muted-foreground">
            说明：customapp 只扫描一级目录，删除仅删除应用内记录，不会删除磁盘文件。
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handlePickCustomAppDir}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
            >
              选择文件夹
            </button>
            <button
              onClick={handleOpenCustomAppDir}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
            >
              打开文件夹
            </button>
            <button
              onClick={handleSaveCustomAppDir}
              className="rounded-md bg-blue-500 px-3 py-1.5 text-sm text-white hover:bg-blue-600"
            >
              保存路径
            </button>
            <button
              onClick={handleResetCustomAppDir}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
            >
              恢复默认路径
            </button>
          </div>
          {customAppDirText ? (
            <p className="text-xs text-muted-foreground">{customAppDirText}</p>
          ) : null}
        </div>
      </div>
    </>
  )
}

function UpdatePanel() {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-muted-foreground">暂无更新内容</p>
    </div>
  )
}

function IconManagerPanel() {
  const [pendingAction, setPendingAction] = useState<IconSyncAction | null>(null)
  const [pendingMutation, setPendingMutation] = useState<{
    type: 'hide' | 'unhide' | 'delete'
    icon: IconManagerItem
  } | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [mutating, setMutating] = useState(false)
  const [listLoading, setListLoading] = useState(false)
  const [resultText, setResultText] = useState<string>('')
  const [managerErrorText, setManagerErrorText] = useState<string>('')
  const [defaultCustomAppDir, setDefaultCustomAppDir] = useState('')
  const [effectiveCustomAppDir, setEffectiveCustomAppDir] = useState('')
  const [allIcons, setAllIcons] = useState<IconManagerItem[]>([])
  const [searchInput, setSearchInput] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [visibilityFilter, setVisibilityFilter] = useState<IconVisibilityFilter>('all')
  const [sourceFilter, setSourceFilter] = useState<IconSourceFilter>('all')

  const refreshCustomAppDirDisplay = async () => {
    try {
      const [savedCustomAppDir, resolvedDefaultCustomAppDir] = await Promise.all([
        getSetting('customAppDir'),
        invoke<string>('get_default_customapp_dir'),
      ])
      const nextSavedCustomAppDir = savedCustomAppDir.trim()
      setDefaultCustomAppDir(resolvedDefaultCustomAppDir)
      setEffectiveCustomAppDir(nextSavedCustomAppDir || resolvedDefaultCustomAppDir)
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
    void (async () => {
      await refreshCustomAppDirDisplay()
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
    return allIcons.filter(icon => {
      if (visibilityFilter === 'visible' && icon.hidden) return false
      if (visibilityFilter === 'hidden' && !icon.hidden) return false
      if (sourceFilter !== 'all' && icon.source !== sourceFilter) return false
      if (!searchKeyword) return true
      const haystack = `${icon.name} ${icon.path} ${icon.target_path}`.toLowerCase()
      return haystack.includes(searchKeyword)
    })
  }, [allIcons, visibilityFilter, sourceFilter, searchKeyword])

  const handleConfirmSync = async () => {
    if (!pendingAction) return
    setSyncing(true)
    setResultText('')

    try {
      const action = ICON_SYNC_ACTIONS[pendingAction]
      let result: IconSyncResult

      if (action.source === 'customapp') {
        const savedCustomAppDir = (await getSetting('customAppDir')).trim()
        result = await invoke<IconSyncResult>(action.command, {
          customAppDir: savedCustomAppDir || null,
        })
      } else {
        result = await invoke<IconSyncResult>(action.command)
      }

      const modeText = result.mode === 'full' ? '全量同步' : '新增同步'
      setResultText(
        `${action.sourceLabel}${modeText}完成：扫描 ${result.scanned_count} 项，新增 ${result.added_count} 项，当前快照共 ${result.total_count} 项。`
      )
      await refreshCustomAppDirDisplay()
      await refreshIconManagerList()
    } catch (e) {
      setResultText(`同步失败：${String(e)}`)
    } finally {
      setSyncing(false)
      setPendingAction(null)
    }
  }

  const handleConfirmMutation = async () => {
    if (!pendingMutation) return
    setMutating(true)
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
      const sourceText = pendingMutation.icon.source === 'desktop' ? '桌面' : 'customapp'
      setResultText(`${actionLabel}完成：${sourceText} 图标影响 ${affected} 项。`)
      await refreshIconManagerList()
    } catch (e) {
      setResultText(`操作失败：${String(e)}`)
    } finally {
      setMutating(false)
      setPendingMutation(null)
    }
  }

  const mutationDialogText = pendingMutation
    ? pendingMutation.type === 'hide'
      ? {
          title: '确认隐藏图标',
          desc: `将隐藏图标“${pendingMutation.icon.name}”。隐藏后不会在主页面显示。`,
          confirmLabel: '确认隐藏',
          confirmClass:
            'rounded-md bg-blue-500 px-3 py-1.5 text-sm text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60',
        }
      : pendingMutation.type === 'unhide'
        ? {
            title: '确认取消隐藏图标',
            desc: `将取消隐藏图标“${pendingMutation.icon.name}”。取消后图标会重新显示。`,
            confirmLabel: '确认取消隐藏',
            confirmClass:
              'rounded-md bg-emerald-500 px-3 py-1.5 text-sm text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60',
          }
        : {
            title: '确认删除图标记录',
            desc: `将删除图标“${pendingMutation.icon.name}”在应用内的记录，不会删除磁盘文件。`,
            confirmLabel: '确认删除',
            confirmClass:
              'rounded-md bg-red-500 px-3 py-1.5 text-sm text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60',
          }
    : null

  return (
    <>
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">图标管理</h2>
          <p className="text-sm text-muted-foreground">
            首次进入主页面会自动扫描并保存桌面与 customapp
            图标快照，后续不会主动扫描。你可以在这里手动同步并管理图标。
          </p>
          <p className="text-xs text-muted-foreground">
            customapp 默认目录：{defaultCustomAppDir || '加载中...'}
          </p>
          <p className="text-xs text-muted-foreground">
            customapp 当前生效目录：{effectiveCustomAppDir || '加载中...'}
          </p>
        </div>

        <div className="grid gap-3">
          {(Object.keys(ICON_SYNC_ACTIONS) as IconSyncAction[]).map(actionKey => {
            const action = ICON_SYNC_ACTIONS[actionKey]
            return (
              <button
                key={actionKey}
                onClick={() => setPendingAction(actionKey)}
                disabled={syncing || mutating}
                className="rounded-lg border border-border bg-secondary px-4 py-3 text-left transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                <p className="text-sm font-medium">{action.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{action.desc}</p>
              </button>
            )
          })}
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-secondary/30 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="搜索图标名称或路径"
              className="min-w-[220px] flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500"
            />
            <button
              onClick={() => void refreshIconManagerList()}
              disabled={listLoading || syncing || mutating}
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              刷新列表
            </button>
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
            图标总数 {allIcons.length} 项，当前筛选结果 {filteredIcons.length} 项。
          </p>

          {managerErrorText ? <p className="text-sm text-red-500">{managerErrorText}</p> : null}

          <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {listLoading ? (
              <p className="text-sm text-muted-foreground">图标列表加载中...</p>
            ) : filteredIcons.length === 0 ? (
              <p className="text-sm text-muted-foreground">当前筛选条件下没有图标。</p>
            ) : (
              filteredIcons.map(icon => {
                const sourceLabel = icon.source === 'desktop' ? '桌面' : 'customapp'
                const sourceBadgeClass =
                  icon.source === 'desktop'
                    ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                    : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                return (
                  <div
                    key={`${icon.source}:${icon.id}`}
                    className="rounded-md border border-border bg-background/60 p-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-border bg-secondary">
                        {icon.icon_base64 ? (
                          <img
                            src={icon.icon_base64}
                            alt={icon.name}
                            className="h-full w-full object-contain"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                            No Icon
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-medium">{icon.name || '未命名'}</p>
                          <span
                            className={`rounded border px-2 py-0.5 text-[11px] ${sourceBadgeClass}`}
                          >
                            {sourceLabel}
                          </span>
                          <span
                            className={`rounded border px-2 py-0.5 text-[11px] ${
                              icon.hidden
                                ? 'border-orange-500/30 bg-orange-500/15 text-orange-400'
                                : 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400'
                            }`}
                          >
                            {icon.hidden ? '隐藏' : '未隐藏'}
                          </span>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">路径：{icon.path}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          目标：{icon.target_path || '-'}
                        </p>
                      </div>

                      <div className="flex shrink-0 gap-2">
                        {icon.hidden ? (
                          <button
                            onClick={() => setPendingMutation({ type: 'unhide', icon })}
                            disabled={syncing || mutating}
                            className="rounded-md border border-emerald-500/40 px-3 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            取消隐藏
                          </button>
                        ) : (
                          <button
                            onClick={() => setPendingMutation({ type: 'hide', icon })}
                            disabled={syncing || mutating}
                            className="rounded-md border border-blue-500/40 px-3 py-1.5 text-xs text-blue-400 hover:bg-blue-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            隐藏
                          </button>
                        )}
                        <button
                          onClick={() => setPendingMutation({ type: 'delete', icon })}
                          disabled={syncing || mutating}
                          className="rounded-md border border-red-500/40 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {resultText ? <p className="text-sm text-muted-foreground">{resultText}</p> : null}
      </div>

      {pendingAction ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-xl">
            <h3 className="text-base font-semibold">
              {ICON_SYNC_ACTIONS[pendingAction].confirmTitle}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {ICON_SYNC_ACTIONS[pendingAction].confirmDesc}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setPendingAction(null)}
                disabled={syncing}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                取消
              </button>
              <button
                onClick={handleConfirmSync}
                disabled={syncing}
                className="rounded-md bg-blue-500 px-3 py-1.5 text-sm text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {syncing ? '同步中...' : '开始同步'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingMutation && mutationDialogText ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-xl">
            <h3 className="text-base font-semibold">{mutationDialogText.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{mutationDialogText.desc}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setPendingMutation(null)}
                disabled={mutating}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                取消
              </button>
              <button
                onClick={handleConfirmMutation}
                disabled={mutating}
                className={mutationDialogText.confirmClass}
              >
                {mutating ? '处理中...' : mutationDialogText.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

function AboutPanel() {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-muted-foreground">关于页面待完善</p>
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

  const restoreMainWindow = useCallback(async () => {
    const mainWindow = await WebviewWindow.getByLabel('main')
    if (!mainWindow) return

    await mainWindow.unminimize().catch(() => undefined)
    await mainWindow.show().catch(() => undefined)
    await mainWindow.setFocus().catch(() => undefined)
  }, [])

  const closeSettingsWindow = useCallback(async () => {
    if (isClosingRef.current) return

    isClosingRef.current = true
    try {
      await restoreMainWindow()
      await getCurrentWindow().close()
    } catch (e) {
      isClosingRef.current = false
      console.error('Failed to close settings window:', e)
    }
  }, [restoreMainWindow])

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
    <div className="flex h-screen w-screen flex-col bg-background text-foreground">
      <header className="flex h-12 items-center gap-3 border-b border-border bg-secondary/50 px-4">
        <div
          onPointerDown={handleWindowDragStart}
          onDoubleClick={handleToggleMaximizeWindow}
          className="flex min-w-0 flex-1 items-center gap-3 cursor-grab active:cursor-grabbing"
        >
          <p className="shrink-0 text-sm font-semibold">DesktopGo</p>
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
        <nav className="flex w-48 flex-col border-r border-border bg-secondary/50 px-4 py-3">
          <ul className="flex flex-col gap-1">
            {NAV_ITEMS.map(item => (
              <li key={item.key}>
                <button
                  onClick={() => setActiveNav(item.key)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors cursor-pointer ${
                    activeNav === item.key
                      ? 'bg-zinc-200 text-foreground font-medium dark:bg-zinc-700/60'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <main className="min-h-0 flex-1 overflow-y-auto p-8">
          {activeNav === 'settings' && <SettingsPanel />}
          {activeNav === 'search' && <SearchSettingsPanel />}
          {activeNav === 'iconManager' && <IconManagerPanel />}
          {activeNav === 'update' && <UpdatePanel />}
          {activeNav === 'about' && <AboutPanel />}
        </main>
      </div>
    </div>
  )
}
