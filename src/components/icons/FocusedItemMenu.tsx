import {
  useCallback,
  useLayoutEffect,
  useState,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react'
import { Slot } from '@radix-ui/react-slot'
import { Menu, MenuAnchor, MenuContent } from '../ui/menu'
import { FocusedItemMenuContext } from './focusedItemMenuContext'
import { useFocusedItemMenu } from './useFocusedItemMenu'
import { FocusedItemPresentation } from './FocusedItemPresentation'
import { ITEM_MENU_GAP, placeItemMenu } from './focusedItemMenuGeometry'

interface FocusedItemMenuProps {
  trigger: ReactElement
  children: ReactNode
  disabled?: boolean
  width?: number
  label?: string
  onOpen?: () => void
  onContextMenuCapture?: (event: MouseEvent<HTMLElement>) => void
}
type FocusController = ReturnType<typeof useFocusedItemMenu>

export function FocusedItemMenu({
  trigger,
  children,
  disabled = false,
  width = 224,
  label,
  onOpen,
  onContextMenuCapture,
}: FocusedItemMenuProps) {
  const focus = useFocusedItemMenu(disabled, onOpen)
  return (
    <Menu
      open={focus.open}
      modal={false}
      dir={focus.snapshot?.direction}
      onOpenChange={open => {
        if (!open) focus.close()
      }}
    >
      <FocusedItemMenuContext.Provider value={{ focused: focus.open, dismiss: focus.close }}>
        <MenuAnchor asChild>
          <Slot
            ref={focus.targetRef}
            data-app-context-menu-trigger="true"
            data-item-menu-focused={focus.open ? 'true' : undefined}
            onContextMenuCapture={onContextMenuCapture}
            onContextMenu={focus.onContextMenu}
            onKeyDown={focus.onKeyDown}
            onPointerDownCapture={event => {
              // Capture can flush before the handle receives pointerdown. Let the
              // resize handler establish its session before it dismisses this menu.
              const resizeHandle = (event.target as Element | null)?.closest?.(
                '[data-folder-resize-hit-area]'
              )
              if (event.button === 0 && !resizeHandle) focus.close()
            }}
          >
            {trigger}
          </Slot>
        </MenuAnchor>
        {focus.open && focus.snapshot ? (
          <>
            <FocusedItemPresentation targetRef={focus.targetRef} {...focus.snapshot} />
            <FocusedMenuContent focus={focus} width={width} label={label}>
              {children}
            </FocusedMenuContent>
          </>
        ) : null}
      </FocusedItemMenuContext.Provider>
    </Menu>
  )
}

function useMeasuredMenu(focus: FocusController) {
  const [height, setHeight] = useState(320)
  const [node, setNode] = useState<HTMLDivElement | null>(null)
  const bindContent = useCallback(
    (element: HTMLDivElement | null) => {
      focus.contentRef.current = element
      setNode(element)
    },
    [focus.contentRef]
  )
  useLayoutEffect(() => {
    if (!node) return
    const measure = () => setHeight(node.scrollHeight + node.offsetHeight - node.clientHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [node])
  return { height, bindContent }
}

function FocusedMenuContent({
  focus,
  width,
  label,
  children,
}: {
  focus: FocusController
  width: number
  label?: string
  children: ReactNode
}) {
  const { height, bindContent } = useMeasuredMenu(focus)
  if (!focus.snapshot) return null
  const placement = placeItemMenu(focus.snapshot.item, focus.snapshot.viewport, { width, height })
  return (
    <MenuContent
      ref={bindContent}
      aria-label={label}
      data-focused-item-menu
      side={placement.side}
      sideOffset={ITEM_MENU_GAP}
      align={
        focus.snapshot.direction === 'rtl' && ['top', 'bottom'].includes(placement.side)
          ? 'end'
          : 'start'
      }
      alignOffset={placement.alignOffset}
      avoidCollisions={false}
      className="z-[282] min-w-0 p-1.5 shadow-xl"
      style={{ width: placement.width, maxHeight: placement.height }}
      onContextMenu={event => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onPointerDown={event => event.stopPropagation()}
      onClick={event => event.stopPropagation()}
      onKeyDown={event => event.stopPropagation()}
      onInteractOutside={event => {
        // The backdrop consumes dismissal clicks; the real tile remains an interactive resize/drag target.
        if (
          focus.targetRef.current?.contains(event.target as Node) ||
          (event.target as Element)?.closest('[data-item-focus-backdrop]')
        )
          event.preventDefault()
      }}
      onCloseAutoFocus={event => {
        event.preventDefault()
        if (focus.restoreFocusRef.current) focus.targetRef.current?.focus({ preventScroll: true })
      }}
    >
      {children}
    </MenuContent>
  )
}
