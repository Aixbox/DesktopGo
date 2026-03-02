import type { SearchHit, SearchProvider } from "@/lib/search/types";
import { File, Folder } from "lucide-react";

interface SearchPanelProps {
  visible: boolean;
  loading: boolean;
  error: string | null;
  provider: SearchProvider | null;
  tookMs: number;
  items: SearchHit[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onActivate: (item: SearchHit) => void;
}

export function SearchPanel({
  visible,
  loading,
  error,
  provider,
  tookMs,
  items,
  selectedIndex,
  onSelect,
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
          <span>{provider ? `Everything (${provider})` : "Everything"}</span>
          <span>{loading ? "Searching..." : `${items.length} result(s) · ${tookMs}ms`}</span>
        </div>

        {error ? (
          <div className="px-4 py-3 text-sm text-red-200">{error}</div>
        ) : null}

        {!error && !loading && items.length === 0 ? (
          <div className="px-4 py-3 text-sm text-white/60">No results</div>
        ) : null}

        <ul className="max-h-[52vh] overflow-auto">
          {items.map((item, index) => (
            <li key={item.path}>
              <button
                type="button"
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${
                  selectedIndex === index ? "bg-white/15" : "hover:bg-white/10"
                }`}
                onMouseEnter={() => onSelect(index)}
                onDoubleClick={() => onActivate(item)}
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
        </ul>
      </div>
    </div>
  );
}
