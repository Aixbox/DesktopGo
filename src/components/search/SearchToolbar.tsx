import { getSearchSortLabel, getSearchSortOptions } from '@/lib/search/sorts'
import type { SearchSort } from '@/lib/search/types'
import { ArrowUpDown, Check, Eye, EyeOff, Settings2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { translate, useI18n } from '@/lib/i18n'
import { SearchFloatingMenu } from './SearchFloatingMenu'

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

const SORT_GROUP_LABELS = {
  common: '常用排序',
  metadata: '元数据',
  history: '历史记录',
} as const

function MatcherToggleRow({ active, label, onClick }: MatcherToggleRowProps) {
  useI18n()

  return (
    <button
      type="button"
      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
        active
          ? 'bg-accent/80 text-foreground'
          : 'text-muted-foreground hover:bg-accent/55 hover:text-foreground'
      }`}
      onClick={onClick}
    >
      <span>{label}</span>
      <span
        className={`rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] ${
          active
            ? 'border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300'
            : 'border-border/70 text-muted-foreground'
        }`}
      >
        {active ? translate('开') : translate('关')}
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
  useI18n()
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const [matcherMenuOpen, setMatcherMenuOpen] = useState(false)
  const sortMenuRef = useRef<HTMLDivElement | null>(null)
  const matcherMenuRef = useRef<HTMLDivElement | null>(null)
  const sortButtonRef = useRef<HTMLButtonElement | null>(null)
  const matcherButtonRef = useRef<HTMLButtonElement | null>(null)
  const hasActiveMatcher = matchCase || wholeWord || matchPath || regex
  const selectedSortLabel = getSearchSortLabel(sort)
  const sortOptions = getSearchSortOptions()
  const groupedSortOptions = sortOptions.reduce(
    (groups, option) => {
      groups[option.group].push(option)
      return groups
    },
    {
      common: [] as typeof sortOptions,
      metadata: [] as typeof sortOptions,
      history: [] as typeof sortOptions,
    }
  )

  useEffect(() => {
    if (!matcherMenuOpen && !sortMenuOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      const clickedMatcherButton = matcherButtonRef.current?.contains(target) ?? false
      const clickedSortButton = sortButtonRef.current?.contains(target) ?? false

      if (!matcherMenuRef.current?.contains(target) && !clickedMatcherButton) {
        setMatcherMenuOpen(false)
      }
      if (!sortMenuRef.current?.contains(target) && !clickedSortButton) {
        setSortMenuOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [matcherMenuOpen, sortMenuOpen])

  useEffect(() => {
    if (!matcherMenuOpen && !sortMenuOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMatcherMenuOpen(false)
        setSortMenuOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [matcherMenuOpen, sortMenuOpen])

  return (
    <div className="search-control-group inline-flex h-8 items-center gap-0.5 rounded-lg p-1">
      {/* 1. 排序下拉按钮 */}
      <div className="relative h-full">
        <button
          ref={sortButtonRef}
          type="button"
          aria-label={translate('搜索排序')}
          aria-expanded={sortMenuOpen}
          className={`group relative inline-flex h-full max-w-[10rem] items-center justify-center rounded-md px-3 text-xs font-medium transition-colors duration-200 ${
            sortMenuOpen ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() =>
            setSortMenuOpen(open => {
              const nextOpen = !open
              if (nextOpen) {
                setMatcherMenuOpen(false)
              }
              return nextOpen
            })
          }
        >
          {sortMenuOpen && <div className="search-control-indicator absolute inset-0 rounded-md" />}

          <span className="relative z-10 flex items-center gap-1.5">
            <ArrowUpDown className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{selectedSortLabel}</span>
          </span>
        </button>

        <SearchFloatingMenu
          open={sortMenuOpen}
          triggerRef={sortButtonRef}
          menuRef={sortMenuRef}
          width={256}
          align="start"
          className="search-floating-menu rounded-xl"
        >
          <div className="space-y-0.5">
            {(['common', 'metadata', 'history'] as const).map(group => {
              const options = groupedSortOptions[group]
              if (options.length === 0) return null

              return (
                <div key={group} className="mb-2 last:mb-0">
                  <div className="px-3 pb-1 pt-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    {translate(SORT_GROUP_LABELS[group])}
                  </div>
                  <div className="space-y-1">
                    {options.map(option => (
                      <button
                        key={option.value}
                        type="button"
                        className={`group flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-all duration-200 ${
                          sort === option.value
                            ? 'bg-accent/85 text-foreground shadow-sm ring-1 ring-border/70'
                            : 'text-muted-foreground hover:bg-accent/55 hover:text-foreground active:scale-[0.98]'
                        }`}
                        onClick={() => {
                          onSortChange(option.value)
                          setSortMenuOpen(false)
                        }}
                      >
                        <span>{option.label}</span>
                        {sort === option.value ? (
                          <Check className="h-4 w-4 text-blue-600 dark:text-blue-300" />
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </SearchFloatingMenu>
      </div>

      <div className="mx-0.5 h-3.5 w-[1px] bg-border/80" />

      {/* 2. 匹配选项下拉按钮 */}
      <div className="relative h-full">
        <button
          ref={matcherButtonRef}
          type="button"
          aria-label={translate('搜索选项')}
          aria-expanded={matcherMenuOpen}
          className={`relative inline-flex h-full w-8 items-center justify-center rounded-md transition-colors duration-200 ${
            matcherMenuOpen || hasActiveMatcher
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() =>
            setMatcherMenuOpen(open => {
              const nextOpen = !open
              if (nextOpen) {
                setSortMenuOpen(false)
              }
              return nextOpen
            })
          }
        >
          {(matcherMenuOpen || hasActiveMatcher) && (
            <div className="search-control-indicator absolute inset-0 rounded-md" />
          )}

          <span className="relative z-10 flex items-center justify-center">
            <Settings2 className="h-4 w-4" />
            {hasActiveMatcher && (
              <span className="absolute right-[-0.375rem] top-[-0.375rem] h-1.5 w-1.5 rounded-full bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.4)] dark:shadow-[0_0_8px_rgba(96,165,250,0.5)]" />
            )}
          </span>
        </button>

        <SearchFloatingMenu
          open={matcherMenuOpen}
          triggerRef={matcherButtonRef}
          menuRef={matcherMenuRef}
          width={224}
          align="start"
          className="search-floating-menu rounded-xl"
        >
          <div>
            <div className="px-3 pb-2 pt-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              {translate('匹配选项')}
            </div>
            <div className="space-y-1">
              <MatcherToggleRow
                active={matchCase}
                label={translate('区分大小写')}
                onClick={() => onMatchCaseChange(!matchCase)}
              />
              <MatcherToggleRow
                active={wholeWord}
                label={translate('全字匹配')}
                onClick={() => onWholeWordChange(!wholeWord)}
              />
              <MatcherToggleRow
                active={matchPath}
                label={translate('匹配路径')}
                onClick={() => onMatchPathChange(!matchPath)}
              />
              <MatcherToggleRow
                active={regex}
                label={translate('正则表达式')}
                onClick={() => onRegexChange(!regex)}
              />
            </div>
          </div>
        </SearchFloatingMenu>
      </div>

      <div className="mx-0.5 h-3.5 w-[1px] bg-border/80" />

      {/* 3. 预览开关按钮 */}
      <button
        type="button"
        title={previewVisible ? translate('隐藏预览') : translate('显示预览')}
        aria-label={previewVisible ? translate('隐藏预览') : translate('显示预览')}
        className={`relative inline-flex h-full w-8 items-center justify-center rounded-md transition-colors duration-200 ${
          previewVisible ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
        }`}
        onClick={onPreviewToggle}
      >
        {previewVisible && <div className="search-control-indicator absolute inset-0 rounded-md" />}
        <span className="relative z-10 flex items-center justify-center">
          {previewVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </span>
      </button>
    </div>
  )
}
