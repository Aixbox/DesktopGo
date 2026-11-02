import type { MenuRect } from './focusedItemMenuGeometry'

const SOURCE_SELECTOR =
  '[data-folder-body-hitbox], [data-item-focus-part], [data-item-focus-visual], .icon-image'

/** Copy paint only. Real nodes retain event handlers, focus and pointer capture in the grid. */
function copyPaint(source: Element): Element | null {
  if (source.matches('[data-folder-preview-key][aria-hidden="true"]')) return null
  const style = window.getComputedStyle(source)
  if (style.display === 'none') return null
  const copy = source.cloneNode(false) as HTMLElement | SVGElement
  for (const name of source.getAttributeNames()) {
    if (name === 'id' || name.startsWith('data-')) copy.removeAttribute(name)
  }
  for (let index = 0; index < style.length; index++) {
    const name = style.item(index)
    copy.style.setProperty(name, style.getPropertyValue(name), 'important')
  }
  for (const name of ['animation', 'transition', 'pointer-events']) {
    copy.style.setProperty(name, 'none', 'important')
  }
  for (const child of source.childNodes) {
    const cloned = child.nodeType === 1 ? copyPaint(child as Element) : child.cloneNode(false)
    if (cloned) copy.appendChild(cloned)
  }
  return copy
}

/** Root transforms are already reflected in the viewport rect; descendants keep their transforms. */
export function focusMirrorLayout(rect: MenuRect, size: { width: number; height: number }) {
  return {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${size.width}px`,
    height: `${size.height}px`,
    transform: `scale(${rect.width / size.width}, ${rect.height / size.height})`,
    transformOrigin: 'top left',
  }
}

function mirrorPaint(source: HTMLElement | SVGElement) {
  const copy = copyPaint(source) as HTMLElement | SVGElement | null
  if (!copy) return null
  const rect = source.getBoundingClientRect()
  const style = window.getComputedStyle(source)
  const width = Number.parseFloat(style.width) || rect.width
  const height = Number.parseFloat(style.height) || rect.height
  if (width <= 0 || height <= 0) return null
  for (const [name, value] of Object.entries({
    position: 'relative',
    left: '0px',
    top: '0px',
    right: 'auto',
    bottom: 'auto',
    margin: '0px',
    transform: 'none',
    translate: 'none',
    rotate: 'none',
    scale: 'none',
    width: `${width}px`,
    height: `${height}px`,
  }))
    copy.style.setProperty(name, value, 'important')
  const wrapper = document.createElement('div')
  Object.assign(wrapper.style, focusMirrorLayout(rect, { width, height }), {
    position: 'fixed',
    pointerEvents: 'none',
    overflow: 'visible',
  })
  wrapper.appendChild(copy)
  return wrapper
}

/** Lift just artwork/outline above the blur, then restore the exact sources on dismissal. */
export function mountFocusedItemForeground(target: HTMLElement, container: HTMLElement) {
  const candidates = Array.from(target.querySelectorAll<HTMLElement | SVGElement>(SOURCE_SELECTOR))
  const sources = candidates.filter(
    source => !candidates.some(parent => parent !== source && parent.contains(source))
  )
  if (!sources.length) sources.push(target)
  const restores: Array<() => void> = []
  for (const source of sources) {
    const mirror = mirrorPaint(source)
    if (!mirror) continue
    const opacity = source.style.getPropertyValue('opacity')
    const priority = source.style.getPropertyPriority('opacity')
    const transition = source.style.getPropertyValue('transition')
    const transitionPriority = source.style.getPropertyPriority('transition')
    // Do not leave the original in the blur's sampling input: that creates a soft halo around it.
    source.style.setProperty('transition', 'none', 'important')
    source.style.setProperty('opacity', '0', 'important')
    container.appendChild(mirror)
    restores.push(() => {
      if (opacity) source.style.setProperty('opacity', opacity, priority)
      else source.style.removeProperty('opacity')
      // Restore paint before enabling hover transitions, avoiding a fade-in after the mirror leaves.
      source.getBoundingClientRect()
      if (transition) source.style.setProperty('transition', transition, transitionPriority)
      else source.style.removeProperty('transition')
      mirror.remove()
    })
  }
  return () => restores.forEach(restore => restore())
}
