import { SEARCH_SORT_OPTIONS, getSearchSortLabel } from '@/lib/search/sorts'
import type { SearchSort } from '@/lib/search/types'
import { ArrowUpDown, Check, Eye, EyeOff, Settings2 } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'

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

const FLOATING_MENU_GAP = 8
const FLOATING_MENU_MARGIN = 12
const FLOATING_MENU_Z_INDEX = 90

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function getFloatingMenuStyle(
  triggerElement: HTMLElement,
  menuElement: HTMLDivElement,
  preferredWidth: number,
  align: 'start' | 'end'
): CSSProperties {
  const triggerRect = triggerElement.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const menuWidth = Math.min(preferredWidth, viewportWidth - FLOATING_MENU_MARGIN * 2)
  const menuHeight = menuElement.scrollHeight
  const naturalLeft = align === 'start' ? triggerRect.left : triggerRect.right - menuWidth
  const left = clamp(
    naturalLeft,
    FLOATING_MENU_MARGIN,
    Math.max(FLOATING_MENU_MARGIN, viewportWidth - menuWidth - FLOATING_MENU_MARGIN)
  )
  const spaceBelow = viewportHeight - triggerRect.bottom - FLOATING_MENU_MARGIN
  const spaceAbove = triggerRect.top - FLOATING_MENU_MARGIN
  const shouldOpenUpward =
    spaceBelow < Math.min(menuHeight, 320) + FLOATING_MENU_GAP && spaceAbove > spaceBelow
  const maxHeight = Math.max(
    140,
    shouldOpenUpward
      ? triggerRect.top - FLOATING_MENU_GAP - FLOATING_MENU_MARGIN
      : viewportHeight - triggerRect.bottom - FLOATING_MENU_GAP - FLOATING_MENU_MARGIN
  )

  return {
    position: 'fixed',
    left,
    width: menuWidth,
    maxHeight,
    zIndex: FLOATING_MENU_Z_INDEX,
    top: shouldOpenUpward ? undefined : triggerRect.bottom + FLOATING_MENU_GAP,
    bottom: shouldOpenUpward ? viewportHeight - triggerRect.top + FLOATING_MENU_GAP : undefined,
  }
}

function FloatingMenu({
  open,
  triggerRef,
  menuRef,
  width,
  align,
  className,
  children,
}: {
  open: boolean
  triggerRef: RefObject<HTMLElement | null>
  menuRef: RefObject<HTMLDivElement | null>
  width: number
  align: 'start' | 'end'
  className: string
  children: ReactNode
}) {
  const [style, setStyle] = useState<CSSProperties | null>(null)

  const updatePosition = useCallback(() => {
    const triggerElement = triggerRef.current
    const menuElement = menuRef.current

    if (!triggerElement || !menuElement) {
      return
    }

    setStyle(getFloatingMenuStyle(triggerElement, menuElement, width, align))
  }, [align, menuRef, triggerRef, width])

  useLayoutEffect(() => {
    if (!open) {
      setStyle(null)
      return
    }

    updatePosition()

    const handleViewportChange = () => {
      updatePosition()
    }

    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)

    return () => {
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
    }
  }, [open, updatePosition])

  if (!open) {
    return null
  }

  return createPortal(
    <div
      ref={menuRef}
      data-search-floating-menu="true"
      className={className}
      style={
        style ?? {
          position: 'fixed',
          top: FLOATING_MENU_MARGIN,
          left: FLOATING_MENU_MARGIN,
          width:
            typeof window === 'undefined'
              ? width
              : Math.min(width, window.innerWidth - FLOATING_MENU_MARGIN * 2),
          visibility: 'hidden',
          zIndex: FLOATING_MENU_Z_INDEX,
        }
      }
    >
      {children}
    </div>,
    document.body
  )
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
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const [matcherMenuOpen, setMatcherMenuOpen] = useState(false)
  const sortMenuRef = useRef<HTMLDivElement | null>(null)
  const matcherMenuRef = useRef<HTMLDivElement | null>(null)
  const sortButtonRef = useRef<HTMLButtonElement | null>(null)
  const matcherButtonRef = useRef<HTMLButtonElement | null>(null)
  const hasActiveMatcher = matchCase || wholeWord || matchPath || regex
  const selectedSortLabel = getSearchSortLabel(sort)
  const groupedSortOptions = useMemo(
    () =>
      SEARCH_SORT_OPTIONS.reduce(
        (groups, option) => {
          groups[option.group].push(option)
          return groups
        },
        {
          common: [] as typeof SEARCH_SORT_OPTIONS,
          metadata: [] as typeof SEARCH_SORT_OPTIONS,
          history: [] as typeof SEARCH_SORT_OPTIONS,
        }
      ),
    []
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
    <div className="flex items-center justify-end gap-2">
      <div className="relative">
        <button
          ref={sortButtonRef}
          type="button"
          aria-label="搜索排序"
          aria-expanded={sortMenuOpen}
          className={`inline-flex h-8 max-w-[11rem] items-center gap-1.5 rounded-md border px-2.5 text-xs transition ${
            sortMenuOpen
              ? 'border-white/35 bg-white/15 text-white'
              : 'border-white/20 text-white/70 hover:bg-white/10 hover:text-white'
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
          <ArrowUpDown className="h-4 w-4 shrink-0" />
          <span className="truncate">{selectedSortLabel}</span>
        </button>

        <FloatingMenu
          open={sortMenuOpen}
          triggerRef={sortButtonRef}
          menuRef={sortMenuRef}
          width={256}
          align="start"
          className="overflow-y-auto rounded-xl border border-white/15 bg-black/90 p-2 shadow-2xl backdrop-blur-xl"
        >
          <div className="space-y-0.5">
            {(['common', 'metadata', 'history'] as const).map(group => {
              const options = groupedSortOptions[group]
              if (options.length === 0) return null

              return (
                <div key={group} className="mb-2 last:mb-0">
                  <div className="px-3 pb-1 pt-1 text-[11px] uppercase tracking-[0.18em] text-white/35">
                    {SORT_GROUP_LABELS[group]}
                  </div>
                  <div className="space-y-1">
                    {options.map(option => (
                      <button
                        key={option.value}
                        type="button"
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                          sort === option.value
                            ? 'bg-white/14 text-white'
                            : 'text-white/70 hover:bg-white/8 hover:text-white'
                        }`}
                        onClick={() => {
                          onSortChange(option.value)
                          setSortMenuOpen(false)
                        }}
                      >
                        <span>{option.label}</span>
                        {sort === option.value ? (
                          <Check className="h-4 w-4 text-emerald-200" />
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </FloatingMenu>
      </div>

      <div className="relative">
        <button
          ref={matcherButtonRef}
          type="button"
          aria-label="搜索选项"
          aria-expanded={matcherMenuOpen}
          className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition ${
            matcherMenuOpen || hasActiveMatcher
              ? 'border-white/35 bg-white/15 text-white'
              : 'border-white/20 text-white/70 hover:bg-white/10 hover:text-white'
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
          <Settings2 className="h-4 w-4" />
        </button>

        <FloatingMenu
          open={matcherMenuOpen}
          triggerRef={matcherButtonRef}
          menuRef={matcherMenuRef}
          width={224}
          align="start"
          className="rounded-xl border border-white/15 bg-black/90 p-2 shadow-2xl backdrop-blur-xl"
        >
          <div>
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
        </FloatingMenu>
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
