import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { invoke } from '@tauri-apps/api/core'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Check, ChevronDown } from 'lucide-react'
import { IconSearchPanel } from '@/components/search/IconSearchPanel'
import { applyTheme, getSavedTheme } from '@/lib/theme'
import { getSearchPreview, recordSearchResultRun } from '@/lib/search/api'
import { SEARCH_FILTERS } from '@/lib/search/filters'
import { useSearch } from '@/lib/search/useSearch'
import { SearchPanel } from '@/components/search/SearchPanel'
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
import { useIconStore } from '@/stores/iconStore'
import type { DesktopIcon, IconSize, TitleLineCount, WindowMode } from '@/types'
import { IconGrid } from './IconGrid'

const ICON_SIZE_OPTIONS: { label: string; value: IconSize }[] = [
  { label: 'Large', value: 'large' },
  { label: 'Medium', value: 'medium' },
  { label: 'Small', value: 'small' },
]

const WINDOW_MODE_OPTIONS: { label: string; value: WindowMode }[] = [
  { label: 'Fullscreen', value: 'fullscreen' },
  { label: 'Large Window', value: 'large' },
  { label: 'Medium Window', value: 'medium' },
  { label: 'Small Window', value: 'small' },
]

const TITLE_LINE_OPTIONS: { label: string; value: TitleLineCount }[] = [
  { label: 'One Line', value: 'one' },
  { label: 'Two Lines', value: 'two' },
]

const LONG_PRESS_MS = 420
const ICON_SEARCH_LIMIT = 48

type SearchSource = 'icons' | 'everything'

