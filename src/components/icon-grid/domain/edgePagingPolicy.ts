import { getPageCountBySlots, hasTrailingEmptyPage } from './slots'

export const EDGE_PAGING = {
  zone: 22,
  tipDelay: 40,
  dwell: 400,
  retargetDwell: 200,
  peekDistance: 60,
  peekDuration: 360,
  pageDuration: 550,
  backgroundDuration: 450,
  backgroundOpacity: 0.2,
  radius: 28,
  exposureRatio: 0.034,
} as const

export type EdgeDirection = 'left' | 'right'
export interface EdgeTarget {
  session: string
  fromPage: number
  toPage: number
  direction: EdgeDirection
  createPage: boolean
}
export interface EdgePagingState {
  phase: 'idle' | 'pending' | 'peeking' | 'paging'
  target: EdgeTarget | null
}
export const IDLE_EDGE_STATE: EdgePagingState = { phase: 'idle', target: null }

export function getEdgePageTarget({
  direction,
  rtl,
  page,
  order,
  pageSize,
}: {
  direction: EdgeDirection
  rtl: boolean
  page: number
  order: Array<string | null>
  pageSize: number
}): { toPage: number; createPage: boolean } | null {
  const step = (direction === 'right' ? 1 : -1) * (rtl ? -1 : 1)
  const toPage = page + step
  const count = getPageCountBySlots(order, pageSize)
  if (toPage < 0 || toPage > count) return null
  if (toPage < count) return { toPage, createPage: false }
  if (hasTrailingEmptyPage(order, pageSize)) return null
  return { toPage, createPage: true }
}

/** The exposed neighbouring surface plus its 22 logical-pixel hit extension. */
export function resolveEdgeDirection({
  rect,
  pointer,
  centerX,
  previous = null,
}: {
  rect: { left: number; right: number; top: number; bottom: number }
  pointer: { x: number; y: number }
  centerX: number
  previous?: EdgeDirection | null
}): EdgeDirection | null {
  if (
    pointer.x < rect.left ||
    pointer.x > rect.right ||
    pointer.y < rect.top ||
    pointer.y > rect.bottom
  )
    return null
  const width = rect.right - rect.left
  const band = Math.min(width / 3, width * EDGE_PAGING.exposureRatio + EDGE_PAGING.zone)
  // Returning to the original page is tested with the touch point, not the ghost.
  if (previous && pointer.x > rect.left + band && pointer.x < rect.right - band) return null
  const left = Math.min(pointer.x, centerX) <= rect.left + band
  const right = Math.max(pointer.x, centerX) >= rect.right - band
  if (left && right) return pointer.x < (rect.left + rect.right) / 2 ? 'left' : 'right'
  return left ? 'left' : right ? 'right' : null
}

export const quarticOut = (progress: number) => 1 - (1 - Math.max(0, Math.min(1, progress))) ** 4

export function sameEdgeTarget(a: EdgeTarget | null, b: EdgeTarget | null): boolean {
  return (
    a !== null &&
    b !== null &&
    a.session === b.session &&
    a.fromPage === b.fromPage &&
    a.toPage === b.toPage &&
    a.direction === b.direction &&
    a.createPage === b.createPage
  )
}
