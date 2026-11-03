import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react'
import type { FocusedItemVisual, MenuRect } from './focusedItemMenuGeometry'
import { isFocusTargetInteraction, readFocusedItemVisual } from './focusedItemVisual'

interface FocusSnapshot {
  item: MenuRect
  visual: FocusedItemVisual
  viewport: MenuRect
  direction: 'ltr' | 'rtl'
}

export function useFocusedItemMenu(disabled: boolean, onOpen?: () => void) {
  const menuId = useId()
  const targetRef = useRef<HTMLElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const restoreFocusRef = useRef(false)
  const [snapshot, setSnapshot] = useState<FocusSnapshot | null>(null)
  const open = snapshot !== null && !disabled
  const close = useCallback((restoreFocus = false) => {
    restoreFocusRef.current = restoreFocus
    setSnapshot(null)
  }, [])
  useEffect(() => {
    if (disabled) close()
  }, [disabled, close])
  const show = () => {
    const target = targetRef.current
    if (disabled || !target) return
    const viewport = document.getElementById('root')?.getBoundingClientRect() ?? {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    }
    const direction = window.getComputedStyle(target).direction === 'rtl' ? 'rtl' : 'ltr'
    setSnapshot({
      item: target.getBoundingClientRect(),
      visual: readFocusedItemVisual(target),
      viewport,
      direction,
    })
    onOpen?.()
  }
  useFocusedMenuDismissal(open ? snapshot?.visual : undefined, targetRef, contentRef, close, menuId)
  const onContextMenu = (event: MouseEvent<HTMLElement>) => {
    if (event.defaultPrevented) return
    event.preventDefault()
    event.stopPropagation()
    show()
  }
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return
    event.preventDefault()
    event.stopPropagation()
    show()
  }
  return {
    targetRef,
    contentRef,
    restoreFocusRef,
    snapshot,
    open,
    close,
    onContextMenu,
    onKeyDown,
    menuId,
  }
}

function useFocusedMenuDismissal(
  visual: FocusedItemVisual | undefined,
  targetRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLDivElement | null>,
  close: (restoreFocus?: boolean) => void,
  menuId: string
) {
  useEffect(() => {
    if (!visual) return
    const dismiss = () => close()
    const isOwnedSubmenu = (target: EventTarget | null) =>
      (target as Element | null)
        ?.closest?.('[data-focused-menu-owner]')
        ?.getAttribute('data-focused-menu-owner') === menuId
    const isMenuContent = (target: EventTarget | null) =>
      contentRef.current?.contains(target as Node) || isOwnedSubmenu(target)
    const isOutside = (event: Event) =>
      !isFocusTargetInteraction(event, targetRef.current, visual) && !isMenuContent(event.target)
    const consumeOutside = (event: Event) => {
      if (!isOutside(event)) return
      event.preventDefault()
      event.stopPropagation()
    }
    const dismissOutside = (event: Event) => {
      if (!isOutside(event)) return
      consumeOutside(event)
      close(true)
    }
    const handleScroll = (event: Event) => {
      if (!isMenuContent(event.target)) close()
    }
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // Let Radix handle Escape for the active submenu.
      if (isOwnedSubmenu(event.target)) return
      event.preventDefault()
      event.stopPropagation()
      close(true)
    }
    window.addEventListener('keydown', handleKey, true)
    window.addEventListener('blur', dismiss)
    window.addEventListener('resize', dismiss)
    document.addEventListener('scroll', handleScroll, true)
    document.addEventListener('pointerdown', consumeOutside, true)
    document.addEventListener('click', dismissOutside, true)
    document.addEventListener('contextmenu', dismissOutside, true)
    document.addEventListener('wheel', consumeOutside, { capture: true, passive: false })
    return () => {
      window.removeEventListener('keydown', handleKey, true)
      window.removeEventListener('blur', dismiss)
      window.removeEventListener('resize', dismiss)
      document.removeEventListener('scroll', handleScroll, true)
      document.removeEventListener('pointerdown', consumeOutside, true)
      document.removeEventListener('click', dismissOutside, true)
      document.removeEventListener('contextmenu', dismissOutside, true)
      document.removeEventListener('wheel', consumeOutside, true)
    }
  }, [visual, close, targetRef, contentRef, menuId])
}
