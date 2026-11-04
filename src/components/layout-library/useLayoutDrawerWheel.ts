import { useEffect, useRef } from 'react'

const WHEEL_LINE_HEIGHT = 16

/** 抽屉内的滚轮只浏览横向卡片列表，包括列表两端、空列表和折叠状态。 */
export function useLayoutDrawerWheel() {
  const drawerRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const drawer = drawerRef.current
    if (!drawer) return

    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.defaultPrevented || !event.cancelable) return
      // React 的 wheel 监听是 passive 的，使用原生监听避免默认滚动与手动滚动叠加。
      event.preventDefault()
      const scroller = scrollAreaRef.current
      if (!scroller) return

      const maxScrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth)
      const unit =
        event.deltaMode === 1 ? WHEEL_LINE_HEIGHT : event.deltaMode === 2 ? scroller.clientWidth : 1
      const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX
      scroller.scrollLeft = Math.max(0, Math.min(maxScrollLeft, scroller.scrollLeft + delta * unit))
      // 保留事件冒泡，让悬停缩略图预览仍能在滚轮操作时关闭。
    }

    drawer.addEventListener('wheel', handleWheel, { passive: false })
    return () => drawer.removeEventListener('wheel', handleWheel)
  }, [])

  return { drawerRef, scrollAreaRef }
}
