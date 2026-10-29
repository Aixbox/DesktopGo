import { COLOROS_MOTION } from '../constants'

export interface DragGhostMotion {
  rotate: number
  scaleX: number
  scaleY: number
}

export interface DragGhostMotionState {
  motion: DragGhostMotion
  velocity: DragGhostMotion
}

const MAX_TILT_DEG = 6
const MAX_STRETCH = 0.04

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

/** Maps pointer velocity to a restrained gel-like tilt and squash. */
export function resolveDragGhostMotion(
  velocityX: number,
  velocityY: number,
  reducedMotion = false
): DragGhostMotion {
  if (reducedMotion) {
    return { rotate: 0, scaleX: 1, scaleY: 1 }
  }

  const speed = Math.hypot(velocityX, velocityY)
  const stretch = clamp(speed / 2.4, 0, 1) * MAX_STRETCH
  const rotate = clamp(-velocityX * 0.42 - velocityY * 0.06, -MAX_TILT_DEG, MAX_TILT_DEG) || 0

  return {
    rotate,
    scaleX: 1 + stretch,
    scaleY: 1 - stretch * 0.55,
  }
}

export function createDragGhostMotionState(): DragGhostMotionState {
  return {
    motion: IDLE_DRAG_GHOST_MOTION,
    velocity: { rotate: 0, scaleX: 0, scaleY: 0 },
  }
}

/** Advances deformation channels with a critically damped spring. */
export function stepDragGhostMotion(
  state: DragGhostMotionState,
  target: DragGhostMotion,
  deltaMs: number
): DragGhostMotionState {
  const deltaSeconds = clamp(deltaMs / 1000, 0.001, 0.034)
  const stiffness = COLOROS_MOTION.spring.stiffness
  const damping = COLOROS_MOTION.spring.damping
  const nextMotion = { ...state.motion }
  const nextVelocity = { ...state.velocity }

  ;(['rotate', 'scaleX', 'scaleY'] as const).forEach(key => {
    const acceleration =
      (target[key] - state.motion[key]) * stiffness - state.velocity[key] * damping
    nextVelocity[key] = state.velocity[key] + acceleration * deltaSeconds
    nextMotion[key] = state.motion[key] + nextVelocity[key] * deltaSeconds
  })

  const isSettled =
    Math.abs(target.rotate - nextMotion.rotate) < 0.01 &&
    Math.abs(target.scaleX - nextMotion.scaleX) < 0.0001 &&
    Math.abs(target.scaleY - nextMotion.scaleY) < 0.0001 &&
    Math.abs(nextVelocity.rotate) < 0.01 &&
    Math.abs(nextVelocity.scaleX) < 0.0001 &&
    Math.abs(nextVelocity.scaleY) < 0.0001

  return isSettled ? createDragGhostMotionState() : { motion: nextMotion, velocity: nextVelocity }
}

export const IDLE_DRAG_GHOST_MOTION: DragGhostMotion = {
  rotate: 0,
  scaleX: 1,
  scaleY: 1,
}
