import { useLayoutEffect, useRef } from 'react'
import { useReducedMotion } from 'framer-motion'
import {
  SELECTION_ANIMATION_EASING,
  isSelectionRowFullyVisible,
  resolveSelectionAnimationDuration,
  shouldAnimateSelectionMove,
} from './selectionHighlightMotion'

const toRowTransform = (index: number, rowHeight: number) =>
  `translate3d(0, ${index * rowHeight}px, 0)`

interface SearchResultSelectionHighlightProps {
  index: number
  rowHeight: number
  scrollTop: number
  viewportHeight: number
}

export function SearchResultSelectionHighlight({
  index,
  rowHeight,
  scrollTop,
  viewportHeight,
}: SearchResultSelectionHighlightProps) {
  const elementRef = useRef<HTMLDivElement | null>(null)
  const previousIndexRef = useRef(index)
  const previousScrollTopRef = useRef(scrollTop)
  const reducedMotion = useReducedMotion()

  useLayoutEffect(() => {
    const element = elementRef.current
    const previousIndex = previousIndexRef.current
    const viewportScrolled = previousScrollTopRef.current !== scrollTop
    previousIndexRef.current = index
    previousScrollTopRef.current = scrollTop
    if (!element || previousIndex === index || typeof element.animate !== 'function') return

    const runningAnimations = element.getAnimations()
    const interrupted = runningAnimations.length > 0
    const fromTransform = interrupted
      ? window.getComputedStyle(element).transform
      : toRowTransform(previousIndex, rowHeight)
    runningAnimations.forEach(animation => animation.cancel())

    const animated = shouldAnimateSelectionMove({
      previousIndex,
      index,
      viewportScrolled,
      rowFullyVisible: isSelectionRowFullyVisible({ index, rowHeight, scrollTop, viewportHeight }),
      reducedMotion: reducedMotion === true,
    })
    if (!animated) return

    element.animate(
      [{ transform: fromTransform }, { transform: toRowTransform(index, rowHeight) }],
      {
        duration: resolveSelectionAnimationDuration({
          distance: Math.abs(index - previousIndex),
          interrupted,
        }),
        easing: SELECTION_ANIMATION_EASING,
      }
    )
  }, [index, reducedMotion, rowHeight, scrollTop, viewportHeight])

  return (
    <div
      ref={elementRef}
      aria-hidden="true"
      className="pointer-events-none absolute left-0 right-0 z-0 py-1"
      style={{
        height: rowHeight,
        transform: toRowTransform(index, rowHeight),
        contain: 'layout paint style',
      }}
    >
      <div className="h-full w-full rounded-md bg-primary/18 ring-1 ring-inset ring-primary/55 dark:bg-primary/24 dark:ring-primary/65" />
    </div>
  )
}
