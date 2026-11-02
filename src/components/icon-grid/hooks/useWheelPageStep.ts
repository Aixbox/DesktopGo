import { useRef, type MutableRefObject } from 'react'
import { WHEEL_PAGE_COOLDOWN_MS, WHEEL_PAGE_DELTA_THRESHOLD } from '../constants'

interface WheelPagingParams {
  pageCount: number
  currentPageRef: MutableRefObject<number>
  setCurrentPage: (page: number) => void
  clearEdgeSwitchTimer: () => void
  clearOuterDragInteractionForPageSwitch: () => void
}

/** Manual paging cancels edge alarms before sharing the page-transition lifecycle. */
export function useWheelPageStep(params: WheelPagingParams) {
  const { pageCount, currentPageRef, setCurrentPage } = params
  const wheelDeltaRef = useRef(0)
  const wheelCooldownUntilRef = useRef(0)
  return (primaryDelta: number, isOuterDrag: boolean) => {
    if (pageCount <= 1 || Math.abs(primaryDelta) < 0.1) return
    const now = performance.now()
    if (now < wheelCooldownUntilRef.current) return
    if (
      wheelDeltaRef.current !== 0 &&
      Math.sign(wheelDeltaRef.current) !== Math.sign(primaryDelta)
    ) {
      wheelDeltaRef.current = 0
    }
    wheelDeltaRef.current += primaryDelta
    if (Math.abs(wheelDeltaRef.current) < WHEEL_PAGE_DELTA_THRESHOLD) return

    const direction = wheelDeltaRef.current > 0 ? 1 : -1
    wheelDeltaRef.current = 0
    wheelCooldownUntilRef.current = now + WHEEL_PAGE_COOLDOWN_MS

    const nextPage = Math.max(0, Math.min(currentPageRef.current + direction, pageCount - 1))
    if (nextPage === currentPageRef.current) return
    params.clearEdgeSwitchTimer()

    if (isOuterDrag) {
      params.clearOuterDragInteractionForPageSwitch()
    }

    currentPageRef.current = nextPage
    setCurrentPage(nextPage)
  }
}
