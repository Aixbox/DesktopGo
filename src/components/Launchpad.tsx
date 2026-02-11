import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
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
  { label: "中等窗口", value: "medium" },
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
    iconSize,
    setIconSize,
    windowMode,
    setWindowMode,
    titleLineCount,
    setTitleLineCount,
  } = useIconStore();

  useEffect(() => {
    fetchIcons();
  }, [fetchIcons]);

  useEffect(() => {
    const { windowMode: currentWindowMode, applyWindowMode } = useIconStore.getState();
    applyWindowMode(currentWindowMode);
  }, []);

  // 主窗口重新显示时，从 localStorage 同步设置（处理被隐藏期间 Settings 改动的情况）
  useEffect(() => {
    const unlisten = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) {
        const state = useIconStore.getState();
        const savedIconSize = localStorage.getItem("iconSize") as IconSize | null;
        const savedTitleLineCount = localStorage.getItem("titleLineCount") as TitleLineCount | null;
        if (savedIconSize && savedIconSize !== state.iconSize) {
          useIconStore.setState({ iconSize: savedIconSize });
          state.fetchIcons();
        }
        if (savedTitleLineCount && savedTitleLineCount !== state.titleLineCount) {
          useIconStore.setState({ titleLineCount: savedTitleLineCount });
        }
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleBackgroundClick = (e: React.MouseEvent) => {
    if (windowMode === "fullscreen") {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-icon]")) {
        void invoke("toggle_window");
      }
    }
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
          className="launchpad-bg flex h-screen w-screen select-none flex-col items-center justify-center"
          onClick={handleBackgroundClick}
        >
          {loading ? (
            <div className="flex items-center gap-3">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              <span className="text-lg text-white/70">Loading...</span>
            </div>
          ) : icons.length === 0 ? (
            <div className="text-lg text-white/50">No desktop shortcuts found</div>
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
