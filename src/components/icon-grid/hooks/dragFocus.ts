export interface DragFocusRef {
  current: HTMLElement | null
}

export const captureDragOriginFocus = (target: HTMLElement): HTMLElement | null =>
  target.querySelector<HTMLElement>('button,[role="button"],[tabindex]:not([tabindex="-1"])') ??
  (target.tabIndex >= 0 ? target : null)

export const restoreDragOriginFocus = (focusRef: DragFocusRef): void => {
  const origin = focusRef.current
  focusRef.current = null
  if (origin?.isConnected) origin.focus({ preventScroll: true })
}
