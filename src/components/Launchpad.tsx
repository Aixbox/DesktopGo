import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { invoke } from '@tauri-apps/api/core'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window'
import { Check, ChevronDown, Download } from 'lucide-react'
import { translate, useI18n } from '@/lib/i18n'
import { getSetting } from '@/lib/settingsStore'
import { applyTheme, getSavedTheme } from '@/lib/theme'
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
import { useIconStore } from '@/stores/iconStore'
import type { DesktopIcon, IconSize, TitleLineCount, WindowMode } from '@/types'
import { IconGrid } from './IconGrid'

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

const LONG_PRESS_MS = 420
const ICON_SEARCH_LIMIT = 48
const SETTINGS_WINDOW_WIDTH = 800
const SETTINGS_WINDOW_HEIGHT = 600
const SEARCH_FLOATING_MENU_SELECTOR = '[data-search-floating-menu="true"]'
const EXTERNAL_SHOW_CLICK_GUARD_MS = 350

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

type SearchSource = 'icons' | 'everything'

type ImportDroppedPathsResult = {
  imported_count: number
  duplicate_count: number
  invalid_count: number
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
    selectionMode,
    selectedIconKeys,
    launchApp,
    enterSelectionMode,
    clearSelection,
    hideSelectedIcons,
    deleteSelectedIcons,
  } = useIconStore()

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
  const [isImportModeEnabled, setIsImportModeEnabled] = useState(false)
  const [isExternalDragActive, setIsExternalDragActive] = useState(false)
  const [isImportingDrop, setIsImportingDrop] = useState(false)
  const [searchPreview, setSearchPreview] = useState<Awaited<
    ReturnType<typeof getSearchPreview>
  > | null>(null)
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

  const syncImportModeState = useCallback(async () => {
    try {
      const enabled = await invoke<boolean>('get_import_mode_enabled')
      setIsImportModeEnabled(enabled)
      if (!enabled) {
        setIsExternalDragActive(false)
        setIsImportingDrop(false)
      }
    } catch (error) {
      console.error('Failed to sync import mode state:', error)
    }
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        await hydrateSettings()
        await fetchIcons()
        await syncImportModeState()
        const { windowMode: currentWindowMode, applyWindowMode } = useIconStore.getState()
        await applyWindowMode(currentWindowMode)
        const savedWindowStyle = await getSavedWindowStyle()
        applyTheme(await getSavedTheme(), savedWindowStyle)
        applyWindowStyle(savedWindowStyle)
      } catch (e) {
        console.error('Failed to initialize launchpad settings:', e)
      } finally {
        void invoke('notify_main_window_ready').catch(error => {
          console.error('Failed to notify launchpad readiness:', error)
        })
      }
    })()
  }, [fetchIcons, hydrateSettings, syncImportModeState])

  const syncExternalState = useCallback(async () => {
    try {
      const state = useIconStore.getState()
      state.clearSelection()
      await state.hydrateSettings()
      await state.fetchIcons()
      await syncImportModeState()
      await reloadSearchSettings()
      const savedWindowStyle = await getSavedWindowStyle()
      applyTheme(await getSavedTheme(), savedWindowStyle)
      applyWindowStyle(savedWindowStyle)
    } catch (e) {
      console.error('Failed to sync launchpad state:', e)
    }
  }, [reloadSearchSettings, syncImportModeState])

  const setImportModeEnabled = useCallback(
    async (enabled: boolean) => {
      try {
        const nextEnabled = await invoke<boolean>('set_import_mode_enabled', { enabled })
        setIsImportModeEnabled(nextEnabled)
        if (!nextEnabled) {
          setIsExternalDragActive(false)
        }
      } catch (error) {
        console.error('Failed to update import mode state:', error)
        toast.error(
          translate('更新导入模式失败：{error}', {
            error: String(error),
          }),
          {
            key: 'launchpad-import-mode',
            title: translate('启动台'),
          }
        )
      }
    },
    [toast]
  )

  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | null = null

    void getCurrentWindow()
      .onDragDropEvent(event => {
        if (!isImportModeEnabled) {
          return
        }

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
        setIsImportingDrop(true)

        void (async () => {
          try {
            const savedCustomAppDir = (await getSetting('customAppDir')).trim()
            const result = await invoke<ImportDroppedPathsResult>('import_dropped_paths', {
              paths: payload.paths,
              customAppDir: savedCustomAppDir || null,
            })
            await fetchIcons()

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
          } catch (error) {
            console.error('Failed to import dropped paths:', error)
            toast.error(
              translate('拖入导入失败：{error}', {
                error: String(error),
              }),
              {
                key: 'launchpad-import-drop',
                title: translate('启动台'),
              }
            )
          } finally {
            setIsImportingDrop(false)
          }
        })()
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
  }, [fetchIcons, isImportModeEnabled, isImportingDrop, toast])

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
    const unlisten = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) {
        suppressBackgroundClickUntilRef.current = performance.now() + EXTERNAL_SHOW_CLICK_GUARD_MS
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
    if (isImportModeEnabled) return
    setIsExternalDragActive(false)
  }, [isImportModeEnabled])

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
    !target.closest('[data-selection-toolbar]')

  const handleBackgroundPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    const startedOnBackground = isBackgroundInteraction(target)
    backgroundPointerStartedRef.current = e.button === 0 && startedOnBackground
    if (selectionMode || e.button !== 0 || hasSearchKeyword) return
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
          if (isImportModeEnabled) {
            void setImportModeEnabled(false)
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
          if (isImportModeEnabled) {
            void setImportModeEnabled(false)
            return
          }
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
        if (isImportModeEnabled) {
          void setImportModeEnabled(false)
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
      isImportModeEnabled,
      launchIconItem,
      launchSearchItem,
      requestCloseLaunchpad,
      setImportModeEnabled,
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
      if (isImportModeEnabled) {
        event.preventDefault()
        void setImportModeEnabled(false)
        return
      }

      requestCloseLaunchpad()
    }

    window.addEventListener('keydown', handlePageEscape)
    return () => {
      window.removeEventListener('keydown', handlePageEscape)
    }
  }, [
    hasSearchKeyword,
    isImportModeEnabled,
    isSearchPanelVisible,
    requestCloseLaunchpad,
    setImportModeEnabled,
  ])

  const handleBackgroundClick = (e: ReactMouseEvent) => {
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

    if (windowMode === 'fullscreen' && !hasSearchKeyword && !isImportModeEnabled) {
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
    if (isImportModeEnabled) {
      await setImportModeEnabled(false)
    }
    const existing = await WebviewWindow.getByLabel('settings')
    if (existing) {
      await existing.destroy().catch(closeError => {
        console.error('Failed to dispose existing settings window:', closeError)
      })
      await waitForSettingsWindowDisposed()
    }

    const settingsWindow = new WebviewWindow('settings', {
      url: 'index.html?page=settings',
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
          className="launchpad-bg relative flex h-screen w-screen select-none flex-col items-center justify-center"
          onPointerDown={handleBackgroundPointerDown}
          onPointerUp={handleBackgroundPointerUp}
          onPointerCancel={handleBackgroundPointerCancel}
          onPointerLeave={handleBackgroundPointerLeave}
          onClick={handleBackgroundClick}
        >
          <div
            data-search-placeholder
            className="absolute inset-x-0 top-6 z-40 mx-auto w-full max-w-2xl px-6"
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
                    : translate('搜索桌面图标...')
                }
                aria-label={
                  searchSource === 'everything' ? translate('搜索文件') : translate('搜索桌面图标')
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

          {isImportModeEnabled ? (
            <div className="absolute right-5 top-5 z-30 max-w-[280px]">
              <div
                className="launchpad-glass-panel-strong pointer-events-auto flex items-start gap-2.5 rounded-[22px] border border-blue-500/20 px-3 py-2.5 shadow-xl"
                onPointerDown={event => {
                  event.stopPropagation()
                }}
                onClick={event => {
                  event.stopPropagation()
                }}
              >
                <div className="rounded-xl border border-blue-500/25 bg-blue-500/10 p-2 text-blue-700 dark:text-blue-300">
                  <Download className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-xs font-semibold text-foreground">
                    {translate('当前为导入模式')}
                  </p>
                  <p className="text-[11px] leading-4 text-foreground/72">
                    {translate(
                      '拖入程序、文件夹、文件或快捷方式到窗口中即可导入，按 Esc 或右键菜单可退出。'
                    )}
                  </p>
                  <button
                    type="button"
                    className="launchpad-glass-button inline-flex h-7 items-center rounded-full px-3 text-[11px] font-medium text-foreground/86 transition-colors"
                    onClick={() => {
                      void setImportModeEnabled(false)
                    }}
                  >
                    {translate('退出导入模式')}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {isImportModeEnabled && (isExternalDragActive || isImportingDrop) ? (
            <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center px-6">
              <div className="launchpad-overlay-backdrop absolute inset-0" />
              <div className="launchpad-glass-panel-strong relative flex w-full max-w-lg flex-col items-center gap-3 rounded-[28px] px-8 py-10 text-center shadow-2xl">
                <div className="rounded-full border border-blue-500/25 bg-blue-500/10 p-3 text-blue-700 dark:text-blue-300">
                  <Download className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <p className="text-lg font-semibold text-foreground">
                    {isImportingDrop ? translate('正在导入...') : translate('拖到这里即可导入')}
                  </p>
                  <p className="text-sm leading-6 text-foreground/72">
                    {translate(
                      '支持拖入快捷方式、程序、文件夹和普通文件，内容会保存到当前自定义应用目录。'
                    )}
                  </p>
                </div>
              </div>
            </div>
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
          ) : (
            <IconGrid icons={icons} layoutResetToken={layoutResetToken} />
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

        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => enterSelectionMode()}>
          {translate('编辑图标')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => {
            void setImportModeEnabled(!isImportModeEnabled)
          }}
        >
          {isImportModeEnabled ? translate('退出导入模式') : translate('导入模式')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={openSettings}>{translate('设置')}</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
