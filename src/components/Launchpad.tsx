import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Bot, Check, ChevronDown, Plus, RefreshCw } from 'lucide-react'
import { translate, useI18n } from '@/lib/i18n'
import { recordSearchResultRun } from '@/lib/search/api'
import { getSearchFilterLabel, getSearchFilterOptions } from '@/lib/search/filters'
import { searchSourceIncludesFiles, type SearchSource } from '@/lib/search/scope'
import { useSearchPreview } from '@/lib/search/useSearchPreview'
import { useShortcutSearchResults } from '@/lib/search/useShortcutSearchResults'
import { useSearchScopeChange } from '@/lib/search/useSearchScopeChange'
import { SearchFloatingMenu } from '@/components/search/SearchFloatingMenu'
import {
  getUnifiedSelectedShortcutIndex,
  handleSearchNavigation,
  shouldUseShortcutHorizontalNavigation,
} from '@/components/search/searchNavigation'
import { LaunchpadContextMenuContent } from '@/components/launchpad/LaunchpadContextMenuContent'
import { LaunchpadIconImportLayer } from '@/components/launchpad/LaunchpadIconImportLayer'
import { LaunchpadWindowControls } from '@/components/launchpad/LaunchpadWindowControls'
import { useLaunchpadIconImportController } from '@/components/launchpad/useLaunchpadIconImportController'
import { useLaunchpadSurfaceInteractions } from '@/components/launchpad/useLaunchpadSurfaceInteractions'
import { useLaunchpadWindowController } from '@/components/launchpad/useLaunchpadWindowController'
import { useSearch } from '@/lib/search/useSearch'
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu'
import { useToast } from '@/components/ui/toast'
import { useIconStore } from '@/stores/iconStore'
import type { DesktopIcon } from '@/types'
import type { AiOrganizePanelHandle, AiOrganizePanelRunState } from './ai/AiOrganizePanel'
import { Button } from './ui/button'

const loadScrollableIconGrid = () => import('./ScrollableIconGrid')
const ScrollableIconGrid = lazy(() =>
  loadScrollableIconGrid().then(module => ({ default: module.ScrollableIconGrid }))
)

const loadIconGrid = () => import('./IconGrid')
const IconGrid = lazy(() => loadIconGrid().then(module => ({ default: module.IconGrid })))

const AiOrganizePanel = lazy(() =>
  import('./ai/AiOrganizePanel').then(module => ({ default: module.AiOrganizePanel }))
)

const SearchPanel = lazy(() =>
  import('./search/SearchPanel').then(module => ({ default: module.SearchPanel }))
)

const SEARCH_FLOATING_MENU_SELECTOR = '[data-search-floating-menu="true"]'

