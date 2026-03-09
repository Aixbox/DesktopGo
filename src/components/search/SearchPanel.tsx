import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SearchDefaultFilter } from "@/lib/search/settings";
import type { SearchHit, SearchProvider } from "@/lib/search/types";
import { File, Folder } from "lucide-react";

const ROW_HEIGHT = 68;
const OVERSCAN_ROWS = 6;
const LOAD_AHEAD_ROWS = 24;
const PANEL_TRANSITION = {
  duration: 0.18,
  ease: [0.22, 1, 0.36, 1] as const,
};

interface SearchPanelProps {
  visible: boolean;
  loading: boolean;
  searchPending: boolean;
  loadingMore: boolean;
  error: string | null;
  provider: SearchProvider | null;
  tookMs: number;
  totalResults: number;
  loadedCount: number;
  hasCommittedQuery: boolean;
  getItemAt: (index: number) => SearchHit | null;
  selectedIndex: number;
  filter: SearchDefaultFilter;
  onFilterChange: (filter: SearchDefaultFilter) => void;
  onVisibleRangeChange: (startIndex: number, endIndex: number) => void;
  onSelect: (index: number) => void;
  allowDoubleClickOpen: boolean;
  onActivate: (item: SearchHit) => void;
}

export function SearchPanel({
  visible,
  loading,
  searchPending,
  loadingMore,
  error,
  provider,
  tookMs,
  totalResults,
  loadedCount,
  hasCommittedQuery,
  getItemAt,
  selectedIndex,
  filter,
  onFilterChange,
  onVisibleRangeChange,
  onSelect,
  allowDoubleClickOpen,
  onActivate,
}: SearchPanelProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const bodyContentRef = useRef<HTMLDivElement | null>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [bodyHeight, setBodyHeight] = useState(0);
  const prefersReducedMotion = useReducedMotion();

  const virtualCount = totalResults > 0 ? totalResults : loadedCount;
  const visibleRowCount = Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN_ROWS * 2;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN_ROWS);
  const endIndex =
    virtualCount === 0
      ? -1
      : Math.min(virtualCount - 1, startIndex + Math.max(visibleRowCount, 1) - 1);

  const notifyVisibleRange = useCallback(
    (nextScrollTop: number, nextViewportHeight: number) => {
      if (virtualCount === 0 || nextViewportHeight <= 0) {
        onVisibleRangeChange(0, -1);
        return;
      }

      const nextStartIndex = Math.max(0, Math.floor(nextScrollTop / ROW_HEIGHT));
      const nextVisibleRowCount = Math.ceil(nextViewportHeight / ROW_HEIGHT);
      const nextEndIndex = Math.min(
        virtualCount - 1,
        nextStartIndex + Math.max(nextVisibleRowCount, 1) - 1 + LOAD_AHEAD_ROWS,
      );
      onVisibleRangeChange(nextStartIndex, nextEndIndex);
    },
    [onVisibleRangeChange, virtualCount],
  );

  useEffect(() => {
    if (!visible) return;

    const element = viewportRef.current;
    if (!element) return;

    const updateViewportHeight = () => {
      setViewportHeight(element.clientHeight);
    };

    updateViewportHeight();

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            updateViewportHeight();
          });

    resizeObserver?.observe(element);
    window.addEventListener("resize", updateViewportHeight);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateViewportHeight);
    };
  }, [visible]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element || selectedIndex < 0) return;

    const rowTop = selectedIndex * ROW_HEIGHT;
    const rowBottom = rowTop + ROW_HEIGHT;
    const viewportTop = element.scrollTop;
    const viewportBottom = viewportTop + element.clientHeight;

    if (rowTop < viewportTop) {
      element.scrollTop = rowTop;
    } else if (rowBottom > viewportBottom) {
      element.scrollTop = rowBottom - element.clientHeight;
    }
  }, [selectedIndex]);

  useEffect(() => {
    if (!loading || loadingMore) return;
    const element = viewportRef.current;
    if (!element) return;
    element.scrollTop = 0;
    setScrollTop(0);
  }, [loading, loadingMore]);

  useEffect(() => {
    notifyVisibleRange(scrollTop, viewportHeight);
  }, [notifyVisibleRange, scrollTop, viewportHeight]);

  const virtualRows = useMemo(() => {
    if (endIndex < startIndex) return [];

    const rows: Array<{ index: number; item: SearchHit | null }> = [];
    for (let index = startIndex; index <= endIndex; index += 1) {
      rows.push({
        index,
        item: getItemAt(index),
      });
    }
    return rows;
  }, [endIndex, getItemAt, loadedCount, startIndex]);

  const resultSummary = `${loadedCount}/${totalResults} result(s) - ${tookMs}ms`;
  const showSearchingState = searchPending && virtualCount === 0;
  const panelTransition = prefersReducedMotion ? { duration: 0 } : PANEL_TRANSITION;
  const statusText = showSearchingState
    ? "Searching..."
    : hasCommittedQuery
      ? resultSummary
      : "Type to search";
  const emptyStateText = showSearchingState
    ? "Searching..."
    : hasCommittedQuery
      ? "No results"
      : "Type to search";
  const bodyStateKey = error
    ? `error-${error}`
    : virtualCount === 0
      ? showSearchingState
        ? "searching-empty"
        : "empty"
      : "results";

  useEffect(() => {
    if (!visible) return;

    const element = bodyContentRef.current;
    if (!element) return;

    const updateBodyHeight = () => {
      setBodyHeight(element.getBoundingClientRect().height);
    };

    updateBodyHeight();

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            updateBodyHeight();
          });

    resizeObserver?.observe(element);

    return () => {
      resizeObserver?.disconnect();
    };
  }, [bodyStateKey, visible]);

  const bodyContent = (
    <div ref={bodyContentRef}>
      {error ? <div className="px-4 py-3 text-sm text-red-200">{error}</div> : null}

      {!error && virtualCount === 0 ? (
        <div className="px-4 py-3 text-sm text-white/60">{emptyStateText}</div>
      ) : null}

      {!error && virtualCount > 0 ? (
        <div className="relative">
          <div
            ref={viewportRef}
            className="max-h-[52vh] overflow-auto"
            onScroll={(e) => {
              const nextScrollTop = e.currentTarget.scrollTop;
              const nextViewportHeight = e.currentTarget.clientHeight;
              setScrollTop(nextScrollTop);
              notifyVisibleRange(nextScrollTop, nextViewportHeight);
            }}
          >
            <div
              className="relative"
              style={{
                height: virtualCount * ROW_HEIGHT,
              }}
            >
              {virtualRows.map(({ index, item }) => {
                const top = index * ROW_HEIGHT;

                if (!item) {
                  return (
                    <div
                      key={`placeholder-${index}`}
                      className="absolute left-0 right-0 px-4 py-2"
                      style={{ top, height: ROW_HEIGHT }}
                    >
                      <div className="flex h-full animate-pulse items-center gap-3 rounded-md bg-white/5 px-4">
                        <span className="h-8 w-8 rounded-md bg-white/10" />
                        <span className="min-w-0 flex-1">
                          <span className="mb-2 block h-3 w-1/3 rounded bg-white/10" />
                          <span className="block h-2.5 w-2/3 rounded bg-white/10" />
                        </span>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={`${item.path}-${index}`}
                    className="absolute left-0 right-0 px-0"
                    style={{ top, height: ROW_HEIGHT }}
                  >
                    <button
                      type="button"
                      className={`flex h-full w-full items-center gap-3 px-4 py-3 text-left transition ${
                        selectedIndex === index ? "bg-white/15" : "hover:bg-white/10"
                      }`}
                      onMouseEnter={() => onSelect(index)}
                      onDoubleClick={() => {
                        if (allowDoubleClickOpen) {
                          onActivate(item);
                        }
                      }}
                      onClick={() => onSelect(index)}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden">
                        {item.iconBase64 ? (
                          <img
                            src={item.iconBase64}
                            alt={item.name || item.path}
                            className="h-7 w-7 object-contain"
                            draggable={false}
                          />
                        ) : item.isFolder ? (
                          <Folder className="h-4 w-4 text-white/70" />
                        ) : (
                          <File className="h-4 w-4 text-white/70" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-white">
                          {item.name || item.path}
                        </span>
                        <span className="block truncate text-xs text-white/60">
                          {item.parent}
                        </span>
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {loadingMore ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-white/10 bg-black/50 px-4 py-2 text-xs text-white/60 backdrop-blur-sm">
              Loading more...
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  return (
    <div data-search-placeholder className="absolute left-1/2 top-[4.6rem] z-30 w-full max-w-2xl -translate-x-1/2 px-6">
      <AnimatePresence initial={false}>
        {visible ? (
          <motion.div
            key="search-panel"
            initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={panelTransition}
            className="pointer-events-auto overflow-hidden rounded-2xl border border-white/15 bg-black/70 shadow-2xl backdrop-blur-xl will-change-[opacity,transform]"
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2 text-xs text-white/60">
              <span className="shrink-0">{provider ? "Everything (installed)" : "Everything"}</span>
              <span className="flex min-w-0 items-center justify-end gap-2 overflow-hidden text-right">
                <span className="truncate whitespace-nowrap">{statusText}</span>
                <span
                  className={`inline-flex min-w-[5.5rem] shrink-0 justify-center rounded-full border px-2 py-0.5 text-[11px] transition-opacity ${
                    searchPending && !showSearchingState
                      ? "border-white/15 bg-white/5 text-white/45 opacity-100"
                      : "border-transparent bg-transparent text-transparent opacity-0"
                  }`}
                  aria-hidden={!searchPending || showSearchingState}
                >
                  Updating...
                </span>
              </span>
            </div>

            <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
              {(
                [
                  ["all", "All"],
                  ["files", "Files"],
                  ["folders", "Folders"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`rounded-md border px-2.5 py-1 text-xs transition ${
                    filter === value
                      ? "border-white/35 bg-white/15 text-white"
                      : "border-white/20 text-white/70 hover:bg-white/10"
                  }`}
                  onClick={() => onFilterChange(value)}
                >
                  {label}
                </button>
              ))}
            </div>

            {prefersReducedMotion ? (
              bodyContent
            ) : (
              <motion.div
                initial={false}
                animate={{ height: bodyHeight }}
                transition={panelTransition}
                className="overflow-hidden"
              >
                {bodyContent}
              </motion.div>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
