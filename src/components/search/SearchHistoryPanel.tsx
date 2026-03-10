import type { SearchHistoryEntry } from '@/lib/search/history'
import { getSearchSortLabel } from '@/lib/search/sorts'

interface SearchHistoryPanelProps {
  entries: SearchHistoryEntry[]
  onSelect: (entry: SearchHistoryEntry) => void
  onRemove: (id: string) => void
  onClear: () => void
}

const formatHistoryTime = (usedAt: number) => {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(usedAt)
  } catch {
    return ''
  }
}

export function SearchHistoryPanel({
  entries,
  onSelect,
  onRemove,
  onClear,
}: SearchHistoryPanelProps) {
  if (entries.length === 0) {
    return (
      <div className="px-4 py-4 text-sm text-white/60">
        Start typing to search. Your recent searches will appear here.
      </div>
    )
  }

  return (
    <div className="px-3 py-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-white/35">Recent Searches</div>
          <div className="mt-1 text-sm text-white/60">
            Restore the keyword, filter, matcher options and sorting from a previous search.
          </div>
        </div>
        <button
          type="button"
          className="rounded-md border border-white/20 px-2.5 py-1 text-xs text-white/70 transition hover:bg-white/10"
          onClick={onClear}
        >
          Clear
        </button>
      </div>

      <div className="space-y-2">
        {entries.map(entry => (
          <div
            key={entry.id}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"
          >
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => onSelect(entry)}
            >
              <div className="truncate text-sm text-white">{entry.keyword}</div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/45">
                <span>{entry.filter}</span>
                <span>{getSearchSortLabel(entry.sort)}</span>
                {entry.matchCase ? <span>Case</span> : null}
                {entry.wholeWord ? <span>Whole</span> : null}
                {entry.matchPath ? <span>Path</span> : null}
                {entry.regex ? <span>Regex</span> : null}
                <span>{formatHistoryTime(entry.usedAt)}</span>
              </div>
            </button>

            <button
              type="button"
              className="rounded-md border border-white/15 px-2 py-1 text-[11px] text-white/55 transition hover:bg-white/10 hover:text-white/80"
              onClick={() => onRemove(entry.id)}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
