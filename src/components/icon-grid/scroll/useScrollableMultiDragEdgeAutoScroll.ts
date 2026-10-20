import { useCallback, useEffect, useLayoutEffect, useRef, type MutableRefObject } from 'react'
import type { DragState } from '../state/types'
import { resolveVerticalEdgeScrollSpeed } from './scrollEdgeAutoScrollPolicy'

interface UseScrollableMultiDragEdgeAutoScrollParams {
  enabled: boolean
  containerRef: MutableRefObject<HTMLDivElement | null>
  dragRef: MutableRefObject<DragState | null>
  onScrolled: (pointerId: number, x: number, y: number) => void
}

export function useScrollableMultiDragEdgeAutoScroll({
  enabled,
  containerRef,
  dragRef,
  onScrolled,
}: UseScrollableMultiDragEdgeAutoScrollParams) {
  const frameRef = useRef<number | null>(null)
  const speedRef = useRef(0)
  const pointerRef = useRef<{ pointerId: number; x: number; y: number } | null>(null)
  const onScrolledRef = useRef(onScrolled)

  useLayoutEffect(() => {
    onScrolledRef.current = onScrolled
  }, [onScrolled])

  const stop = useCallback(() => {
    speedRef.current = 0
    pointerRef.current = null
    if (frameRef.current === null) return
    window.cancelAnimationFrame(frameRef.current)
    frameRef.current = null
  }, [])

  const update = useCallback(
    (pointerId: number, x: number, y: number) => {
      const state = dragRef.current
      const container = containerRef.current
      if (
        !enabled ||
        state?.context !== 'outer' ||
        state.pointerId !== pointerId ||
        state.draggingIds.length <= 1 ||
        !container ||
        container.scrollHeight <= container.clientHeight
      ) {
        stop()
        return
      }

      const bounds = container.getBoundingClientRect()
      const speed = resolveVerticalEdgeScrollSpeed(y, bounds.top, bounds.bottom)
      if (speed === 0) {
        stop()
        return
      }

      pointerRef.current = { pointerId, x, y }
      speedRef.current = speed
      if (frameRef.current !== null) return

      const step = () => {
        frameRef.current = null
        const latestPointer = pointerRef.current
        const latestState = dragRef.current
        const scrollContainer = containerRef.current
        if (
          !enabled ||
          latestState?.context !== 'outer' ||
          latestState.draggingIds.length <= 1 ||
          latestState.pointerId !== latestPointer?.pointerId ||
          !scrollContainer ||
          scrollContainer.scrollHeight <= scrollContainer.clientHeight
        ) {
          stop()
          return
        }

        const previousScrollTop = scrollContainer.scrollTop
        scrollContainer.scrollTop += speedRef.current
        if (scrollContainer.scrollTop === previousScrollTop) {
          stop()
          return
        }

        onScrolledRef.current(latestPointer.pointerId, latestPointer.x, latestPointer.y)
        frameRef.current = window.requestAnimationFrame(step)
      }

      frameRef.current = window.requestAnimationFrame(step)
    },
    [containerRef, dragRef, enabled, stop]
  )

  useEffect(() => stop, [stop])

  return { stop, update }
}
