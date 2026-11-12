import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { useReducedMotion } from 'framer-motion'
import { getPageSwipeOffset, type PageSwipeOrigin } from '../domain/pageSwipePolicy'
import { animatePageTranslation } from '../views/pageTranslationMotion'

type Motion = ReturnType<typeof animatePageTranslation>
export interface PageSwipeHandoff extends PageSwipeOrigin {
  toPage: number
  offset: number
}
export interface PageSwipeVisual {
  preview: PageSwipeOrigin | null
  trackRef: RefObject<HTMLDivElement | null>
  takeHandoff: (fromPage: number, toPage: number) => PageSwipeHandoff | null
  setPageTransitioning: (active: boolean) => void
}
interface PreviewRefs {
  trackRef: RefObject<HTMLDivElement | null>
  active: RefObject<PageSwipeOrigin | null>
  offset: RefObject<number>
  bounce: RefObject<Motion | null>
}

function translate(node: HTMLDivElement | null, x: number) {
  if (node) node.style.transform = `translate3d(${x}px, 0, 0)`
}

function cancelPreview(
  refs: PreviewRefs,
  setPreview: (value: null) => void,
  reduced: boolean,
  immediate: boolean
) {
  const { active, bounce, offset, trackRef } = refs
  const previous = bounce.current
  bounce.current = null
  previous?.cancel()
  if (!active.current && !previous) return
  active.current = null
  const node = trackRef.current
  if (immediate || previous || !node || reduced || offset.current === 0) {
    offset.current = 0
    translate(node, 0)
    setPreview(null)
    return
  }
  const motion = animatePageTranslation(node, offset.current, 0, 200)
  bounce.current = motion
  void motion.finished.then(() => {
    if (bounce.current !== motion) return
    bounce.current = null
    offset.current = 0
    setPreview(null)
  })
}

function useSwipeTransitionHandoff() {
  const handoffRef = useRef<PageSwipeHandoff | null>(null)
  const pageTransitionRef = useRef(false)
  const takeHandoff = useCallback((fromPage: number, toPage: number) => {
    const handoff = handoffRef.current
    handoffRef.current = null
    return handoff?.page === fromPage && handoff.toPage === toPage ? handoff : null
  }, [])
  const setPageTransitioning = useCallback((active: boolean) => {
    pageTransitionRef.current = active
  }, [])
  return { handoffRef, pageTransitionRef, takeHandoff, setPageTransitioning }
}

/** Pointer movement writes only a track transform; React renders once when neighbors appear. */
export function usePageSwipePreview(currentPage: number) {
  const reduced = useReducedMotion() ?? false
  const [preview, setPreview] = useState<PageSwipeOrigin | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const active = useRef<PageSwipeOrigin | null>(null)
  const offset = useRef(0)
  const bounce = useRef<Motion | null>(null)
  const { handoffRef, pageTransitionRef, takeHandoff, setPageTransitioning } =
    useSwipeTransitionHandoff()
  const refs = { trackRef, active, offset, bounce }
  const cancel = (immediate = false) => cancelPreview(refs, setPreview, reduced, immediate)

  useLayoutEffect(() => {
    if (!preview) offset.current = 0
    translate(trackRef.current, offset.current)
  }, [preview, currentPage])
  useEffect(
    () => () => {
      bounce.current?.cancel()
      bounce.current = null
      active.current = null
    },
    []
  )

  return {
    visual: { preview, trackRef, takeHandoff, setPageTransitioning } satisfies PageSwipeVisual,
    isAnimating: () => pageTransitionRef.current || bounce.current !== null,
    begin: (origin: PageSwipeOrigin) => {
      cancel(true)
      active.current = origin
      handoffRef.current = null
      offset.current = 0
      setPreview(origin)
    },
    move: (dx: number) => {
      if (!active.current) return
      offset.current = getPageSwipeOffset(active.current, dx)
      translate(trackRef.current, offset.current)
    },
    release: (toPage: number) => {
      const origin = active.current
      if (!origin || toPage === origin.page) return cancel()
      handoffRef.current = { ...origin, toPage, offset: offset.current }
      active.current = null
      setPreview(null)
    },
    cancel,
  }
}
