import {
  useEffect,
  useLayoutEffect,
  useEffectEvent,
  useRef,
  type MutableRefObject,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type DragEvent as ReactDragEvent,
} from 'react'
import { DRAG_PENDING_MOVE_TOLERANCE } from '../constants'
import { activateDragPointerCapture, releaseDragPointerCapture } from './dragPointerCapture'

import { getPageSwipeDestination, type PageSwipeOrigin } from '../domain/pageSwipePolicy'
import { usePageSwipePreview } from './usePageSwipePreview'
const EXCLUDED_TARGETS = [
  '[data-dock]',
  '[data-pagination]',
  '[data-focused-item-menu]',
  '[data-item-focus-backdrop]',
  '[data-folder-resize-hit-area]',
  '[role="menu"]',
  '[role="dialog"]',
  'input',
  'textarea',
  'select',
  'a',
  '[contenteditable]:not([contenteditable="false"])',
  'button:not([data-icon]):not([data-folder-preview-key])',
].join(',')

interface MousePageSwipeParams {
  enabled: boolean
  pageCount: number
  currentPage: number
  currentPageRef: MutableRefObject<number>
  setCurrentPage: (page: number) => void
  dragRef: MutableRefObject<unknown>
  clearEdgeSwitchTimer: () => void
}

interface SwipeSession extends PageSwipeOrigin {
  pointerId: number
  startX: number
  startY: number
  lastX: number
  lastTime: number
  velocity: number
  axis: 'pending' | 'horizontal' | 'vertical'
  target: HTMLDivElement
  captureTarget: HTMLDivElement | null
}

interface SwipeRefs {
  session: MutableRefObject<SwipeSession | null>
  suppressClick: MutableRefObject<boolean>
  motion: ReturnType<typeof usePageSwipePreview>
}

function cancelSwipe(refs: SwipeRefs, immediate = false) {
  refs.motion.cancel(immediate)
  const session = refs.session.current
  refs.session.current = null
  releaseDragPointerCapture(session?.captureTarget, session?.pointerId)
}

function moveSwipe(event: PointerEvent, refs: SwipeRefs, params: MousePageSwipeParams) {
  const session = refs.session.current
  if (!session || session.pointerId !== event.pointerId) return
  if (
    !params.enabled ||
    params.dragRef.current ||
    params.currentPageRef.current !== session.page ||
    (event.buttons & 1) === 0
  ) {
    cancelSwipe(refs)
    return
  }
  const dx = event.clientX - session.startX
  const dy = event.clientY - session.startY
  if (session.axis === 'pending') {
    if (Math.hypot(dx, dy) <= DRAG_PENDING_MOVE_TOLERANCE) return
    session.axis = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical'
    refs.suppressClick.current = true
    if (session.axis === 'horizontal') {
      params.clearEdgeSwitchTimer()
      refs.motion.begin(session)
      session.captureTarget = activateDragPointerCapture(session.target, session.pointerId)
    }
  }
  if (session.axis === 'horizontal') {
    recordSwipeVelocity(session, event)
    refs.motion.move(dx)
    event.preventDefault()
  }
}

function recordSwipeVelocity(session: SwipeSession, event: PointerEvent) {
  const elapsed = event.timeStamp - session.lastTime
  if (event.clientX !== session.lastX) {
    session.velocity = elapsed > 0 && elapsed <= 120 ? (event.clientX - session.lastX) / elapsed : 0
    session.lastX = event.clientX
    session.lastTime = event.timeStamp
  } else if (elapsed > 120) session.velocity = 0
}

function finishSwipe(event: PointerEvent, refs: SwipeRefs, params: MousePageSwipeParams) {
  const session = refs.session.current
  if (!session || session.pointerId !== event.pointerId) return
  if (
    !params.enabled ||
    params.dragRef.current ||
    params.currentPageRef.current !== session.page ||
    session.axis !== 'horizontal'
  )
    return cancelSwipe(refs)
  recordSwipeVelocity(session, event)
  const dx = event.clientX - session.startX
  const nextPage = getPageSwipeDestination(
    session,
    dx,
    event.clientY - session.startY,
    session.velocity
  )
  refs.motion.move(dx)
  refs.motion.release(nextPage)
  refs.session.current = null
  releaseDragPointerCapture(session.captureTarget, session.pointerId)
  if (nextPage === session.page) return
  params.clearEdgeSwitchTimer()
  params.currentPageRef.current = nextPage
  params.setCurrentPage(nextPage)
}

