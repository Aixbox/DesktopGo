import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useIconStore } from "@/stores/iconStore";
import type { IconSize, WindowMode } from "@/types";
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

export function Launchpad() {
  const { icons, loading, fetchIcons, iconSize, setIconSize, windowMode, setWindowMode } =
    useIconStore();

  useEffect(() => {
    fetchIcons();
  }, [fetchIcons]);

  useEffect(() => {
    const { windowMode: currentWindowMode, applyWindowMode } = useIconStore.getState();
    applyWindowMode(currentWindowMode);
  }, []);

  const handleBackgroundClick = (e: React.MouseEvent) => {
    if (windowMode === "fullscreen") {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-icon]")) {
        void invoke("toggle_window");
      }
    }
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
      </ContextMenuContent>
    </ContextMenu>
  );
}
