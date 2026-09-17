import type { KeyboardEvent, RefObject } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { translate } from '@/lib/i18n'
import type { SearchFilterDefinition } from '@/lib/search/filters'
import type { SearchDefaultFilter } from '@/lib/search/settings'
import type { SearchSource } from '@/lib/search/scope'
import { SearchFloatingMenu } from '@/components/search/SearchFloatingMenu'

interface LaunchpadSearchBarProps {
  searchSource: SearchSource
  keyword: string
  inputRef: RefObject<HTMLInputElement | null>
  onKeywordChange: (value: string) => void
  onInputFocus: () => void
  onInputKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  filterButtonRef: RefObject<HTMLButtonElement | null>
  filterMenuRef: RefObject<HTMLDivElement | null>
  isFilterMenuOpen: boolean
  onFilterToggle: () => void
  filterOptions: SearchFilterDefinition[]
  filter: SearchDefaultFilter
  selectedFilterLabel: string
  onFilterSelect: (value: SearchDefaultFilter) => void
}

/**
 * 搜索栏：输入框 + 文件筛选下拉菜单。
 * 快捷方式来源（`icons`）没有文件筛选，只渲染输入框。
 */
export function LaunchpadSearchBar({
  searchSource,
  keyword,
  inputRef,
  onKeywordChange,
  onInputFocus,
  onInputKeyDown,
  filterButtonRef,
  filterMenuRef,
  isFilterMenuOpen,
  onFilterToggle,
  filterOptions,
  filter,
  selectedFilterLabel,
  onFilterSelect,
}: LaunchpadSearchBarProps) {
  return (
    <>
      <input
        ref={inputRef}
        data-search-placeholder
        type="text"
        value={keyword}
        onChange={e => onKeywordChange(e.target.value)}
        onFocus={onInputFocus}
        onKeyDown={onInputKeyDown}
        placeholder={
          searchSource === 'all'
            ? translate('搜索应用、快捷入口、文件和文件夹...')
            : searchSource === 'everything'
              ? translate('搜索文件和文件夹...')
              : translate('搜索快捷入口...')
        }
        aria-label={
          searchSource === 'all'
            ? translate('搜索全部内容')
            : searchSource === 'everything'
              ? translate('搜索文件')
              : translate('搜索快捷入口')
        }
        className={`launchpad-glass-panel h-11 w-full rounded-full px-4 text-sm text-foreground/90 outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/40 ${
          searchSource !== 'icons' ? 'pr-36' : ''
        }`}
      />

      {searchSource !== 'icons' ? (
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          <button
            ref={filterButtonRef}
            data-search-placeholder
            type="button"
            className="launchpad-glass-button inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs transition-colors"
            onClick={onFilterToggle}
          >
            <span className="truncate">
              {searchSource === 'all'
                ? `${translate('文件')} · ${selectedFilterLabel}`
                : selectedFilterLabel}
            </span>
            <ChevronDown className="h-3.5 w-3.5" />
          </button>

          <SearchFloatingMenu
            open={isFilterMenuOpen}
            triggerRef={filterButtonRef}
            menuRef={filterMenuRef}
            width={192}
            align="start"
            className="launchpad-glass-panel-strong overflow-hidden rounded-xl shadow-xl"
            contentClassName="p-1.5"
          >
            {filterOptions.map(entry => (
              <button
                key={entry.value}
                type="button"
                className={`flex w-full items-center justify-between rounded-sm px-3 py-2 text-sm transition ${
                  filter === entry.value
                    ? 'bg-accent text-foreground'
                    : 'text-foreground/70 hover:bg-accent hover:text-foreground'
                }`}
                onClick={() => onFilterSelect(entry.value)}
              >
                <span>{entry.label}</span>
                {filter === entry.value ? (
                  <Check className="accent-foreground h-4 w-4" />
                ) : null}
              </button>
            ))}
          </SearchFloatingMenu>
        </div>
      ) : null}
    </>
  )
}
