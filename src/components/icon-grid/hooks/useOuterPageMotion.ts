import { useLayoutEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { COLOROS_MOTION } from '../constants'
import { EDGE_PAGING } from '../domain/edgePagingPolicy'
import { animatePageTranslation, readTranslationX } from '../views/pageTranslationMotion'
import type { OuterGridPageData } from '../views/OuterGridPageLayer'
import type { EdgePagingControl } from './useEdgeAutoPaging'

type Motion = ReturnType<typeof animatePageTranslation>
interface PageTransition {
  from: OuterGridPageData
  toPage: number
  direction: number
  duration: number
  reveal: boolean
}

export function useOuterPageMotion(
  data: OuterGridPageData,
  width: number,
  edge?: EdgePagingControl
) {
  const reduced = useReducedMotion() ?? false
  const previous = useRef(data)
  const [pageTransition, setPageTransition] = useState<PageTransition | null>(null)
  const oldPageLayerRef = useRef<HTMLDivElement>(null)
  const currentPageLayerRef = useRef<HTMLDivElement>(null)
  const peekLayerRef = useRef<HTMLDivElement>(null)
  const peekMotion = useRef<Motion | null>(null)
  const start = edge?.onTransitionStart
  const end = edge?.onTransitionEnd
  const phase = edge?.state.phase
  const direction = edge?.state.target?.direction

  useLayoutEffect(() => {
    if (previous.current.page !== data.page) {
      const rtl = peekLayerRef.current && getComputedStyle(peekLayerRef.current).direction === 'rtl'
      setPageTransition({
        from: previous.current,
        toPage: data.page,
        reveal: data.dragContext === 'outer',
        duration:
          data.dragContext === 'outer'
            ? EDGE_PAGING.pageDuration
            : COLOROS_MOTION.workspacePageSnapMs,
        direction: (data.page > previous.current.page ? 1 : -1) * (rtl ? -1 : 1),
      })
      start?.(data.page)
    }
    previous.current = data
  }, [data, start])

  useLayoutEffect(() => {
    const node = peekLayerRef.current
    if (!node || phase === 'paging' || pageTransition) return
    peekMotion.current?.cancel()
    const target =
      phase === 'peeking' ? (direction === 'left' ? 1 : -1) * EDGE_PAGING.peekDistance : 0
    peekMotion.current = animatePageTranslation(
      node,
      readTranslationX(node),
      target,
      reduced ? 0 : EDGE_PAGING.peekDuration
    )
    return () => {
      peekMotion.current?.cancel()
    }
  }, [phase, direction, reduced, pageTransition])

  useLayoutEffect(() => {
    if (!pageTransition) return
    const old = oldPageLayerRef.current
    const current = currentPageLayerRef.current
    const peek = peekLayerRef.current
    if (!old || !current || !peek) return
    let cancelled = false
    let completionFrame: number | null = null
    peekMotion.current?.cancel()
    const duration = reduced ? 0 : pageTransition.duration
    const viewport = peek.closest('[data-edge-paging-viewport]')
    const distance = pageTransition.direction * (viewport?.getBoundingClientRect().width || width)
    const motions = [
      animatePageTranslation(old, 0, -distance, duration),
      animatePageTranslation(
        current,
        distance,
        0,
        duration,
        pageTransition.reveal ? { from: 0, to: 1 } : undefined
      ),
      animatePageTranslation(peek, readTranslationX(peek), 0, duration),
    ]
    void Promise.all(motions.map(motion => motion.finished)).then(() => {
      if (cancelled) return
      completionFrame = window.requestAnimationFrame(() => {
        if (cancelled) return
        end?.(pageTransition.toPage)
        setPageTransition(null)
      })
    })
    return () => {
      cancelled = true
      if (completionFrame !== null) window.cancelAnimationFrame(completionFrame)
      motions.forEach(motion => motion.cancel())
    }
  }, [pageTransition, width, reduced, end])

  return { pageTransition, oldPageLayerRef, currentPageLayerRef, peekLayerRef }
}
