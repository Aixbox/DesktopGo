import { useLayoutEffect, useMemo, useRef, useState, type SVGProps, type RefObject } from 'react'
import { useReducedMotion } from 'framer-motion'
import { getRoundedRectContour } from '../../../lib/roundedRectContour'
import { EDGE_PAGING, getEdgePageTarget } from '../domain/edgePagingPolicy'
import type { DragState } from '../state/types'
import { animatePageTranslation, readTranslationX } from './pageTranslationMotion'
import type { EdgePagingControl } from '../hooks/useEdgeAutoPaging'

interface EdgePageHintsProps {
  drag: DragState | null
  page: number
  pageSize: number
  containerRef: RefObject<HTMLDivElement | null>
  folderOpen: boolean
  paging: EdgePagingControl
}

export function EdgePageHints({
  drag,
  page,
  pageSize,
  containerRef,
  folderOpen,
  paging,
}: EdgePageHintsProps) {
  const reduced = useReducedMotion() ?? false
  const [geometry, setGeometry] = useState({ width: 0, height: 0, top: 0, rtl: false })
  useLayoutEffect(() => {
    const content = containerRef.current
    const viewport = content?.closest<HTMLElement>('[data-edge-paging-viewport]')
    if (!content || !viewport) return
    const update = () => {
      const outer = viewport.getBoundingClientRect()
      const inner = content.getBoundingClientRect()
      setGeometry({
        width: outer.width,
        height: inner.height,
        top: inner.top - outer.top,
        rtl: getComputedStyle(viewport).direction === 'rtl',
      })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(viewport)
    observer.observe(content)
    return () => observer.disconnect()
  }, [containerRef])
  const { width, height, top, rtl } = geometry
  const visible = drag?.context === 'outer' && !folderOpen
  const target = paging.state.target
  const inTransition = paging.state.phase === 'paging'
  const points = useMemo(
    () =>
      getRoundedRectContour({ width, height, radius: EDGE_PAGING.radius, exponent: 4 })
        .map(point => point.x + ',' + point.y)
        .join(' '),
    [width, height]
  )
  return (
    <div
      aria-hidden="true"
      data-edge-page-hints
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {(['left', 'right'] as const).map(direction => {
        const available =
          !!drag &&
          !!getEdgePageTarget({
            direction,
            rtl,
            page: inTransition && target ? target.fromPage : page,
            order: drag.workingOrder,
            pageSize,
          })
        const peeking =
          paging.state.phase === 'peeking' && paging.state.target?.direction === direction
        const entering = inTransition && target?.direction === direction
        const exposure = entering
          ? width
          : width * EDGE_PAGING.exposureRatio + (peeking ? EDGE_PAGING.peekDistance : 0)
        return (
          <HintSurface
            key={direction}
            direction={direction}
            exposure={exposure}
            reduced={reduced}
            entering={entering}
            visible={visible && available && (!inTransition || entering)}
            data-edge-page-hint={direction}
            width={width}
            height={height}
            className="absolute"
            style={{
              top,
              left: direction === 'left' ? -width : width,
              color: 'var(--edge-page-color)',
            }}
          >
            <polygon points={points} fill="currentColor" />
          </HintSurface>
        )
      })}
    </div>
  )
}

/** A wrapper keeps hint motion on the same quartic curve as the page preview. */
function HintSurface({
  direction,
  exposure,
  reduced,
  entering,
  visible,
  children,
  ...props
}: SVGProps<SVGSVGElement> & {
  direction: 'left' | 'right'
  exposure: number
  reduced: boolean
  entering: boolean
  visible: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const initialized = useRef(false)
  const wasEntering = useRef(false)
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const to = direction === 'left' ? exposure : -exposure
    const resetPosition = wasEntering.current && !entering
    wasEntering.current = entering
    const alpha = Number(getComputedStyle(node).opacity)
    node.style.transition =
      reduced || entering ? 'none' : 'opacity 450ms cubic-bezier(0.17, 0, 0.83, 1)'
    if (!entering) node.style.opacity = String(visible ? EDGE_PAGING.backgroundOpacity : 0)
    const motion = animatePageTranslation(
      node,
      initialized.current && !resetPosition ? readTranslationX(node) : to,
      to,
      reduced || !initialized.current || resetPosition
        ? 0
        : entering
          ? EDGE_PAGING.pageDuration
          : EDGE_PAGING.peekDuration,
      entering ? { from: visible ? alpha : 0, to: 0 } : undefined
    )
    initialized.current = true
    return () => motion.cancel()
  }, [direction, exposure, reduced, entering, visible])
  return (
    <div ref={ref} style={{ opacity: 0 }}>
      <svg {...props}>{children}</svg>
    </div>
  )
}
