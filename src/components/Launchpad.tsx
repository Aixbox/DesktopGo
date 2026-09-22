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
import { translate, useI18n } from '@/lib/i18n'
import { recordSearchResultRun } from '@/lib/search/api'
import { getSearchFilterLabel, getSearchFilterOptions } from '@/lib/search/filters'
import { searchSourceIncludesFiles, type SearchSource } from '@/lib/search/scope'
import { useSearchPreview } from '@/lib/search/useSearchPreview'
import { useShortcutSearchResults } from '@/lib/search/useShortcutSearchResults'
import { useSearchScopeChange } from '@/lib/search/useSearchScopeChange'
import {
  getUnifiedSelectedShortcutIndex,
  handleSearchNavigation,
  shouldUseShortcutHorizontalNavigation,
} from '@/components/search/searchNavigation'
import { LaunchpadContextMenuContent } from '@/components/launchpad/LaunchpadContextMenuContent'
import { LaunchpadIconImportLayer } from '@/components/launchpad/LaunchpadIconImportLayer'
import { LaunchpadWindowControls } from '@/components/launchpad/LaunchpadWindowControls'
import { LaunchpadAiOrganizePane } from '@/components/launchpad/LaunchpadAiOrganizePane'
import { LaunchpadAiOrganizeToolbar } from '@/components/launchpad/LaunchpadAiOrganizeToolbar'
import {
  LaunchpadIconArea,
} from '@/components/launchpad/LaunchpadIconArea'
import {
  loadIconGrid,
  loadScrollableIconGrid,
} from '@/components/launchpad/launchpadGridChunks'
import { LaunchpadSearchBar } from '@/components/launchpad/LaunchpadSearchBar'
import { LaunchpadSelectionToolbar } from '@/components/launchpad/LaunchpadSelectionToolbar'
import { useLaunchpadIconImportController } from '@/components/launchpad/useLaunchpadIconImportController'
import { useLaunchpadSurfaceInteractions } from '@/components/launchpad/useLaunchpadSurfaceInteractions'
import { useLaunchpadWindowController } from '@/components/launchpad/useLaunchpadWindowController'
import { useSearch } from '@/lib/search/useSearch'
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu'
import { useToast } from '@/components/ui/toast'
import { useIconStore } from '@/stores/iconStore'
import type { BestMatchItem } from '@/lib/search/bestMatch'
import type { DesktopIcon } from '@/types'
import type { AiOrganizePanelHandle, AiOrganizePanelRunState } from './ai/AiOrganizePanel'

const SearchPanel = lazy(() =>
  import('./search/SearchPanel').then(module => ({ default: module.SearchPanel }))
)

