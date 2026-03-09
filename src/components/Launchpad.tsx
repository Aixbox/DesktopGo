import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { applyTheme, getSavedTheme } from "@/lib/theme";
import { useSearch } from "@/lib/search/useSearch";
import { SearchPanel } from "@/components/search/SearchPanel";
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
} from "@/components/ui/context-menu";
import { useIconStore } from "@/stores/iconStore";
import type { IconSize, TitleLineCount, WindowMode } from "@/types";
import { IconGrid } from "./IconGrid";

const ICON_SIZE_OPTIONS: { label: string; value: IconSize }[] = [
  { label: "Large", value: "large" },
  { label: "Medium", value: "medium" },
  { label: "Small", value: "small" },
];

const WINDOW_MODE_OPTIONS: { label: string; value: WindowMode }[] = [
  { label: "Fullscreen", value: "fullscreen" },
  { label: "Large Window", value: "large" },
  { label: "Medium Window", value: "medium" },
  { label: "Small Window", value: "small" },
];

const TITLE_LINE_OPTIONS: { label: string; value: TitleLineCount }[] = [
  { label: "One Line", value: "one" },
  { label: "Two Lines", value: "two" },
];

const LONG_PRESS_MS = 420;

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
    enterSelectionMode,
    clearSelection,
    hideSelectedIcons,
    deleteSelectedIcons,
  } = useIconStore();

  const {
    keyword,
    setKeyword,
    submitSearch,
    isKeywordCommitted,
    loadedCount: searchLoadedCount,
    getItemAt: getSearchItemAt,
    setVisibleRange: setSearchVisibleRange,
    requestRange: requestSearchRange,
    loading: searchLoading,
    loadingMore: searchLoadingMore,
    error: searchError,
    provider: searchProvider,
    tookMs: searchTookMs,
    totalResults: searchTotalResults,
    selectedIndex,
    setSelectedIndex,
    moveSelection,
    filter: searchFilter,
    setFilter: setSearchFilter,
    settings: searchSettings,
    reloadSettings: reloadSearchSettings,
    clear: clearSearch,
  } = useSearch();

  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const [isSearchPanelOpen, setIsSearchPanelOpen] = useState(false);
  const hasSearchKeyword = keyword.trim().length > 0;
  const isSearchPanelVisible = hasSearchKeyword && isSearchPanelOpen;

  useEffect(() => {
    void (async () => {
      try {
        await hydrateSettings();
        await fetchIcons();
        const { windowMode: currentWindowMode, applyWindowMode } = useIconStore.getState();
        await applyWindowMode(currentWindowMode);
        applyTheme(await getSavedTheme());
      } catch (e) {
        console.error("Failed to initialize launchpad settings:", e);
      }
    })();
  }, [fetchIcons, hydrateSettings]);

  useEffect(() => {
    const unlisten = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) {
        void (async () => {
          try {
            const state = useIconStore.getState();
            await state.hydrateSettings();
            await useIconStore.getState().fetchIcons();
            await reloadSearchSettings();
            applyTheme(await getSavedTheme());
          } catch (e) {
            console.error("Failed to sync settings on focus:", e);
          }
        })();
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [reloadSearchSettings]);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    setIsSearchPanelOpen(hasSearchKeyword);
  }, [keyword, hasSearchKeyword]);

  const clearBackgroundLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const isBackgroundInteraction = (target: HTMLElement) =>
    !target.closest("[data-icon]") &&
    !target.closest("[data-search-placeholder]") &&
    !target.closest("[data-pagination]") &&
    !target.closest("[data-selection-toolbar]");

  const handleBackgroundPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (selectionMode || e.button !== 0 || hasSearchKeyword) return;
    const target = e.target as HTMLElement;
    if (!isBackgroundInteraction(target)) return;

    longPressTriggeredRef.current = false;
    clearBackgroundLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      enterSelectionMode();
    }, LONG_PRESS_MS);
  };

  const handleBackgroundPointerUp = () => {
    clearBackgroundLongPressTimer();
  };

  const handleBackgroundPointerCancel = () => {
    clearBackgroundLongPressTimer();
  };

  const handleBackgroundPointerLeave = () => {
    clearBackgroundLongPressTimer();
  };

  const launchSearchItem = async (path: string) => {
    try {
      await invoke("launch_app", { path });
      await invoke("toggle_window");
      clearSearch();
    } catch (e) {
      console.error("Failed to launch selected search item:", e);
    }
  };

  const handleSearchInputKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isSearchPanelVisible && hasSearchKeyword) {
        setIsSearchPanelOpen(true);
      }
      moveSelection(1);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!isSearchPanelVisible && hasSearchKeyword) {
        setIsSearchPanelOpen(true);
      }
      moveSelection(-1);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (!isSearchPanelVisible && hasSearchKeyword) {
        setIsSearchPanelOpen(true);
      }
      if (!searchSettings.liveOnType) {
        if (!isKeywordCommitted) {
          submitSearch();
          return;
        }
        submitSearch();
      }
      if (!searchSettings.openOnEnter) {
        return;
      }
      const selectedItem = getSearchItemAt(selectedIndex);
      if (selectedItem) {
        void launchSearchItem(selectedItem.path);
      } else if (selectedIndex >= 0) {
        requestSearchRange(selectedIndex, selectedIndex);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (isSearchPanelVisible) {
        setIsSearchPanelOpen(false);
        return;
      }
      clearSearch();
    }
  };

  const handleBackgroundClick = (e: React.MouseEvent) => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }

    const target = e.target as HTMLElement;
    const clickedOutsideSearch = !target.closest("[data-search-placeholder]");

    if (isSearchPanelVisible && clickedOutsideSearch) {
      setIsSearchPanelOpen(false);
      return;
    }

    if (selectionMode) {
      if (isBackgroundInteraction(target)) {
        clearSelection();
      }
      return;
    }

    if (windowMode === "fullscreen" && !hasSearchKeyword) {
      if (isBackgroundInteraction(target)) {
        void invoke("toggle_window");
      }
    }
  };

  const handleHideSelected = () => {
    if (selectedIconKeys.length === 0) return;
    void hideSelectedIcons();
  };

  const handleDeleteSelected = () => {
    if (selectedIconKeys.length === 0) return;
    const confirmed = window.confirm(
      `Delete ${selectedIconKeys.length} selected icon(s)? This cannot be undone.`,
    );
    if (!confirmed) return;
    void deleteSelectedIcons();
  };

  const openSettings = async () => {
    const existing = await WebviewWindow.getByLabel("settings");
    if (existing) {
      await existing.unminimize();
      await existing.show();
      await existing.setFocus();
      await getCurrentWindow().hide();
      return;
    }

    const settingsWindow = new WebviewWindow("settings", {
      url: "index.html?page=settings",
      title: "Settings",
      width: 800,
      height: 600,
      center: true,
      resizable: true,
      decorations: true,
    });
    settingsWindow.once("tauri://created", async () => {
      await getCurrentWindow().hide();
    });
    settingsWindow.once("tauri://error", (e) => {
      console.error("Failed to create settings window:", e);
    });
  };

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
            <input
              data-search-placeholder
              type="text"
              value={keyword}
              onChange={(e) => {
                setKeyword(e.target.value);
              }}
              onFocus={() => {
                if (hasSearchKeyword) {
                  setIsSearchPanelOpen(true);
                }
              }}
              onKeyDown={handleSearchInputKeyDown}
              placeholder="Search files, folders and applications..."
              aria-label="Search files"
              className="h-11 w-full rounded-full border border-white/20 bg-black/25 px-4 text-sm text-white/90 shadow-lg backdrop-blur-md placeholder:text-white/50"
            />
          </div>

          <SearchPanel
            visible={isSearchPanelVisible}
            loading={searchLoading}
            loadingMore={searchLoadingMore}
            error={searchError}
            provider={searchProvider}
            tookMs={searchTookMs}
            totalResults={searchTotalResults}
            loadedCount={searchLoadedCount}
            getItemAt={getSearchItemAt}
            selectedIndex={selectedIndex}
            filter={searchFilter}
            onFilterChange={setSearchFilter}
            onVisibleRangeChange={setSearchVisibleRange}
            onSelect={setSelectedIndex}
            allowDoubleClickOpen={searchSettings.openOnDoubleClick}
            onActivate={(item) => {
              void launchSearchItem(item.path);
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
              onValueChange={(value) => setIconSize(value as IconSize)}
            >
              {ICON_SIZE_OPTIONS.map((option) => (
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
              onValueChange={(value) => setWindowMode(value as WindowMode)}
            >
              {WINDOW_MODE_OPTIONS.map((option) => (
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
              onValueChange={(value) => setTitleLineCount(value as TitleLineCount)}
            >
              {TITLE_LINE_OPTIONS.map((option) => (
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
  );
}
