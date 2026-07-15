import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { invoke } from '@tauri-apps/api/core'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window'
import {
  Bot,
  Check,
  ChevronDown,
  Download,
  FileIcon,
  Minus,
  Pencil,
  Pin,
  RefreshCw,
  X,
} from 'lucide-react'
import { translate, useI18n } from '@/lib/i18n'
import { deriveIconEntryName } from '@/lib/iconManager'
import { getSetting } from '@/lib/settingsStore'
import { applyTheme, getSavedTheme } from '@/lib/theme'
import {
  MAIN_WINDOW_APPEARANCE_SYNC_EVENT,
  SETTINGS_RETURNED_TO_MAIN_EVENT,
  WINDOW_PERSISTENT_SYNC_EVENT,
  type WindowPersistentSyncPayload,
} from '@/lib/windowPersistent'
import { applyWindowStyle, getSavedWindowStyle } from '@/lib/windowStyle'
import { getSearchPreview, recordSearchResultRun } from '@/lib/search/api'
import { getSearchFilterLabel, getSearchFilterOptions } from '@/lib/search/filters'
import { SearchFloatingMenu } from '@/components/search/SearchFloatingMenu'
import { useSearch } from '@/lib/search/useSearch'
import { SearchPanel } from '@/components/search/SearchPanel'
import { LAUNCHPAD_LAYOUT_RESET_EVENT } from '@/components/icon-grid/services/layoutStore'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { useToast } from '@/components/ui/toast'
import { buildIconSelectionKey, useIconStore } from '@/stores/iconStore'
import type {
  DesktopIcon,
  IconSize,
  LaunchpadGridViewMode,
  TitleLineCount,
  WindowMode,
} from '@/types'
import { IconGrid } from './IconGrid'
import { AiOrganizePanel, type AiOrganizePanelRunState } from './ai/AiOrganizePanel'
import { AddIconDialog, type AddIconDialogDraft } from './icons/AddIconDialog'
import { Button } from './ui/button'

const LAUNCHPAD_SHOWN_EVENT = 'launchpad:shown'
const ICON_SIZE_OPTIONS: { label: string; value: IconSize }[] = [
  { label: '大图标', value: 'large' },
  { label: '中图标', value: 'medium' },
  { label: '小图标', value: 'small' },
]

const WINDOW_MODE_OPTIONS: { label: string; value: WindowMode }[] = [
  { label: '全屏', value: 'fullscreen' },
  { label: '大窗口', value: 'large' },
  { label: '中窗口', value: 'medium' },
  { label: '小窗口', value: 'small' },
]

const TITLE_LINE_OPTIONS: { label: string; value: TitleLineCount }[] = [
  { label: '单行标题', value: 'one' },
  { label: '双行标题', value: 'two' },
]

const GRID_VIEW_MODE_OPTIONS: { label: string; value: LaunchpadGridViewMode }[] = [
  { label: '分页网格', value: 'paged' },
  { label: '侧栏滚动', value: 'scroll' },
]

const ScrollableIconGrid = lazy(() =>
  import('./ScrollableIconGrid').then(module => ({ default: module.ScrollableIconGrid }))
)

const LONG_PRESS_MS = 420
const ICON_SEARCH_LIMIT = 48
const SETTINGS_WINDOW_WIDTH = 800
const SETTINGS_WINDOW_HEIGHT = 600
const SEARCH_FLOATING_MENU_SELECTOR = '[data-search-floating-menu="true"]'
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
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(finish)
    })
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
    const existing = await WebviewWindow.getByLabel('settings')
    if (!existing) {
      return
    }

    await new Promise(resolve => window.setTimeout(resolve, 25))
  }
}

function WindowControlButton({
  label,
  onClick,
  tone = 'default',
  active = false,
  children,
}: {
  label: string
  onClick: () => void
  tone?: 'default' | 'danger'
  active?: boolean
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
      onClick={event => {
        event.stopPropagation()
        onClick()
      }}
      className={`flex h-9 w-9 items-center justify-center rounded-md border border-transparent text-sm transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${
        active
          ? 'border-blue-500/25 bg-blue-500/12 text-blue-600 dark:text-blue-300'
          : tone === 'danger'
            ? 'text-muted-foreground hover:bg-red-500/12 hover:text-red-500 dark:hover:text-red-300'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      }`}
    >
      <span className="flex h-4 w-4 items-center justify-center">{children}</span>
    </button>
  )
}

type SearchSource = 'icons' | 'everything'

type ImportDroppedPathsResult = {
  imported_count: number
  duplicate_count: number
  invalid_count: number
}

type DroppedIconDraft = AddIconDialogDraft & {
  key: string
  selected: boolean
  preview: string
  previewLoading: boolean
}

