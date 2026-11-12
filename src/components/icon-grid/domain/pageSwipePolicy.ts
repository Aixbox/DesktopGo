export interface PageSwipeOrigin {
  page: number
  pageCount: number
  width: number
  direction: number
}

/** Physical mouse displacement; only the outermost pages resist overscroll. */
export function getPageSwipeOffset(origin: PageSwipeOrigin, dx: number): number {
  const step = -Math.sign(dx) * origin.direction
  const next = origin.page + step
  if (next < 0 || next >= origin.pageCount) {
    return Math.sign(dx) * Math.min(64, Math.abs(dx) * 0.25)
  }
  return Math.max(-origin.width, Math.min(origin.width, dx))
}

export function getPageSwipeDestination(
  origin: PageSwipeOrigin,
  dx: number,
  dy: number,
  velocity: number
): number {
  if (Math.abs(dx) <= Math.abs(dy)) return origin.page
  const flick = Math.abs(velocity) >= 0.5 && Math.abs(dx) >= 16
  if (flick && Math.sign(velocity) !== Math.sign(dx)) return origin.page
  if (Math.abs(dx) < 48 && !flick) return origin.page
  const step = -Math.sign(dx) * origin.direction
  return Math.max(0, Math.min(origin.pageCount - 1, origin.page + step))
}