export function Launchpad() {
  const { language } = useI18n()
  const toast = useToast()
  const {
    icons,
    loading,
    error: iconLoadError,
    fetchIcons,
    hydrateSettings,
    iconCornerRadius,
    iconOpacity,
    windowMode,
    launchpadGridViewMode,
    selectionMode,
    selectedIconKeys,
    launchApp,
    enterSelectionMode,
    clearSelection,
    hideSelectedIcons,
    deleteSelectedIcons,
    setSelectedIconKeys,
    customNames,
    clearCustomName,
    editRequestedIcon,
    clearIconEditRequest,
  } = useIconStore()

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--launchpad-icon-corner-radius', `${iconCornerRadius}%`)
    root.style.setProperty('--launchpad-icon-opacity', `${iconOpacity / 100}`)
  }, [iconCornerRadius, iconOpacity])

  const [isAiOrganizeMode, setIsAiOrganizeMode] = useState(false)
  const [isAiOrganizeSidebarOpen, setIsAiOrganizeSidebarOpen] = useState(false)
  const [isScrollSidebarCompact, setIsScrollSidebarCompact] = useState(false)
  const aiOrganizePanelRef = useRef<AiOrganizePanelHandle>(null)
  const [aiOrganizeRunState, setAiOrganizeRunState] = useState<AiOrganizePanelRunState>({
    canApply: false,
    applying: false,
    hasPreview: false,
  })

  const [searchSource, setSearchSource] = useState<SearchSource>('all')

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
    resetResults: resetSearchResults,
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
  } = useSearch({ enabled: searchSourceIncludesFiles(searchSource) })

  const filterMenuRef = useRef<HTMLDivElement | null>(null)
  const filterButtonRef = useRef<HTMLButtonElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const [isSearchPanelOpen, setIsSearchPanelOpen] = useState(false)
  const [searchPanelLoaded, setSearchPanelLoaded] = useState(false)
  const [isSearchPreviewVisible, setIsSearchPreviewVisible] = useState(true)
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false)
  const [selectedIconResultIndex, setSelectedIconResultIndex] = useState(-1)
  const [combinedSelectedIndex, setCombinedSelectedIndex] = useState(-1)
  const [shortcutGridColumnCount, setShortcutGridColumnCount] = useState(1)
  const [layoutResetToken, setLayoutResetToken] = useState(0)
  const openSearchPanel = useCallback(() => {
    setSearchPanelLoaded(true)
    setIsSearchPanelOpen(true)
  }, [])
  const iconImport = useLaunchpadIconImportController({
    icons,
    fetchIcons,
    customNames,
    clearCustomName,
    editRequestedIcon,
    clearIconEditRequest,
  })
  const { addIconDialogOpen, handleAddIcons, importPlacementRequest, isImportingDrop } = iconImport
  const preloadGridView = useCallback((mode: 'paged' | 'scroll') => {
    void (mode === 'scroll' ? loadScrollableIconGrid() : loadIconGrid())
  }, [])
  const windowController = useLaunchpadWindowController({
    fetchIcons,
    hydrateSettings,
    reloadSearchSettings,
    searchInputRef,
    setLayoutResetToken,
    preloadGridView,
  })
  const {
    handleMinimizeWindow,
    handleToggleAlwaysOnTop,
    handleWindowTopDragStart,
    isBackgroundCloseSuppressed,
    launchpadSurfaceRef,
    mainWindowAlwaysOnTopEnabled,
    openSettings,
    requestCloseLaunchpad,
    windowPersistentEnabled,
  } = windowController
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

  const searchFilterOptions = useMemo(() => {
    void language
    return getSearchFilterOptions()
  }, [language])
  const hasSearchKeyword = keyword.trim().length > 0
  const { results: iconSearchResults, recordLaunch: recordShortcutLaunch } =
    useShortcutSearchResults(icons, keyword, searchSource)
  const isSearchPanelVisible = isSearchPanelOpen
  const surfaceInteractions = useLaunchpadSurfaceInteractions({
    selectionMode,
    selectedIconKeys,
    setSelectedIconKeys,
    clearSelection,
    enterSelectionMode,
    isAiOrganizeMode,
    hasSearchKeyword,
    isSearchPanelOpen,
    closeSearchPanel: () => setIsSearchPanelOpen(false),
    windowMode,
    windowPersistentEnabled,
    isBackgroundCloseSuppressed,
    requestCloseLaunchpad,
  })
  const {
    handleBackgroundClick,
    handleBackgroundPointerCancel,
    handleBackgroundPointerDown,
    handleBackgroundPointerLeave,
    handleBackgroundPointerUp,
    handleSurfacePointerDownCapture,
    marquee,
  } = surfaceInteractions

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

  const effectiveSelectedIconResultIndex =
    searchSource !== 'everything' && isSearchPanelOpen && iconSearchResults.length > 0
      ? selectedIconResultIndex >= 0 && selectedIconResultIndex < iconSearchResults.length
        ? selectedIconResultIndex
        : 0
      : -1

  const effectiveCombinedSelectedIndex =
    combinedSelectedIndex >= 0
      ? combinedSelectedIndex
      : iconSearchResults.length > 0
        ? 0
        : selectedIndex >= 0
          ? iconSearchResults.length + selectedIndex
          : -1
  const unifiedSelectedShortcutIndex = getUnifiedSelectedShortcutIndex(
    effectiveCombinedSelectedIndex,
    iconSearchResults.length
  )

  const selectedSearchItem =
    searchSource === 'all' && unifiedSelectedShortcutIndex >= 0
      ? null
      : searchSource !== 'icons' && selectedIndex >= 0
        ? getSearchItemAt(selectedIndex)
        : null
  const selectedSearchPath = selectedSearchItem?.path ?? ''
  const selectedFilterLabel = getSearchFilterLabel(searchFilter)
  const {
    preview: searchPreview,
    loading: searchPreviewLoading,
    error: searchPreviewError,
    reset: resetSearchPreview,
  } = useSearchPreview({
    enabled: isSearchPanelVisible && isSearchPreviewVisible,
    path: selectedSearchPath,
  })

  const handleSearchSourceChange = useSearchScopeChange({
    currentSource: searchSource,
    setSource: setSearchSource,
    setSelectedIconIndex: setSelectedIconResultIndex,
    setSelectedFileIndex: setSelectedIndex,
    setCombinedIndex: setCombinedSelectedIndex,
    resetPreview: resetSearchPreview,
    resetFileResults: resetSearchResults,
    setFilterMenuOpen: setIsFilterMenuOpen,
  })

  const selectUnifiedSearchIndex = useCallback(
    (index: number) => {
      setCombinedSelectedIndex(index)
      if (index < iconSearchResults.length) {
        setSelectedIconResultIndex(index)
        return
      }

      const fileIndex = index - iconSearchResults.length
      setSelectedIconResultIndex(-1)
      setSelectedIndex(fileIndex)
    },
    [iconSearchResults.length, setSelectedIndex]
  )

  const selectUnifiedFileIndex = useCallback(
    (index: number) => {
      setSelectedIndex(index)
      setSelectedIconResultIndex(-1)
      setCombinedSelectedIndex(iconSearchResults.length + index)
    },
    [iconSearchResults.length, setSelectedIndex]
  )

  const launchIconItem = useCallback(
    async (icon: DesktopIcon) => {
      try {
        await launchApp(icon.path)
        void recordShortcutLaunch(icon.id)
        clearSearch()
      } catch (e) {
        console.error('Failed to launch selected desktop icon:', e)
        toast.error(translate('无法打开所选项目，请检查目标是否仍然可用。'), {
          key: 'launch-item',
          title: translate('启动失败'),
        })
      }
    },
    [clearSearch, launchApp, recordShortcutLaunch, toast]
  )

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
        toast.error(translate('无法打开所选项目，请检查目标是否仍然可用。'), {
          key: 'launch-item',
          title: translate('启动失败'),
        })
      }
    },
    [clearSearch, recordCurrentSearch, toast]
  )

  const handleSearchNavigationKey = (
    key: string,
    preventDefault: () => void,
    allowHorizontalShortcutNavigation = true
  ) => {
    handleSearchNavigation({
      key,
      preventDefault,
      source: searchSource,
      hasKeyword: hasSearchKeyword,
      panelVisible: isSearchPanelVisible,
      openPanel: openSearchPanel,
      closePanel: () => setIsSearchPanelOpen(false),
      closeLaunchpad: requestCloseLaunchpad,
      clearSearch,
      iconResults: iconSearchResults,
      selectedIconIndex: effectiveSelectedIconResultIndex,
      setSelectedIconIndex: setSelectedIconResultIndex,
      activateIcon: icon => void launchIconItem(icon),
      combinedSelectedIndex: effectiveCombinedSelectedIndex,
      fileCount: searchTotalResults > 0 ? searchTotalResults : searchLoadedCount,
      selectCombinedIndex: selectUnifiedSearchIndex,
      allowHorizontalShortcutNavigation,
      shortcutColumnCount: shortcutGridColumnCount,
      selectedFileIndex: selectedIndex,
      moveFileSelection: moveSelection,
      getFileAt: getSearchItemAt,
      requestFileRange: requestSearchRange,
      activateFile: path => void launchSearchItem(path),
      liveOnType: searchSettings.liveOnType,
      keywordCommitted: isKeywordCommitted,
      submitSearch,
      openOnEnter: searchSettings.openOnEnter,
    })
  }

  const handleSearchInputKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    const isShortcutOnlySource = searchSource === 'icons'
    const allowHorizontalShortcutNavigation = shouldUseShortcutHorizontalNavigation({
      key: e.key,
      selectionStart: e.currentTarget.selectionStart,
      selectionEnd: e.currentTarget.selectionEnd,
      inputLength: e.currentTarget.value.length,
      hasExplicitResultSelection: isShortcutOnlySource
        ? selectedIconResultIndex >= 0
        : combinedSelectedIndex >= 0,
      hasVisibleShortcutSelection: isShortcutOnlySource
        ? effectiveSelectedIconResultIndex >= 0
        : unifiedSelectedShortcutIndex >= 0,
    })
    handleSearchNavigationKey(e.key, () => e.preventDefault(), allowHorizontalShortcutNavigation)
  }
  const handleDocumentSearchNavigation = useEffectEvent(handleSearchNavigationKey)

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

      handleDocumentSearchNavigation(event.key, () => event.preventDefault())
    }

    document.addEventListener('keydown', handleDocumentKeyDown)
    return () => {
      document.removeEventListener('keydown', handleDocumentKeyDown)
    }
  }, [isSearchPanelOpen])

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

  return (
    <ContextMenu>
      {/* 自定义背景图层：位于启动台之前，因此模糊只作用于图片本身 */}
      <div className="launchpad-background-layer" aria-hidden="true" />
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
          <LaunchpadWindowControls
            aiOrganizeMode={isAiOrganizeMode}
            aiSidebarOpen={isAiOrganizeSidebarOpen}
            windowPersistentEnabled={windowPersistentEnabled}
            alwaysOnTopEnabled={mainWindowAlwaysOnTopEnabled}
            onToggleAi={toggleAiOrganizeSidebar}
            onToggleAlwaysOnTop={handleToggleAlwaysOnTop}
            onMinimize={handleMinimizeWindow}
            onClose={requestCloseLaunchpad}
          />

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
                  setCombinedSelectedIndex(-1)
                  if (!isSearchPanelOpen) {
                    openSearchPanel()
                  }
                }}
                onFocus={() => {
                  openSearchPanel()
                }}
                onKeyDown={handleSearchInputKeyDown}
                placeholder={
                  searchSource === 'all'
                    ? translate('搜索应用、快捷入口、文件和文件夹...')
                    : searchSource === 'everything'
                      ? translate('搜索文件和文件夹...')
                      : translate('搜索快捷入口...')
                }
                aria-label={
                  searchSource === 'all'
                    ? translate('搜索全部内容')
                    : searchSource === 'everything'
                      ? translate('搜索文件')
                      : translate('搜索快捷入口')
                }
                className={`launchpad-glass-panel h-11 w-full rounded-full px-4 text-sm text-foreground/90 outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/40 ${
                  searchSource !== 'icons' ? 'pr-36' : ''
                }`}
              />

              {searchSource !== 'icons' ? (
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  <button
                    ref={filterButtonRef}
                    data-search-placeholder
                    type="button"
                    className="launchpad-glass-button inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs transition-colors"
                    onClick={() => setIsFilterMenuOpen(open => !open)}
                  >
                    <span className="truncate">
                      {searchSource === 'all'
                        ? `${translate('文件')} · ${selectedFilterLabel}`
                        : selectedFilterLabel}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>

                  <SearchFloatingMenu
                    open={isFilterMenuOpen}
                    triggerRef={filterButtonRef}
                    menuRef={filterMenuRef}
                    width={192}
                    align="start"
                    className="launchpad-glass-panel-strong overflow-hidden rounded-lg shadow-xl"
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
                          setCombinedSelectedIndex(-1)
                          setSearchFilter(entry.value)
                          setIsFilterMenuOpen(false)
                        }}
                      >
                        <span>{entry.label}</span>
                        {searchFilter === entry.value ? (
                          <Check className="accent-foreground h-4 w-4" />
                        ) : null}
                      </button>
                    ))}
                  </SearchFloatingMenu>
                </div>
              ) : null}
            </div>
          </div>

          {searchPanelLoaded ? (
            <Suspense fallback={null}>
              <SearchPanel
                source={searchSource}
                keyword={keyword}
                onSourceChange={handleSearchSourceChange}
                visible={isSearchPanelOpen}
                loading={searchLoading}
                searchPending={searchPending}
                loadingMore={searchLoadingMore}
                error={searchError}
                onRetry={submitSearch}
                runtimeState={searchRuntimeState}
                totalResults={searchTotalResults}
                loadedCount={searchLoadedCount}
                pageSize={searchSettings.maxResultsPerPage}
                hasCommittedQuery={hasCommittedQuery}
                getItemAt={getSearchItemAt}
                selectedItem={selectedSearchItem}
                selectedIndex={
                  searchSource === 'all' && unifiedSelectedShortcutIndex >= 0 ? -1 : selectedIndex
                }
                iconResults={iconSearchResults}
                selectedIconIndex={
                  searchSource === 'all'
                    ? unifiedSelectedShortcutIndex
                    : effectiveSelectedIconResultIndex
                }
                onSelectIcon={index => {
                  if (searchSource === 'all') {
                    selectUnifiedSearchIndex(index)
                  } else {
                    setSelectedIconResultIndex(index)
                  }
                }}
                onActivateIcon={icon => {
                  void launchIconItem(icon)
                }}
                onShortcutColumnCountChange={setShortcutGridColumnCount}
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
                onHistorySelect={entry => {
                  setCombinedSelectedIndex(-1)
                  applyHistoryEntry(entry)
                }}
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
                onSelect={index => {
                  if (searchSource === 'all') {
                    selectUnifiedFileIndex(index)
                  } else {
                    setSelectedIndex(index)
                  }
                }}
                allowDoubleClickOpen={searchSettings.openOnDoubleClick}
                onActivate={item => {
                  void launchSearchItem(item.path)
                }}
              />
            </Suspense>
          ) : null}

          {isAiOrganizeMode ? (
            <div
              data-ai-organize-toolbar
              className="launchpad-glass-panel-strong absolute left-1/2 top-20 z-30 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-full border border-primary/20 px-3 py-2 text-sm text-foreground/90"
            >
              <span className="flex items-center gap-2 px-1.5 font-medium">
                <Bot className="accent-foreground h-4 w-4" />
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
                onClick={() => {
                  setIsAiOrganizeSidebarOpen(true)
                  aiOrganizePanelRef.current?.applyPreview()
                }}
                disabled={!aiOrganizeRunState.canApply || aiOrganizeRunState.applying}
                className="accent-tonal rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:bg-primary/18 disabled:cursor-not-allowed disabled:opacity-45 dark:hover:bg-primary/25"
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

          {marquee ? (
            <div
              className="pointer-events-none fixed z-40 rounded-sm border border-primary/60 bg-primary/15 shadow-sm"
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
          ) : iconLoadError && icons.length === 0 ? (
            <div
              role="alert"
              className="flex max-w-md flex-col items-center gap-3 px-6 text-center"
            >
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  {translate('图标库加载失败，请重试。')}
                </p>
                <p
                  className="break-words text-xs leading-5 text-muted-foreground"
                  title={iconLoadError}
                >
                  {translate('现有布局不会被修改。')}
                </p>
              </div>
              <Button type="button" size="sm" onClick={() => void fetchIcons()}>
                <RefreshCw className="h-4 w-4" />
                {translate('重试')}
              </Button>
            </div>
          ) : icons.length === 0 ? (
            <div className="flex max-w-md flex-col items-center gap-3 px-6 text-center">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  {translate('No desktop shortcuts found')}
                </p>
                <p className="text-xs leading-5 text-muted-foreground">
                  {translate('添加应用、快捷方式或网页，开始创建你的启动台。')}
                </p>
              </div>
              <Button type="button" size="sm" onClick={() => handleAddIcons()}>
                <Plus className="h-4 w-4" />
                {translate('添加图标')}
              </Button>
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
            <Suspense
              fallback={
                <span className="text-sm text-foreground/70">{translate('Loading...')}</span>
              }
            >
              <IconGrid
                icons={icons}
                layoutResetToken={layoutResetToken}
                importPlacementRequest={importPlacementRequest}
              />
            </Suspense>
          )}
        </div>
      </ContextMenuTrigger>

      <LaunchpadContextMenuContent
        addIconDisabled={isImportingDrop || addIconDialogOpen}
        onAddIcon={() => handleAddIcons()}
        onSelectIcons={enterSelectionMode}
        onAiOrganize={enterAiOrganizeMode}
        onOpenSettings={openSettings}
      />
      <LaunchpadIconImportLayer controller={iconImport} />

      <Suspense fallback={null}>
        {isAiOrganizeMode ? (
          <AiOrganizePanel
            ref={aiOrganizePanelRef}
            visible={isAiOrganizeSidebarOpen}
            icons={icons}
            customNames={customNames}
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
        ) : null}
      </Suspense>
    </ContextMenu>
  )
}