const QuickImportDialog = lazy(() =>
  import('./quick-import/QuickImportDialog').then(module => ({ default: module.QuickImportDialog }))
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
    bestMatchCandidates: searchBestMatchCandidates,
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
  const {
    addIconDialogOpen,
    handleAddIcons,
    handleCreateNewFile,
    importPlacementRequest,
    isImportingDrop,
  } = iconImport
  // 「快捷导入」仅在启动台没有任何图标时从引导界面进入。
  const [isQuickImportOpen, setIsQuickImportOpen] = useState(false)
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
    aiOrganizeSidebarOpen: isAiOrganizeSidebarOpen,
  })
  const {
    handleMinimizeWindow,
    handleToggleAlwaysOnTop,
    handleWindowTopDragStart,
    isBackgroundCloseSuppressed,
    launchpadSurfaceRef,
    mainWindowAlwaysOnTopEnabled,
    aiOrganizeSidebarReady,
    aiOrganizeMainWindowWidth,
    openSettings,
    requestCloseLaunchpad,
    windowPersistentEnabled,
  } = windowController
  const aiOrganizeLayoutOpen = isAiOrganizeSidebarOpen || aiOrganizeSidebarReady
  const aiOrganizeUiActive = isAiOrganizeMode || aiOrganizeSidebarReady
  const resetAiOrganizeRunState = useCallback(() => {
    setAiOrganizeRunState({
      canApply: false,
      applying: false,
      hasPreview: false,
    })
  }, [])

  const handleAiOrganizePreviewed = useCallback(async () => {
    setLayoutResetToken(current => current + 1)
    await fetchIcons()
  }, [fetchIcons, setLayoutResetToken])

  const handleAiOrganizeApplied = useCallback(async () => {
    setLayoutResetToken(current => current + 1)
    await fetchIcons()
  }, [fetchIcons, setLayoutResetToken])

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
    setIsFilterMenuOpen(false)
    resetAiOrganizeRunState()
  }, [resetAiOrganizeRunState])

  const handleEnterSelectionMode = useCallback(
    (initialKey?: string) => {
      setIsFilterMenuOpen(false)
      enterSelectionMode(initialKey)
    },
    [enterSelectionMode]
  )

  const searchFilterOptions = useMemo(() => {
    void language
    return getSearchFilterOptions()
  }, [language])
  const hasSearchKeyword = keyword.trim().length > 0
  const isSearchPanelVisible = isSearchPanelOpen && !aiOrganizeUiActive && !selectionMode

  const { results: iconSearchResults, recordLaunch: recordShortcutLaunch } =
    useShortcutSearchResults(
      icons,
      keyword,
      searchSource,
      searchBestMatchCandidates,
      isSearchPanelVisible,
      searchSettings.bestMatchFolders
    )
  const surfaceInteractions = useLaunchpadSurfaceInteractions({
    selectionMode,
    selectedIconKeys,
    setSelectedIconKeys,
    clearSelection,
    enterSelectionMode: handleEnterSelectionMode,
    isAiOrganizeMode: aiOrganizeUiActive,
    hasSearchKeyword,
    isSearchPanelOpen: isSearchPanelVisible,
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
    searchSource !== 'everything' && isSearchPanelVisible && iconSearchResults.length > 0
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
        // 先收起启动台再启动（同 iconStore.launchApp），失败时再拉回来显示提示。
        await invoke('toggle_window')
        try {
          await invoke('launch_app', { path })
        } catch (e) {
          await invoke('activate_main_window').catch(() => {})
          throw e
        }
        void recordSearchResultRun(path).catch(() => {
          // Ignore Everything run history update failure.
        })
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

  /**
   * 「最佳匹配」里两类条目共用一套激活入口：启动台图标走 `launchIconItem`
   * （记使用频率），Everything 的文件命中走 `launchSearchItem`（记运行次数）。
   */
  const activateBestMatch = useCallback(
    async (item: BestMatchItem) => {
      if (item.kind === 'shortcut') {
        await launchIconItem(item.icon)
        return
      }
      await launchSearchItem(item.hit.path)
    },
    [launchIconItem, launchSearchItem]
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
      activateIcon: item => void activateBestMatch(item),
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
      <div
        className="launchpad-background-fill"
        aria-hidden="true"
        style={
          aiOrganizeLayoutOpen && aiOrganizeMainWindowWidth !== null
            ? { width: `${aiOrganizeMainWindowWidth}px`, right: 'auto' }
            : undefined
        }
      />
      {/* 出血垫底层：垫住取景层模糊的边缘渐隐（见 globals.css）；AI 侧栏停靠时
          补回左侧出血量，右缘与取景层一同停在主区边界。 */}
      <div
        className="launchpad-background-bleed"
        aria-hidden="true"
        style={
          aiOrganizeLayoutOpen && aiOrganizeMainWindowWidth !== null
            ? {
                width: `calc(${aiOrganizeMainWindowWidth}px + var(--launchpad-background-blur, 0px) * 3)`,
                right: 'auto',
              }
            : undefined
        }
      />
      <div
        className="launchpad-background-layer"
        aria-hidden="true"
        style={
          aiOrganizeLayoutOpen && aiOrganizeMainWindowWidth !== null
            ? { width: `${aiOrganizeMainWindowWidth}px`, right: 'auto' }
            : undefined
        }
      />
      <ContextMenuTrigger asChild>
        <div
          ref={launchpadSurfaceRef}
          data-window-expanded={windowMode === 'fullscreen'}
          tabIndex={-1}
          className={[
            'launchpad-bg relative flex h-full w-full select-none flex-col items-center justify-center overflow-hidden outline-none',
            launchpadGridViewMode === 'scroll' ? 'launchpad-scroll-layout' : '',
            launchpadGridViewMode === 'scroll' && isScrollSidebarCompact
              ? 'launchpad-scroll-sidebar-compact'
              : '',
            aiOrganizeLayoutOpen ? 'launchpad-ai-organize-open' : '',
          ].join(' ')}
          onPointerDownCapture={handleSurfacePointerDownCapture}
          onPointerDown={handleBackgroundPointerDown}
          onPointerUp={handleBackgroundPointerUp}
          onPointerCancel={handleBackgroundPointerCancel}
          onPointerLeave={handleBackgroundPointerLeave}
          onClick={handleBackgroundClick}
        >
          <LaunchpadWindowControls
            aiOrganizeMode={aiOrganizeUiActive}
            aiSidebarOpen={aiOrganizeLayoutOpen}
            mainWindowWidth={aiOrganizeMainWindowWidth}
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

          <div className="flex min-h-0 w-full flex-1 items-center justify-start">
            <div
              className="relative h-full min-h-0 min-w-0 shrink-0 rounded-r-2xl"
              style={
                aiOrganizeLayoutOpen && aiOrganizeMainWindowWidth !== null
                  ? { width: `${aiOrganizeMainWindowWidth}px` }
                  : { flex: '1 1 0%' }
              }
            >
              <div
                data-search-placeholder
                className="launchpad-search-shell absolute inset-x-0 top-6 z-40 mx-auto w-full max-w-2xl px-6"
              >
                <div className="relative min-w-0">
                  {aiOrganizeUiActive ? (
                    <LaunchpadAiOrganizeToolbar
                      sidebarOpen={isAiOrganizeSidebarOpen}
                      runState={aiOrganizeRunState}
                      onToggleSidebar={toggleAiOrganizeSidebar}
                      onApplyPreview={() => {
                        setIsAiOrganizeSidebarOpen(true)
                        aiOrganizePanelRef.current?.applyPreview()
                      }}
                      onExit={exitAiOrganizeMode}
                    />
                  ) : selectionMode ? (
                    <LaunchpadSelectionToolbar
                      count={selectedIconKeys.length}
                      onHide={handleHideSelected}
                      onDelete={handleDeleteSelected}
                      onCancel={clearSelection}
                    />
                  ) : (
                    <LaunchpadSearchBar
                      searchSource={searchSource}
                      keyword={keyword}
                      inputRef={searchInputRef}
                      onKeywordChange={value => {
                        setKeyword(value)
                        setCombinedSelectedIndex(-1)
                        if (!isSearchPanelOpen) {
                          openSearchPanel()
                        }
                      }}
                      onInputFocus={openSearchPanel}
                      onInputKeyDown={handleSearchInputKeyDown}
                      filterButtonRef={filterButtonRef}
                      filterMenuRef={filterMenuRef}
                      isFilterMenuOpen={isFilterMenuOpen}
                      onFilterToggle={() => setIsFilterMenuOpen(open => !open)}
                      filterOptions={searchFilterOptions}
                      filter={searchFilter}
                      selectedFilterLabel={selectedFilterLabel}
                      onFilterSelect={value => {
                        setCombinedSelectedIndex(-1)
                        setSearchFilter(value)
                        setIsFilterMenuOpen(false)
                      }}
                    />
                  )}
                </div>
              </div>

              {searchPanelLoaded && !aiOrganizeUiActive && !selectionMode ? (
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
                      searchSource === 'all' && unifiedSelectedShortcutIndex >= 0
                        ? -1
                        : selectedIndex
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
                    onActivateIcon={item => {
                      void activateBestMatch(item)
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

              <LaunchpadIconArea
                loading={loading}
                error={iconLoadError}
                icons={icons}
                onRetry={() => void fetchIcons()}
                gridViewMode={launchpadGridViewMode}
                layoutResetToken={layoutResetToken}
                sidebarCompact={isScrollSidebarCompact}
                onToggleSidebarCompact={() =>
                  setIsScrollSidebarCompact(current => !current)
                }
                importPlacementRequest={importPlacementRequest}
                addIconDisabled={isImportingDrop || addIconDialogOpen}
                onAddIcon={() => handleAddIcons()}
                onQuickImport={() => setIsQuickImportOpen(true)}
              />
            </div>

            {aiOrganizeUiActive ? (
              <LaunchpadAiOrganizePane
                reserved={aiOrganizeSidebarReady}
                open={isAiOrganizeSidebarOpen && aiOrganizeSidebarReady}
                panelRef={aiOrganizePanelRef}
                layoutViewMode={launchpadGridViewMode}
                icons={icons}
                customNames={customNames}
                onRunStateChange={setAiOrganizeRunState}
                onCollapse={() => setIsAiOrganizeSidebarOpen(false)}
                onClose={exitAiOrganizeMode}
                onPreviewed={handleAiOrganizePreviewed}
                onApplied={handleAiOrganizeApplied}
              />
            ) : null}
          </div>
        </div>
      </ContextMenuTrigger>

      <LaunchpadContextMenuContent
        addIconDisabled={isImportingDrop || addIconDialogOpen}
        onAddIcon={() => handleAddIcons()}
        onCreateNewFile={kind => void handleCreateNewFile(kind)}
        onSelectIcons={handleEnterSelectionMode}
        onAiOrganize={enterAiOrganizeMode}
        onOpenSettings={openSettings}
      />
      <LaunchpadIconImportLayer controller={iconImport} />

      <Suspense fallback={null}>
        {isQuickImportOpen ? (
          <QuickImportDialog
            open
            onOpenChange={setIsQuickImportOpen}
            onImported={() => iconImport.handleIconCreated()}
          />
        ) : null}
      </Suspense>
    </ContextMenu>
  )
}