function listenForSwipe(
  session: SwipeRefs['session'],
  onMove: (event: PointerEvent) => void,
  onUp: (event: PointerEvent) => void,
  cancel: (immediate?: boolean) => void
) {
  const onBlur = () => cancel()
  const onResize = () => cancel(true)
  const cancelPointer = (event: PointerEvent) => {
    if (session.current?.pointerId === event.pointerId) cancel()
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') cancel()
  }
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') cancel()
  }
  // Capture sees an active item drag before its pointerup handler commits and clears it.
  window.addEventListener('pointermove', onMove, { capture: true, passive: false })
  window.addEventListener('pointerup', onUp, true)
  window.addEventListener('pointercancel', cancelPointer, true)
  window.addEventListener('lostpointercapture', cancelPointer, true)
  window.addEventListener('blur', onBlur)
  window.addEventListener('resize', onResize)
  window.addEventListener('keydown', onKeyDown, true)
  document.addEventListener('visibilitychange', onVisibilityChange)
  return () => {
    cancel(true)
    window.removeEventListener('pointermove', onMove, true)
    window.removeEventListener('pointerup', onUp, true)
    window.removeEventListener('pointercancel', cancelPointer, true)
    window.removeEventListener('lostpointercapture', cancelPointer, true)
    window.removeEventListener('blur', onBlur)
    window.removeEventListener('resize', onResize)
    window.removeEventListener('keydown', onKeyDown, true)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }
}

/** Mouse paging shares the existing page animation; stationary holds still belong to item drag. */
export function useMousePageSwipe(params: MousePageSwipeParams) {
  const session = useRef<SwipeSession | null>(null)
  const suppressClick = useRef(false)
  const motion = usePageSwipePreview(params.currentPage)
  const refs = { session, suppressClick, motion }
  const onMove = useEffectEvent((event: PointerEvent) => moveSwipe(event, refs, params))
  const onUp = useEffectEvent((event: PointerEvent) => finishSwipe(event, refs, params))

  const cancel = useEffectEvent((immediate = false) => cancelSwipe(refs, immediate))
  useEffect(() => listenForSwipe(session, onMove, onUp, cancel), [])

  useLayoutEffect(() => {
    if (
      !params.enabled ||
      params.pageCount <= 1 ||
      (session.current && session.current.page !== params.currentPage)
    )
      cancel(true)
  }, [params.enabled, params.pageCount, params.currentPage])

  return {
    visual: motion.visual,
    handlers: {
      onPointerDownCapture: (event: ReactPointerEvent<HTMLDivElement>) =>
        startSwipe(event, refs, params),
      onClickCapture: (event: ReactMouseEvent<HTMLDivElement>) => {
        if (!suppressClick.current || event.detail === 0) return
        suppressClick.current = false
        event.preventDefault()
        event.stopPropagation()
      },
      onDragStartCapture: (event: ReactDragEvent<HTMLDivElement>) => {
        if (session.current) event.preventDefault()
      },
    },
  }
}

function startSwipe(
  event: ReactPointerEvent<HTMLDivElement>,
  refs: SwipeRefs,
  params: MousePageSwipeParams
) {
  const { motion, session, suppressClick } = refs
  suppressClick.current = false
  if (
    !params.enabled ||
    params.pageCount <= 1 ||
    params.dragRef.current ||
    event.pointerType !== 'mouse' ||
    event.button !== 0 ||
    !event.isPrimary ||
    !(event.target instanceof Element) ||
    event.target.closest(EXCLUDED_TARGETS)
  )
    return
  if (motion.isAnimating()) {
    event.preventDefault()
    event.stopPropagation()
    suppressClick.current = true
    return
  }
  cancelSwipe(refs, true)
  suppressClick.current = false
  session.current = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    page: params.currentPageRef.current,
    pageCount: params.pageCount,
    width: Math.max(1, event.currentTarget.getBoundingClientRect().width),
    lastX: event.clientX,
    lastTime: event.timeStamp,
    velocity: 0,
    direction: getComputedStyle(event.currentTarget).direction === 'rtl' ? -1 : 1,
    axis: 'pending',
    target: event.currentTarget,
    captureTarget: null,
  }
}