export function Launchpad() {
  const { language } = useI18n()
  const toast = useToast()
  const {
    icons,
    loading,
    fetchIcons,
    hydrateSettings,
    iconSize,
    setIconSize,
    windowMode,
    setWindowMode,
    titleLineCount,
    setTitleLineCount,
    launchpadGridViewMode,
    setLaunchpadGridViewMode,
    selectionMode,
    selectedIconKeys,
    launchApp,
    enterSelectionMode,
    clearSelection,
    hideSelectedIcons,
    deleteSelectedIcons,
    setSelectedIconKeys,
    customNames,
  } = useIconStore()

  const [isAiOrganizeMode, setIsAiOrganizeMode] = useState(false)
  const [isAiOrganizeSidebarOpen, setIsAiOrganizeSidebarOpen] = useState(false)
  const [isScrollSidebarCompact, setIsScrollSidebarCompact] = useState(false)
  const [aiOrganizeApplyRequestToken, setAiOrganizeApplyRequestToken] = useState(0)
  const [aiOrganizeRunState, setAiOrganizeRunState] = useState<AiOrganizePanelRunState>({
    canApply: false,
    applying: false,
    hasPreview: false,
  })

  const [searchSource, setSearchSource] = useState<SearchSource>('everything')

  const {
    keyword,
    setKeyword,
    submitSearch,
    isKeywordCommitted,
    searchPending,
    hasCommittedQuery,
    loadedCount: searchLoadedCount,
    getItemAt: getSearchItemAt,
    setVisibleRange: setSearchVisibleRange,
    requestRange: requestSearchRange,
    loading: searchLoading,
    loadingMore: searchLoadingMore,
    error: searchError,
    runtimeState: searchRuntimeState,
    totalResults: searchTotalResults,
    selectedIndex,
    setSelectedIndex,
    moveSelection,
    filter: searchFilter,
    setFilter: setSearchFilter,
    matchPath: searchMatchPath,
    setMatchPath: setSearchMatchPath,
    matchCase: searchMatchCase,
    setMatchCase: setSearchMatchCase,
    regex: searchRegex,
    setRegex: setSearchRegex,
    wholeWord: searchWholeWord,
    setWholeWord: setSearchWholeWord,
    sort: searchSort,
    setSort: setSearchSort,
    history: searchHistory,
    applyHistoryEntry,
    removeHistoryEntry,
    clearHistory,
    recordCurrentSearch,
    settings: searchSettings,
    reloadSettings: reloadSearchSettings,
    clear: clearSearch,
  } = useSearch({ enabled: searchSource === 'everything' })

  const longPressTimerRef = useRef<number | null>(null)
  const longPressTriggeredRef = useRef(false)
  const backgroundPointerStartedRef = useRef(false)
  const suppressBackgroundClickUntilRef = useRef(0)
  const bypassNextFocusGuardRef = useRef(false)
  const launchpadSurfaceRef = useRef<HTMLDivElement | null>(null)
  const filterMenuRef = useRef<HTMLDivElement | null>(null)
  const filterButtonRef = useRef<HTMLButtonElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const [isSearchPanelOpen, setIsSearchPanelOpen] = useState(false)
  const [isSearchPreviewVisible, setIsSearchPreviewVisible] = useState(true)
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false)
  const [selectedIconResultIndex, setSelectedIconResultIndex] = useState(-1)
  const [searchPreviewLoading, setSearchPreviewLoading] = useState(false)
  const [searchPreviewError, setSearchPreviewError] = useState<string | null>(null)
  const [layoutResetToken, setLayoutResetToken] = useState(0)
  const [windowPersistentEnabled, setWindowPersistentEnabled] = useState(false)
  const [mainWindowAlwaysOnTopEnabled, setMainWindowAlwaysOnTopEnabled] = useState(false)
  const [isExternalDragActive, setIsExternalDragActive] = useState(false)
  const [isImportingDrop, setIsImportingDrop] = useState(false)
  const [pendingDropDrafts, setPendingDropDrafts] = useState<DroppedIconDraft[]>([])
  const [editingDropIndex, setEditingDropIndex] = useState<number | null>(null)
  const [addIconInitialDraft, setAddIconInitialDraft] = useState<AddIconDialogDraft | null>(null)
  const [addIconDialogOpen, setAddIconDialogOpen] = useState(false)
  const [marquee, setMarquee] = useState<{
    startX: number
    startY: number
    currentX: number
    currentY: number
  } | null>(null)
  const marqueeStateRef = useRef<{
    initialKeys: Set<string>
    additive: boolean
    active: boolean
    pointerId: number
    startX: number
    startY: number
  } | null>(null)
  const marqueeJustEndedRef = useRef(false)
  const [importPlacementRequest, setImportPlacementRequest] = useState<{
    token: number
    iconKeys: string[]
  } | null>(null)
  const [searchPreview, setSearchPreview] = useState<Awaited<
    ReturnType<typeof getSearchPreview>
  > | null>(null)

  const resetAiOrganizeRunState = useCallback(() => {
    setAiOrganizeRunState({
      canApply: false,
      applying: false,
      hasPreview: false,
    })
  }, [])

  const enterAiOrganizeMode = useCallback(() => {
    clearSelection()
    setIsSearchPanelOpen(false)
    setIsFilterMenuOpen(false)
    setIsAiOrganizeMode(true)
    setIsAiOrganizeSidebarOpen(true)
  }, [clearSelection])

  const toggleAiOrganizeSidebar = useCallback(() => {
    if (!isAiOrganizeMode) {
      resetAiOrganizeRunState()
      enterAiOrganizeMode()
      return
    }
    setIsAiOrganizeSidebarOpen(open => !open)
  }, [enterAiOrganizeMode, isAiOrganizeMode, resetAiOrganizeRunState])

  const exitAiOrganizeMode = useCallback(() => {
    setIsAiOrganizeSidebarOpen(false)
    setIsAiOrganizeMode(false)
    resetAiOrganizeRunState()
  }, [resetAiOrganizeRunState])

  const requestApplyAiOrganizePreview = useCallback(() => {
    setIsAiOrganizeSidebarOpen(true)
    setAiOrganizeApplyRequestToken(token => token + 1)
  }, [])
  const importPlacementTokenRef = useRef(0)
  const dropPreviewRequestRef = useRef(0)
  const pendingAddIconKeySetRef = useRef<Set<string>>(new Set())
  const searchFilterOptions = useMemo(() => {
    void language
    return getSearchFilterOptions()
  }, [language])
  const hasSearchKeyword = keyword.trim().length > 0
  const normalizedKeyword = keyword.trim().toLocaleLowerCase()
  const iconSearchResults = useMemo(() => {
    if (searchSource !== 'icons' || !normalizedKeyword) {
      return [] as DesktopIcon[]
    }

    return icons
      .filter(icon => {
        const haystacks = [icon.name, icon.path, icon.target_path]
        return haystacks.some(value => value.toLocaleLowerCase().includes(normalizedKeyword))
      })
      .slice(0, ICON_SEARCH_LIMIT)
  }, [icons, normalizedKeyword, searchSource])
  const isSearchPanelVisible = searchSource === 'everything' && isSearchPanelOpen

  const syncWindowPersistentState = useCallback(async () => {
    try {
      const enabled = await getSetting('windowPersistent')
      setWindowPersistentEnabled(enabled)
    } catch (error) {
      console.error('Failed to sync window persistent state:', error)
    }
  }, [])

  const syncMainWindowAlwaysOnTopState = useCallback(async () => {
    try {
      const enabled = await invoke<boolean>('get_main_window_always_on_top_enabled')
      setMainWindowAlwaysOnTopEnabled(enabled)
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

  useEffect(() => {
    void (async () => {
      try {
        await hydrateSettings()
        const { windowMode: currentWindowMode, applyWindowMode } = useIconStore.getState()
        await applyWindowMode(currentWindowMode)
        await waitForWindowGeometrySync()
        await fetchIcons()
        await syncWindowPersistentState()
        await syncMainWindowAlwaysOnTopState()
        await syncWindowAppearance()
      } catch (e) {
        console.error('Failed to initialize launchpad settings:', e)
      } finally {
        void invoke('notify_main_window_ready').catch(error => {
          console.error('Failed to notify launchpad readiness:', error)
        })
      }
    })()
  }, [
    fetchIcons,
    hydrateSettings,
    syncMainWindowAlwaysOnTopState,
    syncWindowAppearance,
    syncWindowPersistentState,
  ])

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
    } catch (e) {
      console.error('Failed to sync launchpad state:', e)
    }
  }, [
    reloadSearchSettings,
    syncMainWindowAlwaysOnTopState,
    syncWindowAppearance,
    syncWindowPersistentState,
  ])

  const handleAddIcons = useCallback(() => {
    pendingAddIconKeySetRef.current = new Set(icons.map(buildIconSelectionKey))
    setAddIconInitialDraft(null)
    setEditingDropIndex(null)
    setAddIconDialogOpen(true)
  }, [icons])

  const handleIconCreated = useCallback(async () => {
    setIsImportingDrop(true)
    try {
      await fetchIcons()
      const nextIcons = useIconStore.getState().icons
      const importedIconKeys = nextIcons
        .map(icon => buildIconSelectionKey(icon))
        .filter(key => !pendingAddIconKeySetRef.current.has(key))

      if (importedIconKeys.length > 0) {
        importPlacementTokenRef.current += 1
        setImportPlacementRequest({
          token: importPlacementTokenRef.current,
          iconKeys: importedIconKeys,
        })
      }
    } finally {
      setIsImportingDrop(false)
    }
  }, [fetchIcons])

  const prepareDroppedPaths = useCallback(
    (paths: string[]) => {
      const uniquePaths = Array.from(new Set(paths.filter(path => path.trim())))
      if (uniquePaths.length === 0) return
      const requestId = ++dropPreviewRequestRef.current
      setPendingDropDrafts([])

      const drafts = uniquePaths.map<DroppedIconDraft>(path => ({
        key: path,
        selected: true,
        displayName: deriveIconEntryName(path),
        targetPath: path,
        launchArguments: '',
        workingDirectory: '',
        customIconPath: '',
        preview: '',
        previewLoading: true,
      }))

      if (drafts.length === 1) {
        pendingAddIconKeySetRef.current = new Set(icons.map(buildIconSelectionKey))
        setAddIconInitialDraft(drafts[0])
        setEditingDropIndex(null)
        setAddIconDialogOpen(true)
        return
      }

      setPendingDropDrafts(drafts)
      void Promise.all(
        drafts.map(async draft => {
          try {
            const preview = await invoke<string>('get_drag_preview_icon', {
              path: draft.targetPath,
              iconSize: 48,
            })
            return { key: draft.key, preview }
          } catch {
            return { key: draft.key, preview: '' }
          }
        })
      ).then(results => {
        if (dropPreviewRequestRef.current !== requestId) return
        const previewByKey = new Map(results.map(result => [result.key, result.preview]))
        setPendingDropDrafts(current =>
          current.map(draft => ({
            ...draft,
            preview: previewByKey.get(draft.key) ?? '',
            previewLoading: false,
          }))
        )
      })
    },
    [icons]
  )

  const handleEditDroppedDraft = useCallback(
    (index: number) => {
      const draft = pendingDropDrafts[index]
      if (!draft) return
      setAddIconInitialDraft(draft)
      setEditingDropIndex(index)
      setAddIconDialogOpen(true)
    },
    [pendingDropDrafts]
  )

  const handleSaveDroppedDraft = useCallback(
    async (draft: AddIconDialogDraft) => {
      if (editingDropIndex === null) return
      const previewPath = draft.customIconPath || draft.targetPath
      const preview = await invoke<string>('get_drag_preview_icon', {
        path: previewPath,
        iconSize: 48,
      }).catch(() => '')
      setPendingDropDrafts(current =>
        current.map((item, index) =>
          index === editingDropIndex
            ? {
                ...item,
                ...draft,
                selected: true,
                preview,
                previewLoading: false,
              }
            : item
        )
      )
    },
    [editingDropIndex]
  )

  const handleAddIconDialogOpenChange = useCallback((nextOpen: boolean) => {
    setAddIconDialogOpen(nextOpen)
    if (nextOpen) return
    setAddIconInitialDraft(null)
    setEditingDropIndex(null)
  }, [])

  const handleConfirmDroppedImport = useCallback(async () => {
    const selectedDrafts = pendingDropDrafts.filter(draft => draft.selected)
    if (selectedDrafts.length === 0 || isImportingDrop) return

    setIsImportingDrop(true)
    try {
      const previousIconKeySet = new Set(icons.map(buildIconSelectionKey))
      const result = { imported_count: 0, duplicate_count: 0, invalid_count: 0 }
      const failedKeys = new Set<string>()
      let firstItemError = ''
      for (const draft of selectedDrafts) {
        try {
          const itemResult = await invoke<ImportDroppedPathsResult>('create_icon_entry', {
            input: {
              displayName: draft.displayName,
              targetPath: draft.targetPath,
              launchArguments: draft.launchArguments,
              workingDirectory: draft.workingDirectory,
              customIconPath: draft.customIconPath,
            },
          })
          result.imported_count += itemResult.imported_count
          result.duplicate_count += itemResult.duplicate_count
          result.invalid_count += itemResult.invalid_count
        } catch (error) {
          failedKeys.add(draft.key)
          result.invalid_count += 1
          if (!firstItemError) firstItemError = String(error)
        }
      }
      await fetchIcons()

      if (result.imported_count > 0) {
        const nextIcons = useIconStore.getState().icons
        const importedIconKeys = nextIcons
          .map(icon => buildIconSelectionKey(icon))
          .filter(key => !previousIconKeySet.has(key))

        if (importedIconKeys.length > 0) {
          importPlacementTokenRef.current += 1
          setImportPlacementRequest({
            token: importPlacementTokenRef.current,
            iconKeys: importedIconKeys,
          })
        }
      }

      const message = translate(
        '导入完成：新增 {imported} 项，重复 {duplicate} 项，无效 {invalid} 项。',
        {
          imported: result.imported_count,
          duplicate: result.duplicate_count,
          invalid: result.invalid_count,
        }
      )

      if (result.imported_count > 0) {
        toast.success(message, {
          key: 'launchpad-import-drop',
          title: translate('启动台'),
          duration: 3600,
        })
      } else {
        toast.info(message, {
          key: 'launchpad-import-drop',
          title: translate('启动台'),
          duration: 3200,
        })
      }
      if (failedKeys.size > 0) {
        setPendingDropDrafts(current => current.filter(draft => failedKeys.has(draft.key)))
        toast.error(
          translate('部分项目未能导入：{error}', {
            error: firstItemError,
          }),
          {
            key: 'launchpad-import-drop-error',
            title: translate('启动台'),
          }
        )
      } else {
        setPendingDropDrafts([])
      }
    } catch (error) {
      console.error('Failed to import dropped paths:', error)
      toast.error(translate('拖入导入失败：{error}', { error: String(error) }), {
        key: 'launchpad-import-drop',
        title: translate('启动台'),
      })
    } finally {
      setIsImportingDrop(false)
    }
  }, [fetchIcons, icons, isImportingDrop, pendingDropDrafts, toast])

  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | null = null

    void getCurrentWindow()
      .onDragDropEvent(event => {
        const payload = event.payload
        if (payload.type === 'enter' || payload.type === 'over') {
          setIsExternalDragActive(true)
          return
        }

        if (payload.type === 'leave') {
          if (!isImportingDrop) {
            setIsExternalDragActive(false)
          }
          return
        }

        if (payload.type !== 'drop') {
          return
        }

        setIsExternalDragActive(false)
        prepareDroppedPaths(payload.paths)
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
  }, [isImportingDrop, prepareDroppedPaths])

  const applyLaunchpadOpenFocus = useCallback(async () => {
    try {
      const target = await getSetting('launchpadOpenFocusTarget')
      window.requestAnimationFrame(() => {
        if (target === 'search') {
          searchInputRef.current?.focus({ preventScroll: true })
          return
        }

        // 这里只在启动台真正显示时切换焦点，避免普通回焦场景
        // 抢走重命名输入框或系统对话框返回后的原始焦点。
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur()
        }
        launchpadSurfaceRef.current?.focus({ preventScroll: true })
      })
    } catch (error) {
      console.error('Failed to apply launchpad open focus target:', error)
    }
  }, [])

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const state = marqueeStateRef.current
      if (!state?.active || state.pointerId !== event.pointerId) return
      setMarquee(prev => {
        if (!prev) return prev
        if (prev.currentX === event.clientX && prev.currentY === event.clientY) return prev
        return { ...prev, currentX: event.clientX, currentY: event.clientY }
      })
    }

    const handlePointerUp = (event: PointerEvent) => {
      const state = marqueeStateRef.current
      if (!state?.active || state.pointerId !== event.pointerId) return
      state.active = false
      const dx = Math.abs(event.clientX - state.startX)
      const dy = Math.abs(event.clientY - state.startY)
      const moved = dx > 2 || dy > 2
      marqueeStateRef.current = null
      if (moved) {
        marqueeJustEndedRef.current = true
        window.setTimeout(() => {
          marqueeJustEndedRef.current = false
        }, 60)
      }
      setMarquee(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [])

  useEffect(() => {
    const state = marqueeStateRef.current
    if (!state || !marquee) return
    const left = Math.min(marquee.startX, marquee.currentX)
    const right = Math.max(marquee.startX, marquee.currentX)
    const top = Math.min(marquee.startY, marquee.currentY)
    const bottom = Math.max(marquee.startY, marquee.currentY)
    const nodes = document.querySelectorAll<HTMLElement>('[data-selection-key]')
    const hits: string[] = []
    nodes.forEach(node => {
      const key = node.getAttribute('data-selection-key')
      if (!key) return
      const rect = node.getBoundingClientRect()
      if (rect.right < left || rect.left > right || rect.bottom < top || rect.top > bottom) return
      hits.push(key)
    })
    const hitSet = new Set(hits)
    let nextKeys: string[]
    if (state.additive) {
      const merged = new Set(state.initialKeys)
      hits.forEach(key => merged.add(key))
      nextKeys = Array.from(merged)
    } else {
      nextKeys = Array.from(hitSet)
    }
    setSelectedIconKeys(nextKeys)
  }, [marquee, setSelectedIconKeys])

  useEffect(() => {
    const unlisten = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) {
        if (bypassNextFocusGuardRef.current) {
          bypassNextFocusGuardRef.current = false
          suppressBackgroundClickUntilRef.current = 0
        } else {
          suppressBackgroundClickUntilRef.current = performance.now() + EXTERNAL_SHOW_CLICK_GUARD_MS
        }
        void syncExternalState()
      }
    })
    return () => {
      unlisten.then(fn => fn())
    }
  }, [syncExternalState])

  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | null = null

    void getCurrentWindow()
      .listen(MAIN_WINDOW_APPEARANCE_SYNC_EVENT, () => {
        void syncWindowAppearance()
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
  }, [syncWindowAppearance])

  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | null = null

    void getCurrentWindow()
      .listen(LAUNCHPAD_SHOWN_EVENT, () => {
        void applyLaunchpadOpenFocus()
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
  }, [applyLaunchpadOpenFocus])

  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | null = null

    void getCurrentWindow()
      .listen<WindowPersistentSyncPayload>(WINDOW_PERSISTENT_SYNC_EVENT, event => {
        const enabled = Boolean(event.payload?.enabled)
        setWindowPersistentEnabled(enabled)
        void getSavedWindowStyle()
          .then(style => {
            applyWindowStyle(style, enabled)
          })
          .catch(error => {
            console.error('Failed to sync launchpad window style after persistent change:', error)
          })
        if (!enabled) {
          // 从设置关闭“窗口常驻”返回主窗口时，下一次焦点恢复不应再吞掉
          // 用户对全屏空白区域的首次点击，否则会表现成“必须先点一下窗口”。
          bypassNextFocusGuardRef.current = true
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

  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | null = null

    void getCurrentWindow()
      .listen(SETTINGS_RETURNED_TO_MAIN_EVENT, () => {
        bypassNextFocusGuardRef.current = true
        suppressBackgroundClickUntilRef.current = 0
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

  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | null = null

    void getCurrentWindow()
      .listen(LAUNCHPAD_LAYOUT_RESET_EVENT, () => {
        // 布局重置不会直接改变 icons 数据，需要额外递增令牌，强制 IconGrid 丢弃旧内存布局。
        setLayoutResetToken(current => current + 1)
        void syncExternalState()
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
  }, [syncExternalState])

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!isFilterMenuOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      const clickedFilterButton = filterButtonRef.current?.contains(target) ?? false

      if (!filterMenuRef.current?.contains(target) && !clickedFilterButton) {
        setIsFilterMenuOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [isFilterMenuOpen])

  useEffect(() => {
    if (searchSource === 'icons') {
      setIsFilterMenuOpen(false)
      return
    }

    if (hasSearchKeyword) {
      setIsSearchPanelOpen(true)
    }
  }, [hasSearchKeyword, searchSource])

  useEffect(() => {
    if (searchSource !== 'icons' || !isSearchPanelOpen || iconSearchResults.length === 0) {
      setSelectedIconResultIndex(-1)
      return
    }

    setSelectedIconResultIndex(current => {
      if (current >= 0 && current < iconSearchResults.length) {
        return current
      }
      return 0
    })
  }, [iconSearchResults.length, isSearchPanelOpen, searchSource])

  const selectedSearchItem = selectedIndex >= 0 ? getSearchItemAt(selectedIndex) : null
  const selectedSearchPath = selectedSearchItem?.path ?? ''
  const selectedFilterLabel = getSearchFilterLabel(searchFilter)

  useEffect(() => {
    if (!isSearchPanelVisible || !isSearchPreviewVisible || !selectedSearchPath) {
      setSearchPreview(null)
      setSearchPreviewError(null)
      setSearchPreviewLoading(false)
      return
    }

    let cancelled = false
    setSearchPreviewLoading(true)
    setSearchPreviewError(null)

    void getSearchPreview(selectedSearchPath)
      .then(preview => {
        if (cancelled) return
        setSearchPreview(preview)
      })
      .catch(previewError => {
        if (cancelled) return
        setSearchPreview(null)
        setSearchPreviewError(String(previewError))
      })
      .finally(() => {
        if (!cancelled) {
          setSearchPreviewLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [isSearchPanelVisible, isSearchPreviewVisible, selectedSearchPath])

  const launchIconItem = useCallback(
    async (icon: DesktopIcon) => {
      try {
        await launchApp(icon.path)
        clearSearch()
      } catch (e) {
        console.error('Failed to launch selected desktop icon:', e)
      }
    },
    [clearSearch, launchApp]
  )

  const requestCloseLaunchpad = useCallback(() => {
    void invoke('toggle_window').catch(error => {
      console.error('Failed to hide launchpad window:', error)
    })
  }, [])

  const handleMinimizeWindow = useCallback(() => {
    void getCurrentWindow()
      .minimize()
      .catch(error => {
        console.error('Failed to minimize launchpad window:', error)
      })
  }, [])

  const handleToggleAlwaysOnTop = useCallback(() => {
    const nextEnabled = !mainWindowAlwaysOnTopEnabled
    void invoke<boolean>('set_main_window_always_on_top_enabled', {
      enabled: nextEnabled,
    })
      .then(setMainWindowAlwaysOnTopEnabled)
      .catch(error => {
        console.error('Failed to update launchpad always-on-top state:', error)
      })
  }, [mainWindowAlwaysOnTopEnabled])

  const clearBackgroundLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  const isBackgroundInteraction = (target: HTMLElement) =>
    !target.closest('[data-icon]') &&
    !target.closest('[data-dock]') &&
    !target.closest('[data-dock-menu="true"]') &&
    !target.closest('[data-search-placeholder]') &&
    !target.closest(SEARCH_FLOATING_MENU_SELECTOR) &&
    !target.closest('[data-pagination]') &&
    !target.closest('[data-grid-mode-nav]') &&
    !target.closest('[data-selection-toolbar]') &&
    !target.closest('[data-ai-organize-toolbar]') &&
    !target.closest('[data-ai-organize-sidebar]')

  const handleBackgroundPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    const startedOnBackground = isBackgroundInteraction(target)
    backgroundPointerStartedRef.current = e.button === 0 && startedOnBackground
    if (selectionMode && e.button === 0 && startedOnBackground) {
      marqueeStateRef.current = {
        initialKeys: new Set(selectedIconKeys),
        additive: e.ctrlKey || e.shiftKey,
        active: true,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
      }
      setMarquee({
        startX: e.clientX,
        startY: e.clientY,
        currentX: e.clientX,
        currentY: e.clientY,
      })
      return
    }
    if (isAiOrganizeMode || selectionMode || e.button !== 0 || hasSearchKeyword) return
    if (!startedOnBackground) return

    longPressTriggeredRef.current = false
    clearBackgroundLongPressTimer()
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true
      enterSelectionMode()
    }, LONG_PRESS_MS)
  }

  const handleBackgroundPointerUp = () => {
    clearBackgroundLongPressTimer()
  }

  const handleBackgroundPointerCancel = () => {
    clearBackgroundLongPressTimer()
    backgroundPointerStartedRef.current = false
  }

  const handleBackgroundPointerLeave = () => {
    clearBackgroundLongPressTimer()
  }

  const isWindowDragInteractiveTarget = (target: EventTarget | null) => {
    const element =
      target instanceof Element ? target : target instanceof Node ? target.parentElement : null

    return Boolean(
      element?.closest(
        'button, a, input, textarea, select, [role="button"], [data-no-window-drag="true"]'
      )
    )
  }

  const handleWindowTopDragStart = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    if (isWindowDragInteractiveTarget(event.target)) return

    event.stopPropagation()
    void getCurrentWindow()
      .startDragging()
      .catch(error => {
        console.error('Failed to start dragging launchpad window:', error)
      })
  }

  const handleSurfacePointerDownCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isSearchPanelOpen) return

    const target = event.target as HTMLElement | null
    const isSearchInteraction =
      !!target?.closest('[data-search-placeholder]') ||
      !!target?.closest(SEARCH_FLOATING_MENU_SELECTOR) ||
      !!target?.closest('[data-dock-menu="true"]')

    if (!isSearchInteraction) {
      setIsSearchPanelOpen(false)
    }
  }

  const launchSearchItem = useCallback(
    async (path: string) => {
      try {
        await recordCurrentSearch().catch(() => {
          // Ignore history persistence failure on launch.
        })
        await invoke('launch_app', { path })
        void recordSearchResultRun(path).catch(() => {
          // Ignore Everything run history update failure.
        })
        await invoke('toggle_window')
        clearSearch()
      } catch (e) {
        console.error('Failed to launch selected search item:', e)
      }
    },
    [clearSearch, recordCurrentSearch]
  )

  const handleSearchNavigationKey = useCallback(
    (key: string, preventDefault: () => void) => {
      if (searchSource === 'icons') {
        if (key === 'ArrowDown') {
          preventDefault()
          if (iconSearchResults.length === 0) return
          setSelectedIconResultIndex(current => {
            const safeCurrent = current < 0 ? 0 : current
            return (safeCurrent + 1) % iconSearchResults.length
          })
          return
        }

        if (key === 'ArrowUp') {
          preventDefault()
          if (iconSearchResults.length === 0) return
          setSelectedIconResultIndex(current => {
            const safeCurrent = current < 0 ? 0 : current
            return (safeCurrent - 1 + iconSearchResults.length) % iconSearchResults.length
          })
          return
        }

        if (key === 'Enter') {
          preventDefault()
          const selectedIcon = iconSearchResults[selectedIconResultIndex] ?? iconSearchResults[0]
          if (selectedIcon) {
            void launchIconItem(selectedIcon)
          }
          return
        }

        if (key === 'Escape') {
          preventDefault()
          if (hasSearchKeyword) {
            clearSearch()
            return
          }
          if (isSearchPanelVisible) {
            setIsSearchPanelOpen(false)
            return
          }
          requestCloseLaunchpad()
        }
        return
      }

      if (key === 'ArrowDown') {
        preventDefault()
        if (!isSearchPanelVisible && hasSearchKeyword) {
          setIsSearchPanelOpen(true)
        }
        moveSelection(1)
        return
      }

      if (key === 'ArrowUp') {
        preventDefault()
        if (!isSearchPanelVisible && hasSearchKeyword) {
          setIsSearchPanelOpen(true)
        }
        moveSelection(-1)
        return
      }

      if (key === 'Enter') {
        preventDefault()
        if (!isSearchPanelVisible && hasSearchKeyword) {
          setIsSearchPanelOpen(true)
        }
        if (!searchSettings.liveOnType) {
          if (!isKeywordCommitted) {
            submitSearch()
            return
          }
          submitSearch()
        }
        if (!searchSettings.openOnEnter) {
          return
        }
        const selectedItem = getSearchItemAt(selectedIndex)
        if (selectedItem) {
          void launchSearchItem(selectedItem.path)
        } else if (selectedIndex >= 0) {
          requestSearchRange(selectedIndex, selectedIndex)
        }
        return
      }

      if (key === 'Escape') {
        preventDefault()
        if (isSearchPanelVisible && !hasSearchKeyword) {
          requestCloseLaunchpad()
          return
        }
        if (isSearchPanelVisible) {
          setIsSearchPanelOpen(false)
          return
        }
        if (hasSearchKeyword) {
          clearSearch()
          return
        }
        requestCloseLaunchpad()
      }
    },
    [
      clearSearch,
      getSearchItemAt,
      hasSearchKeyword,
      iconSearchResults,
      isKeywordCommitted,
      isSearchPanelVisible,
      moveSelection,
      requestSearchRange,
      searchSettings.liveOnType,
      searchSettings.openOnEnter,
      searchSource,
      selectedIconResultIndex,
      selectedIndex,
      submitSearch,
      launchIconItem,
      launchSearchItem,
      requestCloseLaunchpad,
    ]
  )

  const handleSearchInputKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    handleSearchNavigationKey(e.key, () => e.preventDefault())
  }

  useEffect(() => {
    if (!isSearchPanelOpen) {
      return
    }

    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isSearchInput = target === searchInputRef.current
      const isEditable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable === true

      if (isSearchInput) {
        return
      }
      if (target?.closest(SEARCH_FLOATING_MENU_SELECTOR)) {
        return
      }
      if (isEditable) {
        return
      }

      handleSearchNavigationKey(event.key, () => event.preventDefault())
    }

    document.addEventListener('keydown', handleDocumentKeyDown)
    return () => {
      document.removeEventListener('keydown', handleDocumentKeyDown)
    }
  }, [handleSearchNavigationKey, isSearchPanelOpen])

  useEffect(() => {
    const handlePageEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return

      const target = event.target as HTMLElement | null
      const isEditable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable === true

      if (isEditable) return
      if (target?.closest('[data-search-placeholder]')) return
      if (target?.closest(SEARCH_FLOATING_MENU_SELECTOR)) return
      if (target?.closest('[data-dock-menu="true"]')) return
      if (document.querySelector('[data-folder-modal="true"]')) return
      if (isSearchPanelVisible || hasSearchKeyword) return

      requestCloseLaunchpad()
    }

    window.addEventListener('keydown', handlePageEscape)
    return () => {
      window.removeEventListener('keydown', handlePageEscape)
    }
  }, [hasSearchKeyword, isSearchPanelVisible, requestCloseLaunchpad])

  const handleBackgroundClick = (e: ReactMouseEvent) => {
    if (marqueeJustEndedRef.current) {
      marqueeJustEndedRef.current = false
      backgroundPointerStartedRef.current = false
      return
    }
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false
      backgroundPointerStartedRef.current = false
      return
    }

    const target = e.target as HTMLElement
    const isTrueBackgroundClick =
      backgroundPointerStartedRef.current && isBackgroundInteraction(target)
    backgroundPointerStartedRef.current = false
    const clickedOutsideSearch =
      !target.closest('[data-search-placeholder]') &&
      !target.closest(SEARCH_FLOATING_MENU_SELECTOR) &&
      !target.closest('[data-dock-menu="true"]')

    if (isSearchPanelOpen && clickedOutsideSearch && isTrueBackgroundClick) {
      setIsSearchPanelOpen(false)
      return
    }

    if (selectionMode) {
      if (isTrueBackgroundClick) {
        clearSelection()
      }
      return
    }

    if (isAiOrganizeMode) {
      return
    }

    if (windowMode === 'fullscreen' && !hasSearchKeyword && !windowPersistentEnabled) {
      if (isTrueBackgroundClick) {
        if (performance.now() < suppressBackgroundClickUntilRef.current) {
          return
        }
        void invoke('toggle_window')
      }
    }
  }

  const handleHideSelected = () => {
    if (selectedIconKeys.length === 0) return
    void hideSelectedIcons()
  }

  const handleDeleteSelected = () => {
    if (selectedIconKeys.length === 0) return
    const confirmed = window.confirm(
      translate('确定要删除已选中的 {count} 个图标吗？此操作无法撤销。', {
        count: selectedIconKeys.length,
      })
    )
    if (!confirmed) return
    void deleteSelectedIcons()
  }

  const openSettings = async () => {
    const existing = await WebviewWindow.getByLabel('settings')
    if (existing) {
      await existing.destroy().catch(closeError => {
        console.error('Failed to dispose existing settings window:', closeError)
      })
      await waitForSettingsWindowDisposed()
    }

    const settingsWindow = new WebviewWindow('settings', {
      url: 'index.html?page=settings&returnToMain=1',
      title: translate('设置'),
      // 设置窗口允许放大，但默认尺寸同时作为最小尺寸，避免布局继续被压缩。
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
    settingsWindow.once('tauri://error', e => {
      console.error('Failed to create settings window:', e)
    })
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={launchpadSurfaceRef}
          tabIndex={-1}
          className={[
            'launchpad-bg relative flex h-screen w-screen select-none flex-col items-center justify-center',
            launchpadGridViewMode === 'scroll' ? 'launchpad-scroll-layout' : '',
            launchpadGridViewMode === 'scroll' && isScrollSidebarCompact
              ? 'launchpad-scroll-sidebar-compact'
              : '',
          ].join(' ')}
          onPointerDownCapture={handleSurfacePointerDownCapture}
          onPointerDown={handleBackgroundPointerDown}
          onPointerUp={handleBackgroundPointerUp}
          onPointerCancel={handleBackgroundPointerCancel}
          onPointerLeave={handleBackgroundPointerLeave}
          onClick={handleBackgroundClick}
        >
          <div
            data-no-window-drag="true"
            className="absolute right-5 top-5 z-40 flex items-center gap-2"
          >
            <div className="launchpad-glass-panel-strong flex items-center rounded-xl border border-border/80 px-1.5 py-1 shadow-lg">
              <WindowControlButton
                label={
                  isAiOrganizeMode && isAiOrganizeSidebarOpen
                    ? translate('收起 AI 整理')
                    : translate('打开 AI 整理')
                }
                active={isAiOrganizeMode}
                onClick={toggleAiOrganizeSidebar}
              >
                <Bot className="h-4 w-4" />
              </WindowControlButton>
            </div>
            {windowPersistentEnabled ? (
              <>
                <div className="launchpad-glass-panel-strong flex items-center rounded-xl border border-border/80 px-1.5 py-1 shadow-lg">
                  <WindowControlButton
                    label={
                      mainWindowAlwaysOnTopEnabled ? translate('取消置顶') : translate('置顶窗口')
                    }
                    onClick={handleToggleAlwaysOnTop}
                  >
                    <Pin
                      className={`h-4 w-4 ${
                        mainWindowAlwaysOnTopEnabled ? 'text-blue-500 dark:text-blue-300' : ''
                      }`}
                    />
                  </WindowControlButton>
                </div>
                <div className="launchpad-glass-panel-strong flex items-center gap-1 rounded-xl border border-border/80 px-1.5 py-1 shadow-lg">
                  <WindowControlButton label={translate('最小化')} onClick={handleMinimizeWindow}>
                    <Minus className="h-4 w-4" />
                  </WindowControlButton>
                  <WindowControlButton
                    label={translate('关闭窗口')}
                    tone="danger"
                    onClick={requestCloseLaunchpad}
                  >
                    <X className="h-4 w-4" />
                  </WindowControlButton>
                </div>
              </>
            ) : null}
          </div>

          {windowPersistentEnabled ? (
            <div
              className="absolute inset-x-0 top-0 z-20 h-14"
              onPointerDown={handleWindowTopDragStart}
            />
          ) : null}

          <div
            data-search-placeholder
            className="launchpad-search-shell absolute top-6 z-40 mx-auto w-full max-w-2xl px-6"
          >
            <div className="relative min-w-0">
              <input
                ref={searchInputRef}
                data-search-placeholder
                type="text"
                value={keyword}
                onChange={e => {
                  setKeyword(e.target.value)
                  if (!isSearchPanelOpen) {
                    setIsSearchPanelOpen(true)
                  }
                }}
                onFocus={() => {
                  setIsSearchPanelOpen(true)
                }}
                onKeyDown={handleSearchInputKeyDown}
                placeholder={
                  searchSource === 'everything'
                    ? translate('搜索文件、文件夹和应用...')
                    : translate('搜索图标库...')
                }
                aria-label={
                  searchSource === 'everything' ? translate('搜索文件') : translate('搜索图标库')
                }
                className={`launchpad-glass-panel h-11 w-full rounded-full px-4 text-sm text-foreground/90 shadow-lg outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/40 ${
                  searchSource === 'everything' ? 'pr-32' : ''
                }`}
              />

              {searchSource === 'everything' ? (
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  <button
                    ref={filterButtonRef}
                    data-search-placeholder
                    type="button"
                    className="launchpad-glass-button inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs transition-colors"
                    onClick={() => setIsFilterMenuOpen(open => !open)}
                  >
                    <span className="truncate">{selectedFilterLabel}</span>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>

                  <SearchFloatingMenu
                    open={isFilterMenuOpen}
                    triggerRef={filterButtonRef}
                    menuRef={filterMenuRef}
                    width={192}
                    align="start"
                    className="launchpad-glass-panel-strong overflow-hidden rounded-2xl shadow-2xl"
                    contentClassName="p-1.5"
                  >
                    {searchFilterOptions.map(entry => (
                      <button
                        key={entry.value}
                        type="button"
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition ${
                          searchFilter === entry.value
                            ? 'bg-accent text-foreground'
                            : 'text-foreground/70 hover:bg-accent hover:text-foreground'
                        }`}
                        onClick={() => {
                          setSearchFilter(entry.value)
                          setIsFilterMenuOpen(false)
                        }}
                      >
                        <span>{entry.label}</span>
                        {searchFilter === entry.value ? (
                          <Check className="h-4 w-4 text-blue-600 dark:text-blue-300" />
                        ) : null}
                      </button>
                    ))}
                  </SearchFloatingMenu>
                </div>
              ) : null}
            </div>
          </div>

          <SearchPanel
            source={searchSource}
            keyword={keyword}
            onSourceChange={setSearchSource}
            visible={isSearchPanelOpen}
            loading={searchLoading}
            searchPending={searchPending}
            loadingMore={searchLoadingMore}
            error={searchError}
            runtimeState={searchRuntimeState}
            totalResults={searchTotalResults}
            loadedCount={searchLoadedCount}
            pageSize={searchSettings.maxResultsPerPage}
            hasCommittedQuery={hasCommittedQuery}
            getItemAt={getSearchItemAt}
            selectedItem={selectedSearchItem}
            selectedIndex={selectedIndex}
            iconResults={iconSearchResults}
            selectedIconIndex={selectedIconResultIndex}
            onSelectIcon={setSelectedIconResultIndex}
            onActivateIcon={icon => {
              void launchIconItem(icon)
            }}
            matchPath={searchMatchPath}
            onMatchPathChange={setSearchMatchPath}
            matchCase={searchMatchCase}
            onMatchCaseChange={setSearchMatchCase}
            regex={searchRegex}
            onRegexChange={setSearchRegex}
            wholeWord={searchWholeWord}
            onWholeWordChange={setSearchWholeWord}
            sort={searchSort}
            onSortChange={setSearchSort}
            history={searchHistory}
            onHistorySelect={applyHistoryEntry}
            onHistoryRemove={id => {
              void removeHistoryEntry(id)
            }}
            onHistoryClear={() => {
              void clearHistory()
            }}
            preview={searchPreview}
            previewLoading={searchPreviewLoading}
            previewError={searchPreviewError}
            previewVisible={isSearchPreviewVisible}
            onPreviewToggle={() => {
              setIsSearchPreviewVisible(visible => !visible)
            }}
            onVisibleRangeChange={setSearchVisibleRange}
            onSelect={setSelectedIndex}
            allowDoubleClickOpen={searchSettings.openOnDoubleClick}
            onActivate={item => {
              void launchSearchItem(item.path)
            }}
          />

          {isAiOrganizeMode ? (
            <div
              data-ai-organize-toolbar
              className="launchpad-glass-panel-strong absolute left-1/2 top-20 z-30 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-full border border-blue-500/20 px-3 py-2 text-sm text-foreground/90 shadow-xl"
            >
              <span className="flex items-center gap-2 px-1.5 font-medium">
                <Bot className="h-4 w-4 text-blue-600 dark:text-blue-300" />
                {translate('AI 整理模式')}
              </span>
              <span className="hidden text-xs text-muted-foreground md:inline">
                {aiOrganizeRunState.applying
                  ? translate('正在保存 AI 预览...')
                  : aiOrganizeRunState.hasPreview
                    ? translate('预览已生成，可保存或不保存退出。')
                    : translate('从右侧选择预设或输入要求开始整理。')}
              </span>
              <button
                type="button"
                onClick={toggleAiOrganizeSidebar}
                className="launchpad-glass-button rounded-full px-3 py-1 text-xs transition-colors"
              >
                {isAiOrganizeSidebarOpen ? translate('收起侧栏') : translate('展开侧栏')}
              </button>
              <button
                type="button"
                onClick={requestApplyAiOrganizePreview}
                disabled={!aiOrganizeRunState.canApply || aiOrganizeRunState.applying}
                className="rounded-full border border-blue-500/30 bg-blue-500/12 px-3 py-1 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-500/18 disabled:cursor-not-allowed disabled:opacity-45 dark:text-blue-200 dark:hover:bg-blue-500/25"
              >
                {aiOrganizeRunState.applying ? translate('保存中...') : translate('保存预览')}
              </button>
              <button
                type="button"
                onClick={exitAiOrganizeMode}
                disabled={aiOrganizeRunState.applying}
                className="launchpad-glass-button rounded-full px-3 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-45"
              >
                {translate('不保存退出')}
              </button>
            </div>
          ) : null}

          {selectionMode ? (
            <div
              data-selection-toolbar
              className="launchpad-glass-panel-strong absolute left-1/2 top-20 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full px-3 py-2 text-sm text-foreground/90"
            >
              <span className="px-2">
                {translate('已选择：{count}', { count: selectedIconKeys.length })}
              </span>
              <button
                type="button"
                onClick={handleHideSelected}
                className="launchpad-glass-button rounded-full px-3 py-1 text-xs transition-colors"
              >
                {translate('隐藏')}
              </button>
              <button
                type="button"
                onClick={handleDeleteSelected}
                className="rounded-full border border-red-500/30 px-3 py-1 text-xs text-red-700 transition-colors hover:bg-red-500/12 hover:text-red-800 dark:text-red-200 dark:hover:bg-red-500/25 dark:hover:text-red-100"
              >
                {translate('删除')}
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="launchpad-glass-button rounded-full px-3 py-1 text-xs transition-colors"
              >
                {translate('取消')}
              </button>
            </div>
          ) : null}

          {isExternalDragActive || (pendingDropDrafts.length > 0 && editingDropIndex === null) ? (
            <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/25 p-4 backdrop-blur-[2px] dark:bg-black/55">
              <div
                role={isExternalDragActive ? 'status' : 'dialog'}
                aria-modal={isExternalDragActive ? undefined : true}
                aria-labelledby={isExternalDragActive ? undefined : 'drop-import-title'}
                className="w-full max-w-3xl overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
              >
                {isExternalDragActive ? (
                  <div className="p-5 sm:p-6">
                    <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border-2 border-dashed border-primary/45 bg-primary/[0.04] px-6 py-10 text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Download className="h-5 w-5" />
                      </div>
                      <p className="mt-4 text-base font-semibold text-foreground">
                        {translate('拖到这里准备导入')}
                      </p>
                      <p className="mt-1.5 max-w-sm text-sm leading-6 text-muted-foreground">
                        {translate('松开后将打开导入表单，确认前不会添加到图标库。')}
                      </p>
                    </div>
                  </div>
                ) : (
                  <form
                    onSubmit={event => {
                      event.preventDefault()
                      void handleConfirmDroppedImport()
                    }}
                  >
                    <div className="flex items-start justify-between gap-4 border-b border-border/80 px-4 py-4 sm:px-5">
                      <div className="min-w-0 space-y-1">
                        <h2
                          id="drop-import-title"
                          className="text-base font-semibold text-foreground"
                        >
                          {translate('确认导入图标')}
                        </h2>
                        <p className="text-xs leading-5 text-muted-foreground">
                          {translate('选择需要导入的图标；可单独编辑名称、启动选项和图标。')}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={translate('关闭')}
                        onClick={() => setPendingDropDrafts([])}
                        disabled={isImportingDrop}
                        className="shrink-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="max-h-[min(28rem,56vh)] overflow-y-auto px-4 py-3 sm:px-5">
                      <div className="grid justify-start gap-x-2 gap-y-1 [grid-template-columns:repeat(auto-fill,5rem)]">
                        {pendingDropDrafts.map((draft, index) => (
                          <div key={draft.key} className="group relative min-w-0">
                            <button
                              type="button"
                              aria-pressed={draft.selected}
                              aria-label={
                                draft.selected
                                  ? translate('取消选择 {name}', { name: draft.displayName })
                                  : translate('选择 {name}', { name: draft.displayName })
                              }
                              onClick={() =>
                                setPendingDropDrafts(current =>
                                  current.map((item, itemIndex) =>
                                    itemIndex === index
                                      ? { ...item, selected: !item.selected }
                                      : item
                                  )
                                )
                              }
                              disabled={isImportingDrop}
                              className={`flex h-[4.75rem] w-full min-w-0 flex-col items-center justify-start gap-1 px-1 py-1 text-center transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${
                                draft.selected ? 'opacity-100' : 'opacity-70 hover:opacity-100'
                              }`}
                            >
                              <span
                                className={`pointer-events-none absolute left-1.5 top-0.5 z-10 flex h-3.5 w-3.5 items-center justify-center rounded-full transition-opacity ${
                                  draft.selected
                                    ? 'bg-primary text-primary-foreground opacity-100'
                                    : 'border border-border bg-background opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
                                }`}
                              >
                                {draft.selected ? <Check className="h-2.5 w-2.5" /> : null}
                              </span>
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden">
                                {draft.previewLoading ? (
                                  <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                                ) : draft.preview ? (
                                  <img
                                    src={draft.preview}
                                    alt=""
                                    className="h-full w-full object-contain"
                                  />
                                ) : (
                                  <FileIcon className="h-5 w-5 text-muted-foreground" />
                                )}
                              </span>
                              <span
                                className="min-h-6 w-full overflow-hidden text-[11px] font-medium leading-3 text-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]"
                                title={draft.displayName}
                              >
                                {draft.displayName}
                              </span>
                            </button>
                            <button
                              type="button"
                              aria-label={translate('编辑 {name}', { name: draft.displayName })}
                              title={translate('编辑')}
                              onClick={() => handleEditDroppedDraft(index)}
                              disabled={isImportingDrop}
                              className="absolute right-1.5 top-0.5 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-background/90 text-muted-foreground opacity-100 shadow-sm transition-[opacity,color] hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                            >
                              <Pencil className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap justify-end gap-2 border-t border-border/80 bg-muted/15 px-4 py-3 sm:px-5">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setPendingDropDrafts([])}
                        disabled={isImportingDrop}
                        className="min-w-0 flex-1 sm:flex-none"
                      >
                        {translate('取消')}
                      </Button>
                      <Button
                        type="submit"
                        disabled={
                          isImportingDrop || !pendingDropDrafts.some(draft => draft.selected)
                        }
                        className="min-w-0 flex-1 sm:flex-none"
                      >
                        {isImportingDrop ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                        {isImportingDrop
                          ? translate('正在导入...')
                          : translate('确认导入（{count}）', {
                              count: pendingDropDrafts.filter(draft => draft.selected).length,
                            })}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          ) : null}

          {marquee ? (
            <div
              className="pointer-events-none fixed z-40 rounded-sm border border-blue-500/60 bg-blue-500/15 shadow-sm"
              style={{
                left: Math.min(marquee.startX, marquee.currentX),
                top: Math.min(marquee.startY, marquee.currentY),
                width: Math.abs(marquee.currentX - marquee.startX),
                height: Math.abs(marquee.currentY - marquee.startY),
              }}
            />
          ) : null}

          {loading ? (
            <div className="flex items-center gap-3">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-foreground/40 border-t-foreground" />
              <span className="text-lg text-foreground/70">{translate('Loading...')}</span>
            </div>
          ) : icons.length === 0 ? (
            <div className="text-lg text-foreground/50">
              {translate('No desktop shortcuts found')}
            </div>
          ) : launchpadGridViewMode === 'scroll' ? (
            <Suspense
              fallback={
                <div className="flex items-center gap-3">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-foreground/40 border-t-foreground" />
                  <span className="text-lg text-foreground/70">{translate('Loading...')}</span>
                </div>
              }
            >
              <ScrollableIconGrid
                icons={icons}
                layoutResetToken={layoutResetToken}
                sidebarCompact={isScrollSidebarCompact}
                onToggleSidebarCompact={() => setIsScrollSidebarCompact(current => !current)}
                importPlacementRequest={importPlacementRequest}
                addIconDisabled={isImportingDrop || addIconDialogOpen}
                onAddIcon={handleAddIcons}
              />
            </Suspense>
          ) : (
            <IconGrid
              icons={icons}
              layoutResetToken={layoutResetToken}
              importPlacementRequest={importPlacementRequest}
            />
          )}
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-44">
        <ContextMenuSub>
          <ContextMenuSubTrigger>{translate('图标大小')}</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-44">
            <ContextMenuRadioGroup
              value={iconSize}
              onValueChange={value => setIconSize(value as IconSize)}
            >
              {ICON_SIZE_OPTIONS.map(option => (
                <ContextMenuRadioItem key={option.value} value={option.value}>
                  {translate(option.label)}
                </ContextMenuRadioItem>
              ))}
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSub>
          <ContextMenuSubTrigger>{translate('窗口大小')}</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-44">
            <ContextMenuRadioGroup
              value={windowMode}
              onValueChange={value => setWindowMode(value as WindowMode)}
            >
              {WINDOW_MODE_OPTIONS.map(option => (
                <ContextMenuRadioItem key={option.value} value={option.value}>
                  {translate(option.label)}
                </ContextMenuRadioItem>
              ))}
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSub>
          <ContextMenuSubTrigger>{translate('标题行数')}</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-44">
            <ContextMenuRadioGroup
              value={titleLineCount}
              onValueChange={value => setTitleLineCount(value as TitleLineCount)}
            >
              {TITLE_LINE_OPTIONS.map(option => (
                <ContextMenuRadioItem key={option.value} value={option.value}>
                  {translate(option.label)}
                </ContextMenuRadioItem>
              ))}
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSub>
          <ContextMenuSubTrigger>{translate('网格模式')}</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-44">
            <ContextMenuRadioGroup
              value={launchpadGridViewMode}
              onValueChange={value => setLaunchpadGridViewMode(value as LaunchpadGridViewMode)}
            >
              {GRID_VIEW_MODE_OPTIONS.map(option => (
                <ContextMenuRadioItem key={option.value} value={option.value}>
                  {translate(option.label)}
                </ContextMenuRadioItem>
              ))}
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => enterSelectionMode()}>
          {translate('编辑图标')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={enterAiOrganizeMode}>{translate('AI 智能整理')}</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={openSettings}>{translate('设置')}</ContextMenuItem>
      </ContextMenuContent>

      <AddIconDialog
        open={addIconDialogOpen}
        onOpenChange={handleAddIconDialogOpenChange}
        onCreated={handleIconCreated}
        initialDraft={addIconInitialDraft}
        onSubmitDraft={editingDropIndex !== null ? handleSaveDroppedDraft : undefined}
      />

      <AiOrganizePanel
        open={isAiOrganizeMode}
        visible={isAiOrganizeSidebarOpen}
        icons={icons}
        customNames={customNames}
        applyRequestToken={aiOrganizeApplyRequestToken}
        onRunStateChange={setAiOrganizeRunState}
        onCollapse={() => setIsAiOrganizeSidebarOpen(false)}
        onClose={exitAiOrganizeMode}
        onPreviewed={async () => {
          setLayoutResetToken(current => current + 1)
          await fetchIcons()
        }}
        onApplied={async () => {
          // 与设置页「重置布局」一致：递增令牌强制 IconGrid 丢弃旧内存布局，
          // 重新从磁盘 hydrate 出 AI 整理后的结果。
          setLayoutResetToken(current => current + 1)
          await fetchIcons()
        }}
      />
    </ContextMenu>
  )
}
