import type { SearchDefaultFilter } from "@/lib/search/settings";
import type { SearchHit, SearchProvider } from "@/lib/search/types";
import { File, Folder } from "lucide-react";

interface SearchPanelProps {
  visible: boolean;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  provider: SearchProvider | null;
  tookMs: number;
  items: SearchHit[];
  selectedIndex: number;
  filter: SearchDefaultFilter;
  onFilterChange: (filter: SearchDefaultFilter) => void;
  onSelect: (index: number) => void;
  onLoadMore: () => void;
  allowDoubleClickOpen: boolean;
  onActivate: (item: SearchHit) => void;
}

export function SearchPanel({
  visible,
  loading,
  loadingMore,
  hasMore,
  error,
  provider,
  tookMs,
  items,
  selectedIndex,
  filter,
  onFilterChange,
  onSelect,
  onLoadMore,
  allowDoubleClickOpen,
  onActivate,
}: SearchPanelProps) {
  if (!visible) return null;

  return (
    <div
      data-search-placeholder
      className="absolute left-1/2 top-[4.6rem] z-30 w-full max-w-2xl -translate-x-1/2 px-6"
    >
      <div className="max-h-[60vh] overflow-hidden rounded-2xl border border-white/15 bg-black/70 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 text-xs text-white/60">
          <span>{provider ? "Everything (installed)" : "Everything"}</span>
          <span>{loading ? "Searching..." : `${items.length} result(s) · ${tookMs}ms`}</span>
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

        {error ? <div className="px-4 py-3 text-sm text-red-200">{error}</div> : null}

        {!error && !loading && items.length === 0 ? (
          <div className="px-4 py-3 text-sm text-white/60">No results</div>
        ) : null}

        <ul
          className="max-h-[52vh] overflow-auto"
          onScroll={(e) => {
            const element = e.currentTarget;
            if (
              hasMore &&
              !loadingMore &&
              element.scrollTop + element.clientHeight >= element.scrollHeight - 80
            ) {
              onLoadMore();
            }
          }}
        >
          {items.map((item, index) => (
            <li key={`${item.path}-${index}`}>
              <button
                type="button"
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${
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
                <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white/5">
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
                  <span className="block truncate text-sm text-white">{item.name || item.path}</span>
                  <span className="block truncate text-xs text-white/60">{item.parent}</span>
                </span>
              </button>
            </li>
          ))}
          {loadingMore ? <li className="px-4 py-2 text-xs text-white/60">Loading more...</li> : null}
          {!loading && !loadingMore && hasMore ? (
            <li className="px-4 py-2 text-xs text-white/50">Scroll to load more</li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
