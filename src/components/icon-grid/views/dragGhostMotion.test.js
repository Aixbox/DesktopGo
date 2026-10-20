import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createDragGhostMotionState,
  resolveDragGhostMotion,
  stepDragGhostMotion,
} from './dragGhostMotion.ts'

test('keeps a stationary drag ghost neutral', () => {
  assert.deepEqual(resolveDragGhostMotion(0, 0), {
    rotate: 0,
    scaleX: 1,
    scaleY: 1,
  })
})

test('maps fast pointer movement to bounded tilt and squash', () => {
  const motion = resolveDragGhostMotion(20, -8)

  assert.ok(motion.rotate < 0)
  assert.ok(motion.scaleX > 1)
  assert.ok(motion.scaleY < 1)
  assert.ok(Math.abs(motion.rotate) <= 6)
  assert.ok(motion.scaleX <= 1.04)
  assert.ok(motion.scaleY >= 0.978)
})

test('disables deformation for reduced motion', () => {
  assert.deepEqual(resolveDragGhostMotion(20, -8, true), {
    rotate: 0,
    scaleX: 1,
    scaleY: 1,
  })
})

test('springs deformations back to the neutral pose after movement', () => {
  let state = createDragGhostMotionState()
  const target = resolveDragGhostMotion(6, 0)
  for (let index = 0; index < 12; index += 1) {
    state = stepDragGhostMotion(state, target, 16)
  }
  assert.ok(state.motion.rotate < 0)
  assert.ok(state.motion.scaleX > 1)

  for (let index = 0; index < 50; index += 1) {
    state = stepDragGhostMotion(state, { rotate: 0, scaleX: 1, scaleY: 1 }, 16)
  }
  assert.deepEqual(state, createDragGhostMotionState())
})
