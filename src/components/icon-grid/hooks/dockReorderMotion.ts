import { MOTION_SPRING_EASING } from '../constants'
import { getReorderAnimationDuration, readCurrentTranslate } from './reorderMotion'

export interface DockReorderPose {
  id: string
  node: HTMLElement
  x: number
  y: number
}
interface RunningMotion {
  cancel: () => void
}

/** Owns only dock item transforms; container growth and scrolling remain independent. */
export function createDockReorderMotion() {
  let previous = new Map<string, DockReorderPose>()
  const running = new Map<string, RunningMotion>()
  const stop = (id: string) => {
    const motion = running.get(id)
    running.delete(id)
    motion?.cancel()
  }
  return {
    update(poses: DockReorderPose[], reduced: boolean, referenceDistance: number) {
      const next = new Map(poses.map(pose => [pose.id, pose]))
      running.forEach((_, id) => {
        if (reduced || !next.has(id) || next.get(id)?.node !== previous.get(id)?.node) stop(id)
      })
      poses.forEach(pose => {
        const before = previous.get(pose.id)
        if (reduced || !before || before.node !== pose.node) return
        const dx = before.x - pose.x
        const dy = before.y - pose.y
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return
        const current = readCurrentTranslate(pose.node)
        stop(pose.id)
        const x = dx + current.x,
          y = dy + current.y
        if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) return
        const complete = () => {
          if (running.get(pose.id) !== motion) return
          running.delete(pose.id)
          motion.cancel()
        }
        const motion = animateDockItem(pose.node, { x, y }, referenceDistance, complete)
        running.set(pose.id, motion)
      })
      previous = next
    },
    dispose() {
      running.forEach((_, id) => stop(id))
      previous.clear()
    },
  }
}

function animateDockItem(
  node: HTMLElement,
  delta: { x: number; y: number },
  referenceDistance: number,
  complete: () => void
): RunningMotion {
  const duration = getReorderAnimationDuration(delta.x, delta.y, referenceDistance)
  const from = 'translate3d(' + delta.x + 'px,' + delta.y + 'px,0)'
  const to = 'translate3d(0px,0px,0)'
  const savedWillChange = node.style.willChange
  node.style.willChange = 'transform'
  if (typeof node.animate === 'function') {
    const animation = node.animate([{ transform: from }, { transform: to }], {
      duration,
      easing: MOTION_SPRING_EASING,
      fill: 'both',
    })
    animation.onfinish = complete
    return {
      cancel() {
        animation.cancel()
        node.style.willChange = savedWillChange
      },
    }
  }
  const savedTransition = node.style.transition
  const savedTransform = node.style.transform
  node.style.transition = 'none'
  node.style.transform = from
  void node.offsetWidth
  node.style.transition = 'transform ' + duration + 'ms ' + MOTION_SPRING_EASING
  node.style.transform = to
  const timer = window.setTimeout(complete, duration + 40)
  return {
    cancel() {
      window.clearTimeout(timer)
      node.style.transition = savedTransition
      node.style.transform = savedTransform
      node.style.willChange = savedWillChange
    },
  }
}

/** Measure stable slots relative to their grid, excluding item motion and shared scrolling. */
export function readDockReorderPoses(grid: HTMLElement): DockReorderPose[] {
  const origin = grid.getBoundingClientRect()
  return Array.from(grid.querySelectorAll<HTMLElement>('[data-dock-slot]')).flatMap(slot => {
    const node = slot.querySelector<HTMLElement>('[data-dock-key]')
    const id = node?.dataset.dockKey
    if (!node || !id) return []
    const rect = slot.getBoundingClientRect()
    return [{ id, node, x: rect.left - origin.left, y: rect.top - origin.top }]
  })
}
