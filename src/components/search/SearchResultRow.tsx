import { memo, useLayoutEffect, useRef } from 'react'
import { File, Folder } from 'lucide-react'
import { parseEverythingHighlightedText } from '@/lib/search/highlight'
import type { SearchHit } from '@/lib/search/types'

const MAX_ANIMATED_SELECTION_ROWS = 4
const SELECTION_ANIMATION_DURATION_MS = 100
const SELECTION_ANIMATION_EASING = 'cubic-bezier(0.25, 1, 0.5, 1)'

function HighlightedText({
  highlightedText,
  fallbackText,
  className,
  highlightClassName,
}: {
  highlightedText: string
  fallbackText: string
  className: string
  highlightClassName: string
}) {
  const segments = parseEverythingHighlightedText(highlightedText, fallbackText)

  return (
    <span className={className}>
      {segments.map((segment, index) => (
        <span
          key={`${segment.text}-${index}`}
          className={segment.highlighted ? highlightClassName : undefined}
        >
          {segment.text}
        </span>
      ))}
    </span>
  )
}

interface SearchResultRowProps {
  index: number
  item: SearchHit
  top: number
  height: number
  iconBase64: string
  selected: boolean
  allowDoubleClickOpen: boolean
  onSelect: (index: number) => void
  onHover: (index: number) => void
  onActivate: (item: SearchHit) => void
}

export const SearchResultRow = memo(function SearchResultRow({
  index,
  item,
  top,
  height,
  iconBase64,
  selected,
  allowDoubleClickOpen,
  onSelect,
  onHover,
  onActivate,
}: SearchResultRowProps) {
  return (
    <div
      className="absolute left-0 right-0 py-1"
      style={{
        height,
        transform: `translate3d(0, ${top}px, 0)`,
        contain: 'layout paint style',
      }}
    >
      <button
        type="button"
        aria-current={selected ? 'true' : undefined}
        className={`relative z-10 flex h-full w-full items-center gap-3 rounded-md py-2 pl-4 pr-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/45 ${
          selected ? '' : 'hover:bg-accent/55'
        }`}
        onMouseEnter={() => onHover(index)}
        onDoubleClick={() => {
          if (allowDoubleClickOpen) onActivate(item)
        }}
        onClick={() => onSelect(index)}
      >
        <span
          key={item.path}
          className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden"
        >
          {iconBase64 ? (
            <img
              key={item.path}
              src={iconBase64}
              alt={item.name || item.path}
              className="h-7 w-7 object-contain"
              draggable={false}
            />
          ) : item.isFolder ? (
            <Folder className="h-4 w-4 text-muted-foreground" />
          ) : (
            <File className="h-4 w-4 text-muted-foreground" />
          )}
        </span>

        <span className="min-w-0 flex-1">
          <HighlightedText
            highlightedText={item.highlightedName}
            fallbackText={item.name || item.path}
            className="block truncate text-sm text-foreground"
            highlightClassName="accent-foreground font-medium"
          />
          <HighlightedText
            highlightedText={item.highlightedPath}
            fallbackText={item.parent}
            className="block truncate text-xs text-muted-foreground"
            highlightClassName="font-medium text-foreground/85"
          />
        </span>
      </button>
    </div>
  )
})

export function SearchResultSelectionHighlight({
  index,
  height,
}: {
  index: number
  height: number
}) {
  const elementRef = useRef<HTMLDivElement | null>(null)
  const previousIndexRef = useRef(index)

  useLayoutEffect(() => {
    const element = elementRef.current
    const previousIndex = previousIndexRef.current
    previousIndexRef.current = index
    if (!element || previousIndex === index || typeof element.animate !== 'function') return

    const runningAnimations = element.getAnimations()
    const fromTransform =
      runningAnimations.length > 0
        ? window.getComputedStyle(element).transform
        : `translate3d(0, ${previousIndex * height}px, 0)`
    runningAnimations.forEach(animation => animation.cancel())

    const distance = Math.abs(index - previousIndex)
    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion || distance > MAX_ANIMATED_SELECTION_ROWS) return

    element.animate(
      [{ transform: fromTransform }, { transform: `translate3d(0, ${index * height}px, 0)` }],
      {
        duration: SELECTION_ANIMATION_DURATION_MS,
        easing: SELECTION_ANIMATION_EASING,
      }
    )
  }, [height, index])

  return (
    <div
      ref={elementRef}
      aria-hidden="true"
      className="pointer-events-none absolute left-0 right-0 z-0 py-1"
      style={{
        height,
        transform: `translate3d(0, ${index * height}px, 0)`,
        contain: 'layout paint style',
      }}
    >
      <div className="h-full w-full rounded-md bg-primary/18 ring-1 ring-inset ring-primary/55 dark:bg-primary/24 dark:ring-primary/65" />
    </div>
  )
}

export function SearchResultPlaceholder({ top, height }: { top: number; height: number }) {
  return (
    <div
      aria-hidden="true"
      className="absolute left-0 right-0 flex items-center gap-3 py-1 pl-4 pr-5"
      style={{
        height,
        transform: `translate3d(0, ${top}px, 0)`,
        contain: 'layout paint style',
      }}
    >
      <span className="h-7 w-7 shrink-0 rounded bg-muted/60" />
      <span className="min-w-0 flex-1 space-y-2">
        <span className="block h-3 w-2/5 rounded-sm bg-muted/65" />
        <span className="block h-2.5 w-3/5 rounded-sm bg-muted/45" />
      </span>
    </div>
  )
}
