import { useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { clampNumber } from '../domain/geometry'
import { getPageCountBySlots, hasTrailingEmptyPage } from '../domain/slots'
import type { DragState } from '../state/types'

interface UseEdgeAutoPagingParams {
  dragEdgeSwitchZone: number
  dragEdgeSwitchMs: number
  containerRef: MutableRefObject<HTMLDivElement | null>
  dragRef: MutableRefObject<DragState | null>
  setDragState: Dispatch<SetStateAction<DragState | null>>
  currentPageRef: MutableRefObject<number>
  setCurrentPage: Dispatch<SetStateAction<number>>
  pageSizeRef: MutableRefObject<number>
}

export type DragEdgeDirection = 'left' | 'right' | null

interface UseEdgeAutoPagingResult {
  clearEdgeSwitchTimer: () => void
  maybeHandleOuterEdgeSwitch: (state: DragState, x: number, y: number) => void
  dragEdgeDirection: DragEdgeDirection
}

export function useEdgeAutoPaging({
  dragEdgeSwitchZone,
  dragEdgeSwitchMs,
  containerRef,
  dragRef,
  setDragState,
  currentPageRef,
  setCurrentPage,
  pageSizeRef,
}: UseEdgeAutoPagingParams): UseEdgeAutoPagingResult {
  const edgeSwitchTimerRef = useRef<number | null>(null)
  const edgeSwitchSignatureRef = useRef<string | null>(null)
  const [dragEdgeDirection, setDragEdgeDirection] = useState<DragEdgeDirection>(null)

  const clearEdgeSwitchTimer = () => {
    if (edgeSwitchTimerRef.current !== null) {
      window.clearTimeout(edgeSwitchTimerRef.current)
      edgeSwitchTimerRef.current = null
    }
    edgeSwitchSignatureRef.current = null
    setDragEdgeDirection(null)
  }

  const scheduleEdgeSwitch = (signature: string, action: () => void) => {
    if (edgeSwitchSignatureRef.current === signature && edgeSwitchTimerRef.current !== null) return
    clearEdgeSwitchTimer()
    edgeSwitchSignatureRef.current = signature
    edgeSwitchTimerRef.current = window.setTimeout(() => {
      edgeSwitchTimerRef.current = null
      edgeSwitchSignatureRef.current = null
      action()
    }, dragEdgeSwitchMs)
  }

  const maybeHandleOuterEdgeSwitch = (state: DragState, x: number, y: number) => {
    if (state.context !== 'outer') {
      clearEdgeSwitchTimer()
      return
    }

    const container = containerRef.current
    if (!container) {
      clearEdgeSwitchTimer()
      return
    }
    const rect = container.getBoundingClientRect()
    if (y < rect.top || y > rect.bottom) {
      clearEdgeSwitchTimer()
      return
    }

    const nearLeft = x <= rect.left + dragEdgeSwitchZone
    const nearRight = x >= rect.right - dragEdgeSwitchZone
    if (!nearLeft && !nearRight) {
      clearEdgeSwitchTimer()
      return
    }

    setDragEdgeDirection(nearLeft ? 'left' : 'right')

    const safePageSize = Math.max(1, pageSizeRef.current)
    const currentPageValue = currentPageRef.current
    const dragPageCount = getPageCountBySlots(state.workingOrder, safePageSize)

    if (nearLeft) {
      if (currentPageValue <= 0) {
        clearEdgeSwitchTimer()
        return
      }
      const targetPage = currentPageValue - 1
      scheduleEdgeSwitch(`left:${targetPage}`, () => {
        const latest = dragRef.current
        if (!latest || latest.context !== 'outer') return
        const maxPage = getPageCountBySlots(latest.workingOrder, Math.max(1, pageSizeRef.current)) - 1
        const nextPage = clampNumber(currentPageRef.current - 1, 0, Math.max(0, maxPage))
        if (nextPage === currentPageRef.current) return
        currentPageRef.current = nextPage
        setCurrentPage(nextPage)
      })
      return
    }

    if (currentPageValue < dragPageCount - 1) {
      const targetPage = currentPageValue + 1
      scheduleEdgeSwitch(`right:${targetPage}`, () => {
        const latest = dragRef.current
        if (!latest || latest.context !== 'outer') return
        const maxPage = getPageCountBySlots(latest.workingOrder, Math.max(1, pageSizeRef.current)) - 1
        const nextPage = clampNumber(currentPageRef.current + 1, 0, Math.max(0, maxPage))
        if (nextPage === currentPageRef.current) return
        currentPageRef.current = nextPage
        setCurrentPage(nextPage)
      })
      return
    }

    const trailingEmpty = hasTrailingEmptyPage(state.workingOrder, safePageSize)
    const lastContentPage = trailingEmpty ? dragPageCount - 2 : dragPageCount - 1
    if (currentPageValue !== lastContentPage || trailingEmpty) {
      clearEdgeSwitchTimer()
      return
    }

    scheduleEdgeSwitch(`right:create:${dragPageCount}`, () => {
      const latest = dragRef.current
      if (!latest || latest.context !== 'outer') return
      const latestPageSize = Math.max(1, pageSizeRef.current)
      const latestPageCount = getPageCountBySlots(latest.workingOrder, latestPageSize)
      if (hasTrailingEmptyPage(latest.workingOrder, latestPageSize)) {
        const nextPage = clampNumber(currentPageRef.current + 1, 0, Math.max(0, latestPageCount - 1))
        if (nextPage !== currentPageRef.current) {
          currentPageRef.current = nextPage
          setCurrentPage(nextPage)
        }
        return
      }

      const expandedOrder = [...latest.workingOrder, ...Array.from({ length: latestPageSize }, () => null)]
      const nextState: DragState = { ...latest, workingOrder: expandedOrder }
      dragRef.current = nextState
      setDragState(nextState)
      const nextPage = clampNumber(
        currentPageRef.current + 1,
        0,
        Math.max(0, getPageCountBySlots(expandedOrder, latestPageSize) - 1)
      )
      currentPageRef.current = nextPage
      setCurrentPage(nextPage)
    })
  }

  return {
    clearEdgeSwitchTimer,
    maybeHandleOuterEdgeSwitch,
    dragEdgeDirection,
  }
}
