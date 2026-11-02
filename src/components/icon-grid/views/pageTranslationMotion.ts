import { quarticOut } from '../domain/edgePagingPolicy'

export function readTranslationX(node: HTMLElement): number {
  const transform = getComputedStyle(node).transform
  if (!transform || transform === 'none') return 0
  const values = transform
    .slice(transform.indexOf('(') + 1, -1)
    .split(',')
    .map(Number)
  return values.length === 16 ? values[12] : values[4] || 0
}

export function pageTranslationFrames(
  from: number,
  to: number
): Array<{ offset: number; transform: string }> {
  return Array.from({ length: 61 }, (_, index) => {
    const offset = index / 60
    const x = from + (to - from) * quarticOut(offset)
    return { offset, transform: `translate3d(` + x + 'px, 0, 0)' }
  })
}

/** WAAPI and old WebView fallback share the same non-overshooting curve. */
export function animatePageTranslation(
  node: HTMLElement,
  from: number,
  to: number,
  duration: number,
  opacity?: { from: number; to: number }
) {
  let stopped = false
  let frame: number | null = null
  let animation: Animation | null = null
  let complete: () => void = () => undefined
  const finished = new Promise<void>(resolve => {
    complete = resolve
  })
  const write = (x: number, progress = 0) => {
    if (opacity) node.style.opacity = String(opacity.from + (opacity.to - opacity.from) * progress)
    node.style.transform = 'translate3d(' + x + 'px, 0, 0)'
  }
  const finish = () => {
    if (stopped) return
    stopped = true
    write(to, 1)
    animation?.cancel()
    complete()
  }
  write(from)
  if (duration === 0) finish()
  else if (typeof node.animate === 'function') {
    const frames = pageTranslationFrames(from, to).map(frame =>
      opacity
        ? {
            ...frame,
            opacity: opacity.from + (opacity.to - opacity.from) * quarticOut(frame.offset),
          }
        : frame
    )
    animation = node.animate(frames, {
      duration,
      easing: 'linear',
      fill: 'both',
    })
    void animation.finished.then(finish, () => {
      if (!stopped) finish()
    })
  } else {
    const start = performance.now()
    const step = (now: number) => {
      if (stopped) return
      const t = Math.min(1, (now - start) / duration)
      write(from + (to - from) * quarticOut(t), quarticOut(t))
      if (t >= 1) finish()
      else frame = window.requestAnimationFrame(step)
    }
    frame = window.requestAnimationFrame(step)
  }
  return {
    finished,
    cancel() {
      if (stopped) return
      const x = readTranslationX(node)
      const alpha = opacity ? getComputedStyle(node).opacity : null
      stopped = true
      animation?.cancel()
      if (frame !== null) window.cancelAnimationFrame(frame)
      write(x)
      if (alpha !== null) node.style.opacity = alpha
      complete()
    },
  }
}
