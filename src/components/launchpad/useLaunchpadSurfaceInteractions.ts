import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { WindowMode } from '@/types'

const LONG_PRESS_MS = 420
const SEARCH_FLOATING_MENU_SELECTOR = '[data-search-floating-menu="true"]'

interface MarqueeState {
  startX: number
  startY: number
  currentX: number
  currentY: number
}

interface UseLaunchpadSurfaceInteractionsParams {
  selectionMode: boolean
  selectedIconKeys: string[]
  setSelectedIconKeys: (keys: string[]) => void
  clearSelection: () => void
  enterSelectionMode: () => void
  isAiOrganizeMode: boolean
  hasSearchKeyword: boolean
  isSearchPanelOpen: boolean
  closeSearchPanel: () => void
  windowMode: WindowMode
  windowPersistentEnabled: boolean
  isBackgroundCloseSuppressed: () => boolean
  requestCloseLaunchpad: () => void
}

export function useLaunchpadSurfaceInteractions({
  selectionMode,
  selectedIconKeys,
  setSelectedIconKeys,
  clearSelection,
  enterSelectionMode,
  isAiOrganizeMode,
  hasSearchKeyword,
  isSearchPanelOpen,
  closeSearchPanel,
  windowMode,
  windowPersistentEnabled,
  isBackgroundCloseSuppressed,
  requestCloseLaunchpad,
}: UseLaunchpadSurfaceInteractionsParams) {
  const longPressTimerRef = useRef<number | null>(null)
  const longPressTriggeredRef = useRef(false)
  const backgroundPointerStartedRef = useRef(false)
  const marqueeJustEndedRef = useRef(false)
  const marqueeStateRef = useRef<{
    initialKeys: Set<string>
    additive: boolean
    active: boolean
    pointerId: number
    startX: number
    startY: number
  } | null>(null)
  const [marquee, setMarquee] = useState<MarqueeState | null>(null)

  const clearBackgroundLongPressTimer = () => {
    if (longPressTimerRef.current === null) return
    window.clearTimeout(longPressTimerRef.current)
    longPressTimerRef.current = null
  }

  const isBackgroundInteraction = (target: HTMLElement) =>
    !target.closest('[data-icon]') &&
    !target.closest('[data-dock]') &&
    !target.closest('[data-dock-menu="true"]') &&
    !target.closest('[data-search-placeholder]') &&
    !target.closest(SEARCH_FLOATING_MENU_SELECTOR) &&
    !target.closest('[data-pagination]') &&
    !target.closest('[data-grid-mode-nav]') &&
    !target.closest('[data-selection-toolbar]') &&
    !target.closest('[data-ai-organize-toolbar]') &&
    !target.closest('[data-ai-organize-sidebar]')

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const state = marqueeStateRef.current
      if (!state?.active || state.pointerId !== event.pointerId) return
      setMarquee(previous => {
        if (!previous) return previous
        if (previous.currentX === event.clientX && previous.currentY === event.clientY) {
          return previous
        }
        return { ...previous, currentX: event.clientX, currentY: event.clientY }
      })
    }
    const handlePointerUp = (event: PointerEvent) => {
      const state = marqueeStateRef.current
      if (!state?.active || state.pointerId !== event.pointerId) return
      state.active = false
      const moved =
        Math.abs(event.clientX - state.startX) > 2 || Math.abs(event.clientY - state.startY) > 2
      marqueeStateRef.current = null
      if (moved) {
        marqueeJustEndedRef.current = true
        window.setTimeout(() => {
          marqueeJustEndedRef.current = false
        }, 60)
      }
      setMarquee(null)
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [])

  useEffect(() => {
    const state = marqueeStateRef.current
    if (!state || !marquee) return
    const left = Math.min(marquee.startX, marquee.currentX)
    const right = Math.max(marquee.startX, marquee.currentX)
    const top = Math.min(marquee.startY, marquee.currentY)
    const bottom = Math.max(marquee.startY, marquee.currentY)
    const hits: string[] = []
    document.querySelectorAll<HTMLElement>('[data-selection-key]').forEach(node => {
      const key = node.getAttribute('data-selection-key')
      if (!key) return
      const rect = node.getBoundingClientRect()
      if (rect.right < left || rect.left > right || rect.bottom < top || rect.top > bottom) return
      hits.push(key)
    })
    const nextKeys = state.additive
      ? Array.from(new Set([...state.initialKeys, ...hits]))
      : Array.from(new Set(hits))
    setSelectedIconKeys(nextKeys)
  }, [marquee, setSelectedIconKeys])

  useEffect(
    () => () => {
      clearBackgroundLongPressTimer()
    },
    []
  )

  const handleBackgroundPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    const startedOnBackground = isBackgroundInteraction(target)
    backgroundPointerStartedRef.current = event.button === 0 && startedOnBackground
    if (selectionMode && event.button === 0 && startedOnBackground) {
      marqueeStateRef.current = {
        initialKeys: new Set(selectedIconKeys),
        additive: event.ctrlKey || event.shiftKey,
        active: true,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
      }
      setMarquee({
        startX: event.clientX,
        startY: event.clientY,
        currentX: event.clientX,
        currentY: event.clientY,
      })
      return
    }
    if (isAiOrganizeMode || selectionMode || event.button !== 0 || hasSearchKeyword) return
    if (!startedOnBackground) return
    longPressTriggeredRef.current = false
    clearBackgroundLongPressTimer()
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true
      enterSelectionMode()
    }, LONG_PRESS_MS)
  }

  const handleBackgroundClick = (event: ReactMouseEvent) => {
    if (marqueeJustEndedRef.current) {
      marqueeJustEndedRef.current = false
      backgroundPointerStartedRef.current = false
      return
    }
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false
      backgroundPointerStartedRef.current = false
      return
    }
    const target = event.target as HTMLElement
    const isTrueBackgroundClick =
      backgroundPointerStartedRef.current && isBackgroundInteraction(target)
    backgroundPointerStartedRef.current = false
    const clickedOutsideSearch =
      !target.closest('[data-search-placeholder]') &&
      !target.closest(SEARCH_FLOATING_MENU_SELECTOR) &&
      !target.closest('[data-dock-menu="true"]')
    if (isSearchPanelOpen && clickedOutsideSearch && isTrueBackgroundClick) {
      closeSearchPanel()
      return
    }
    if (selectionMode) {
      if (isTrueBackgroundClick) clearSelection()
      return
    }
    if (isAiOrganizeMode) return
    if (
      windowMode === 'fullscreen' &&
      !hasSearchKeyword &&
      !windowPersistentEnabled &&
      isTrueBackgroundClick &&
      !isBackgroundCloseSuppressed()
    ) {
      requestCloseLaunchpad()
    }
  }

  const handleSurfacePointerDownCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isSearchPanelOpen) return
    const target = event.target as HTMLElement | null
    const isSearchInteraction =
      !!target?.closest('[data-search-placeholder]') ||
      !!target?.closest(SEARCH_FLOATING_MENU_SELECTOR) ||
      !!target?.closest('[data-dock-menu="true"]')
    if (!isSearchInteraction) closeSearchPanel()
  }

  return {
    handleBackgroundClick,
    handleBackgroundPointerCancel: () => {
      clearBackgroundLongPressTimer()
      backgroundPointerStartedRef.current = false
    },
    handleBackgroundPointerDown,
    handleBackgroundPointerLeave: clearBackgroundLongPressTimer,
    handleBackgroundPointerUp: clearBackgroundLongPressTimer,
    handleSurfacePointerDownCapture,
    marquee,
  }
}
