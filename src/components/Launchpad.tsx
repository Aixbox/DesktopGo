import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { applyTheme, getSavedTheme } from "@/lib/theme";
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
  { label: "大图标", value: "large" },
  { label: "中等图标", value: "medium" },
  { label: "小图标", value: "small" },
];

const WINDOW_MODE_OPTIONS: { label: string; value: WindowMode }[] = [
  { label: "全屏", value: "fullscreen" },
  { label: "大窗口", value: "large" },
  { label: "中窗口", value: "medium" },
  { label: "小窗口", value: "small" },
];

const TITLE_LINE_OPTIONS: { label: string; value: TitleLineCount }[] = [
  { label: "一行标题", value: "one" },
  { label: "两行标题", value: "two" },
];

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
    clearSelection,
    hideSelectedIcons,
    deleteSelectedIcons,
  } = useIconStore();

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
  }, []);

  const handleBackgroundClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;

    if (selectionMode) {
      if (
        !target.closest("[data-icon]") &&
        !target.closest("[data-search-placeholder]") &&
        !target.closest("[data-pagination]") &&
        !target.closest("[data-selection-toolbar]")
      ) {
        clearSelection();
      }
      return;
    }

    if (windowMode === "fullscreen") {
      if (
        !target.closest("[data-icon]") &&
        !target.closest("[data-search-placeholder]") &&
        !target.closest("[data-pagination]")
      ) {
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
    const confirmed = window.confirm(`确定删除已选中的 ${selectedIconKeys.length} 个图标吗？`);
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
      title: "设置",
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
          onClick={handleBackgroundClick}
        >
          <div
            data-search-placeholder
            className="absolute left-1/2 top-6 z-10 w-full max-w-xl -translate-x-1/2 px-6"
          >
            <input
              data-search-placeholder
              type="text"
              placeholder="搜索（功能开发中）"
              readOnly
              aria-label="搜索框占位"
              className="h-11 w-full rounded-full border border-white/20 bg-black/25 px-4 text-sm text-white/80 shadow-lg backdrop-blur-md placeholder:text-white/50"
            />
          </div>

          {selectionMode ? (
            <div
              data-selection-toolbar
              className="absolute left-1/2 top-20 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/20 bg-black/55 px-3 py-2 text-sm text-white/90 backdrop-blur-md"
            >
              <span className="px-2">已选 {selectedIconKeys.length}</span>
              <button
                type="button"
                onClick={handleHideSelected}
                className="rounded-full border border-white/25 px-3 py-1 text-xs hover:bg-white/15"
              >
                隐藏
              </button>
              <button
                type="button"
                onClick={handleDeleteSelected}
                className="rounded-full border border-red-300/40 px-3 py-1 text-xs text-red-200 hover:bg-red-500/25"
              >
                删除
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="rounded-full border border-white/25 px-3 py-1 text-xs hover:bg-white/15"
              >
                取消
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

      <ContextMenuContent className="w-40">
        <ContextMenuSub>
          <ContextMenuSubTrigger>图标大小</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-40">
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
          <ContextMenuSubTrigger>窗口大小</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-40">
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
          <ContextMenuSubTrigger>标题行数</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-40">
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
        <ContextMenuItem onSelect={openSettings}>设置</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
