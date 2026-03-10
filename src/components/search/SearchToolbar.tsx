import { SEARCH_SORT_OPTIONS } from '@/lib/search/sorts'
import type { SearchSort } from '@/lib/search/types'
import { Eye, EyeOff, Settings2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

interface SearchToolbarProps {
  matchPath: boolean
  onMatchPathChange: (value: boolean) => void
  matchCase: boolean
  onMatchCaseChange: (value: boolean) => void
  regex: boolean
  onRegexChange: (value: boolean) => void
  wholeWord: boolean
  onWholeWordChange: (value: boolean) => void
  sort: SearchSort
  onSortChange: (sort: SearchSort) => void
  previewVisible: boolean
  onPreviewToggle: () => void
}

interface MatcherToggleRowProps {
  active: boolean
  label: string
  onClick: () => void
}

function MatcherToggleRow({ active, label, onClick }: MatcherToggleRowProps) {
  return (
    <button
      type="button"
      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
        active ? 'bg-white/14 text-white' : 'text-white/70 hover:bg-white/8 hover:text-white'
      }`}
      onClick={onClick}
    >
      <span>{label}</span>
      <span
        className={`rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] ${
          active
            ? 'border-emerald-300/40 bg-emerald-400/10 text-emerald-100'
            : 'border-white/15 text-white/45'
        }`}
      >
        {active ? '开' : '关'}
      </span>
    </button>
  )
}

export function SearchToolbar({
  matchPath,
  onMatchPathChange,
  matchCase,
  onMatchCaseChange,
  regex,
  onRegexChange,
  wholeWord,
  onWholeWordChange,
  sort,
  onSortChange,
  previewVisible,
  onPreviewToggle,
}: SearchToolbarProps) {
  const [matcherMenuOpen, setMatcherMenuOpen] = useState(false)
  const matcherMenuRef = useRef<HTMLDivElement | null>(null)
  const hasActiveMatcher = matchCase || wholeWord || matchPath || regex

  useEffect(() => {
    if (!matcherMenuOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!matcherMenuRef.current?.contains(event.target as Node)) {
        setMatcherMenuOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [matcherMenuOpen])

  return (
    <div className="flex items-center justify-end gap-2">
      <select
        value={sort}
        onChange={e => onSortChange(e.target.value as SearchSort)}
        aria-label="搜索排序"
        className="max-w-[11rem] rounded-md border border-white/20 bg-black/40 px-2 py-1 text-xs text-white/80 outline-none transition hover:bg-white/10"
      >
        {SEARCH_SORT_OPTIONS.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <div ref={matcherMenuRef} className="relative">
        <button
          type="button"
          aria-label="搜索选项"
          aria-expanded={matcherMenuOpen}
          className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition ${
            matcherMenuOpen || hasActiveMatcher
              ? 'border-white/35 bg-white/15 text-white'
              : 'border-white/20 text-white/70 hover:bg-white/10 hover:text-white'
          }`}
          onClick={() => setMatcherMenuOpen(open => !open)}
        >
          <Settings2 className="h-4 w-4" />
        </button>

        {matcherMenuOpen ? (
          <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-xl border border-white/15 bg-black/90 p-2 shadow-2xl backdrop-blur-xl">
            <div className="px-3 pb-2 pt-1 text-[11px] uppercase tracking-[0.18em] text-white/35">
              匹配选项
            </div>
            <div className="space-y-1">
              <MatcherToggleRow
                active={matchCase}
                label="区分大小写"
                onClick={() => onMatchCaseChange(!matchCase)}
              />
              <MatcherToggleRow
                active={wholeWord}
                label="全字匹配"
                onClick={() => onWholeWordChange(!wholeWord)}
              />
              <MatcherToggleRow
                active={matchPath}
                label="匹配路径"
                onClick={() => onMatchPathChange(!matchPath)}
              />
              <MatcherToggleRow
                active={regex}
                label="正则表达式"
                onClick={() => onRegexChange(!regex)}
              />
            </div>
          </div>
        ) : null}
      </div>

      <button
        type="button"
        aria-label={previewVisible ? '隐藏预览' : '显示预览'}
        className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs transition ${
          previewVisible
            ? 'border-white/35 bg-white/15 text-white'
            : 'border-white/20 text-white/70 hover:bg-white/10 hover:text-white'
        }`}
        onClick={onPreviewToggle}
      >
        {previewVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        <span className="hidden sm:inline">{previewVisible ? '隐藏预览' : '显示预览'}</span>
      </button>
    </div>
  )
}
