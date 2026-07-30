import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { getSearchScrollAnchorIndex, type SearchScrollDirection } from './searchScrollSelection'
import { useStableSearchEvent } from './useStableSearchEvent'

const SCROLL_SETTLE_MS = 120

interface SearchScrollSelectionOptions {
  viewportRef: RefObject<HTMLDivElement | null>
  rowHeight: number
  resultCount: number
  selectedIndex: number
  onSelect: (index: number) => void
}

/**
 * Owns how scrolling interacts with the selected row: the selection is re-anchored once the
 * scroll settles instead of on every scroll event, so the highlight never chases the rows,
 * and pointer hovering cannot steal the selection while rows slide under a resting cursor.
 */
export function useSearchScrollSelection({
  viewportRef,
  rowHeight,
  resultCount,
  selectedIndex,
  onSelect,
}: SearchScrollSelectionOptions) {
  const scrollingRef = useRef(false)
  const settleTimerRef = useRef<number | null>(null)
  const directionRef = useRef<SearchScrollDirection>(0)
  const lastScrollTopRef = useRef(0)
  const programmaticScrollRef = useRef(false)
  const skipSelectionScrollRef = useRef(false)
  const selectedIndexRef = useRef(selectedIndex)
  const resultCountRef = useRef(resultCount)

  useLayoutEffect(() => {
    selectedIndexRef.current = selectedIndex
    resultCountRef.current = resultCount
  }, [resultCount, selectedIndex])

  const handleSelect = useStableSearchEvent((index: number) => {
    selectedIndexRef.current = index
    onSelect(index)
  })

  const handleHover = useStableSearchEvent((index: number) => {
    if (scrollingRef.current) return
    selectedIndexRef.current = index
    onSelect(index)
  })

  const anchorSelectionToViewport = useCallback(() => {
    const element = viewportRef.current
    if (!element) return

    if (programmaticScrollRef.current) {
      programmaticScrollRef.current = false
      return
    }

    const anchorIndex = getSearchScrollAnchorIndex({
      direction: directionRef.current,
      scrollTop: element.scrollTop,
      viewportHeight: element.clientHeight,
      rowHeight,
      resultCount: resultCountRef.current,
    })
    if (anchorIndex < 0 || anchorIndex === selectedIndexRef.current) return

    skipSelectionScrollRef.current = true
    handleSelect(anchorIndex)
  }, [handleSelect, rowHeight, viewportRef])

  const markScrollActivity = useCallback(() => {
    const nextScrollTop = viewportRef.current?.scrollTop
    if (nextScrollTop !== undefined && nextScrollTop !== lastScrollTopRef.current) {
      directionRef.current = nextScrollTop > lastScrollTopRef.current ? 1 : -1
      lastScrollTopRef.current = nextScrollTop
    }

    scrollingRef.current = true
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current)
    }
    settleTimerRef.current = window.setTimeout(() => {
      settleTimerRef.current = null
      scrollingRef.current = false
      anchorSelectionToViewport()
    }, SCROLL_SETTLE_MS)
  }, [anchorSelectionToViewport, viewportRef])

  /** Marks a scroll the component performed itself, so it never re-anchors the selection. */
  const beginProgrammaticScroll = useCallback(() => {
    programmaticScrollRef.current = true
  }, [])

  const consumeSelectionScrollSkip = useCallback(() => {
    if (!skipSelectionScrollRef.current) return false

    skipSelectionScrollRef.current = false
    return true
  }, [])

  useEffect(
    () => () => {
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current)
      }
    },
    []
  )

  return {
    handleSelect,
    handleHover,
    markScrollActivity,
    beginProgrammaticScroll,
    consumeSelectionScrollSkip,
  }
}