export function Launchpad() {
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
  const filterMenuRef = useRef<HTMLDivElement | null>(null)
  const [isSearchPanelOpen, setIsSearchPanelOpen] = useState(false)
  const [isSearchPreviewVisible, setIsSearchPreviewVisible] = useState(true)
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false)
  const [selectedIconResultIndex, setSelectedIconResultIndex] = useState(-1)
  const [searchPreviewLoading, setSearchPreviewLoading] = useState(false)
  const [searchPreviewError, setSearchPreviewError] = useState<string | null>(null)
  const [searchPreview, setSearchPreview] = useState<Awaited<
    ReturnType<typeof getSearchPreview>
  > | null>(null)
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
  const isIconSearchVisible = searchSource === 'icons' && isSearchPanelOpen

  useEffect(() => {
    void (async () => {
      try {
        await hydrateSettings()
        await fetchIcons()
        const { windowMode: currentWindowMode, applyWindowMode } = useIconStore.getState()
        await applyWindowMode(currentWindowMode)
        applyTheme(await getSavedTheme())
      } catch (e) {
        console.error('Failed to initialize launchpad settings:', e)
      }
    })()
  }, [fetchIcons, hydrateSettings])

  useEffect(() => {
    const unlisten = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) {
        void (async () => {
          try {
            const state = useIconStore.getState()
            await state.hydrateSettings()
            await useIconStore.getState().fetchIcons()
            await reloadSearchSettings()
            applyTheme(await getSavedTheme())
          } catch (e) {
            console.error('Failed to sync settings on focus:', e)
          }
        })()
      }
    })
    return () => {
      unlisten.then(fn => fn())
    }
  }, [reloadSearchSettings])

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
      if (!filterMenuRef.current?.contains(event.target as Node)) {
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
    if (!isIconSearchVisible || iconSearchResults.length === 0) {
      setSelectedIconResultIndex(-1)
      return
    }

    setSelectedIconResultIndex(current => {
      if (current >= 0 && current < iconSearchResults.length) {
        return current
      }
      return 0
    })
  }, [iconSearchResults.length, isIconSearchVisible])

  const selectedSearchItem = selectedIndex >= 0 ? getSearchItemAt(selectedIndex) : null
  const selectedSearchPath = selectedSearchItem?.path ?? ''
  const selectedFilterLabel =
    SEARCH_FILTERS.find(entry => entry.value === searchFilter)?.label ?? 'All'

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

  const launchIconItem = async (icon: DesktopIcon) => {
    try {
      await launchApp(icon.path)
      clearSearch()
    } catch (e) {
      console.error('Failed to launch selected desktop icon:', e)
    }
  }

  const clearBackgroundLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  const isBackgroundInteraction = (target: HTMLElement) =>
    !target.closest('[data-icon]') &&
    !target.closest('[data-search-placeholder]') &&
    !target.closest('[data-pagination]') &&
    !target.closest('[data-selection-toolbar]')

  const handleBackgroundPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (selectionMode || e.button !== 0 || hasSearchKeyword) return
    const target = e.target as HTMLElement
    if (!isBackgroundInteraction(target)) return

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
  }

  const handleBackgroundPointerLeave = () => {
    clearBackgroundLongPressTimer()
  }

  const launchSearchItem = async (path: string) => {
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
  }

  const handleSearchInputKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (searchSource === 'icons') {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (iconSearchResults.length === 0) return
        setSelectedIconResultIndex(current => {
          const safeCurrent = current < 0 ? 0 : current
          return (safeCurrent + 1) % iconSearchResults.length
        })
        return
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (iconSearchResults.length === 0) return
        setSelectedIconResultIndex(current => {
          const safeCurrent = current < 0 ? 0 : current
          return (safeCurrent - 1 + iconSearchResults.length) % iconSearchResults.length
        })
        return
      }

      if (e.key === 'Enter') {
        e.preventDefault()
        const selectedIcon = iconSearchResults[selectedIconResultIndex] ?? iconSearchResults[0]
        if (selectedIcon) {
          void launchIconItem(selectedIcon)
        }
        return
      }

      if (e.key === 'Escape') {
        e.preventDefault()
        if (hasSearchKeyword) {
          clearSearch()
          return
        }
        setIsSearchPanelOpen(false)
      }
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!isSearchPanelVisible && hasSearchKeyword) {
        setIsSearchPanelOpen(true)
      }
      moveSelection(1)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!isSearchPanelVisible && hasSearchKeyword) {
        setIsSearchPanelOpen(true)
      }
      moveSelection(-1)
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
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
    if (e.key === 'Escape') {
      e.preventDefault()
      if (isSearchPanelVisible) {
        setIsSearchPanelOpen(false)
        return
      }
      clearSearch()
    }
  }

  const handleBackgroundClick = (e: React.MouseEvent) => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false
      return
    }

    const target = e.target as HTMLElement
    const clickedOutsideSearch = !target.closest('[data-search-placeholder]')

    if ((isSearchPanelVisible || isIconSearchVisible) && clickedOutsideSearch) {
      setIsSearchPanelOpen(false)
      return
    }

    if (selectionMode) {
      if (isBackgroundInteraction(target)) {
        clearSelection()
      }
      return
    }

    if (windowMode === 'fullscreen' && !hasSearchKeyword) {
      if (isBackgroundInteraction(target)) {
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
      `Delete ${selectedIconKeys.length} selected icon(s)? This cannot be undone.`
    )
    if (!confirmed) return
    void deleteSelectedIcons()
  }

  const openSettings = async () => {
    const existing = await WebviewWindow.getByLabel('settings')
    if (existing) {
      await existing.unminimize()
      await existing.show()
      await existing.setFocus()
      await getCurrentWindow().hide()
      return
    }

    const settingsWindow = new WebviewWindow('settings', {
      url: 'index.html?page=settings',
      title: 'Settings',
      width: 800,
      height: 600,
      center: true,
      resizable: true,
      decorations: true,
    })
    settingsWindow.once('tauri://created', async () => {
      await getCurrentWindow().hide()
    })
    settingsWindow.once('tauri://error', e => {
      console.error('Failed to create settings window:', e)
    })
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className="launchpad-bg relative flex h-screen w-screen select-none flex-col items-center justify-center"
          onPointerDown={handleBackgroundPointerDown}
          onPointerUp={handleBackgroundPointerUp}
          onPointerCancel={handleBackgroundPointerCancel}
          onPointerLeave={handleBackgroundPointerLeave}
          onClick={handleBackgroundClick}
        >
          <div
            data-search-placeholder
            className="absolute left-1/2 top-6 z-20 w-full max-w-2xl -translate-x-1/2 px-6"
          >
            <div className="relative min-w-0" ref={filterMenuRef}>
              <input
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
                    ? 'Search files, folders and applications...'
                    : 'Search desktop icons...'
                }
                aria-label={searchSource === 'everything' ? 'Search files' : 'Search desktop icons'}
                className={`h-11 w-full rounded-full border border-white/20 bg-black/25 px-4 text-sm text-white/90 shadow-lg backdrop-blur-md placeholder:text-white/50 ${
                  searchSource === 'everything' ? 'pr-32' : ''
                }`}
              />

              {searchSource === 'everything' ? (
                <>
                  <button
                    data-search-placeholder
                    type="button"
                    className="absolute right-2 top-1/2 inline-flex h-8 -translate-y-1/2 items-center gap-1 rounded-full border border-white/15 bg-white/8 px-3 text-xs text-white/80 transition hover:bg-white/12"
                    onClick={() => setIsFilterMenuOpen(open => !open)}
                  >
                    <span className="truncate">{selectedFilterLabel}</span>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>

                  {isFilterMenuOpen ? (
                    <div className="absolute right-0 top-full z-30 mt-2 w-48 overflow-hidden rounded-2xl border border-white/15 bg-black/90 p-1.5 shadow-2xl backdrop-blur-xl">
                      {SEARCH_FILTERS.map(entry => (
                        <button
                          key={entry.value}
                          type="button"
                          className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition ${
                            searchFilter === entry.value
                              ? 'bg-white/14 text-white'
                              : 'text-white/70 hover:bg-white/8 hover:text-white'
                          }`}
                          onClick={() => {
                            setSearchFilter(entry.value)
                            setIsFilterMenuOpen(false)
                          }}
                        >
                          <span>{entry.label}</span>
                          {searchFilter === entry.value ? (
                            <Check className="h-4 w-4 text-emerald-200" />
                          ) : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>

          <SearchPanel
            source={searchSource}
            onSourceChange={setSearchSource}
            visible={isSearchPanelVisible}
            loading={searchLoading}
            searchPending={searchPending}
            loadingMore={searchLoadingMore}
            error={searchError}
            totalResults={searchTotalResults}
            loadedCount={searchLoadedCount}
            hasCommittedQuery={hasCommittedQuery}
            getItemAt={getSearchItemAt}
            selectedItem={selectedSearchItem}
            selectedIndex={selectedIndex}
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

          <IconSearchPanel
            source={searchSource}
            onSourceChange={setSearchSource}
            visible={isIconSearchVisible}
            keyword={keyword}
            results={iconSearchResults}
            selectedIndex={selectedIconResultIndex}
            onSelect={setSelectedIconResultIndex}
            onActivate={icon => {
              void launchIconItem(icon)
            }}
          />

          {selectionMode ? (
            <div
              data-selection-toolbar
              className="absolute left-1/2 top-20 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/20 bg-black/55 px-3 py-2 text-sm text-white/90 backdrop-blur-md"
            >
              <span className="px-2">Selected: {selectedIconKeys.length}</span>
              <button
                type="button"
                onClick={handleHideSelected}
                className="rounded-full border border-white/25 px-3 py-1 text-xs hover:bg-white/15"
              >
                Hide
              </button>
              <button
                type="button"
                onClick={handleDeleteSelected}
                className="rounded-full border border-red-300/40 px-3 py-1 text-xs text-red-200 hover:bg-red-500/25"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="rounded-full border border-white/25 px-3 py-1 text-xs hover:bg-white/15"
              >
                Cancel
              </button>
            </div>
          ) : null}

          {loading ? (
            <div className="flex items-center gap-3">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-foreground/40 border-t-foreground" />
              <span className="text-lg text-foreground/70">Loading...</span>
            </div>
          ) : icons.length === 0 ? (
            <div className="text-lg text-foreground/50">No desktop shortcuts found</div>
          ) : (
            <IconGrid icons={icons} />
          )}
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-44">
        <ContextMenuSub>
          <ContextMenuSubTrigger>Icon Size</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-44">
            <ContextMenuRadioGroup
              value={iconSize}
              onValueChange={value => setIconSize(value as IconSize)}
            >
              {ICON_SIZE_OPTIONS.map(option => (
                <ContextMenuRadioItem key={option.value} value={option.value}>
                  {option.label}
                </ContextMenuRadioItem>
              ))}
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSub>
          <ContextMenuSubTrigger>Window Size</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-44">
            <ContextMenuRadioGroup
              value={windowMode}
              onValueChange={value => setWindowMode(value as WindowMode)}
            >
              {WINDOW_MODE_OPTIONS.map(option => (
                <ContextMenuRadioItem key={option.value} value={option.value}>
                  {option.label}
                </ContextMenuRadioItem>
              ))}
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSub>
          <ContextMenuSubTrigger>Title Lines</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-44">
            <ContextMenuRadioGroup
              value={titleLineCount}
              onValueChange={value => setTitleLineCount(value as TitleLineCount)}
            >
              {TITLE_LINE_OPTIONS.map(option => (
                <ContextMenuRadioItem key={option.value} value={option.value}>
                  {option.label}
                </ContextMenuRadioItem>
              ))}
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => enterSelectionMode()}>Edit Icons</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={openSettings}>Settings</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
