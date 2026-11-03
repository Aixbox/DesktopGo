import test from 'node:test'
import assert from 'node:assert/strict'
import { createDockReorderMotion, readDockReorderPoses } from './dockReorderMotion.ts'

function environment(t, fallback = false) {
  const previous = { window: globalThis.window, matrix: globalThis.DOMMatrixReadOnly }
  let serial = 0
  const timers = new Map()
  globalThis.window = {
    getComputedStyle: node => ({
      transform: node.tx || node.ty ? [node.tx, node.ty].join(',') : 'none',
    }),
    setTimeout: callback => {
      timers.set(++serial, callback)
      return serial
    },
    clearTimeout: id => timers.delete(id),
  }
  globalThis.DOMMatrixReadOnly = class {
    constructor(value) {
      ;[this.m41, this.m42] = value.split(',').map(Number)
    }
  }
  t.after(() => {
    globalThis.window = previous.window
    globalThis.DOMMatrixReadOnly = previous.matrix
  })
  const animations = []
  const node = {
    tx: 0,
    ty: 0,
    style: { transform: '', transition: '', willChange: '' },
    offsetWidth: 60,
  }
  if (!fallback)
    node.animate = (frames, options) => {
      const animation = {
        frames,
        options,
        cancelled: 0,
        cancel() {
          this.cancelled++
        },
      }
      animations.push(animation)
      return animation
    }
  const controller = createDockReorderMotion()
  t.after(() => controller.dispose())
  const update = (x, y = 0, reduced = false, target = node) =>
    controller.update([{ id: 'a', node: target, x, y }], reduced, 68)
  return { node, animations, controller, update, timers }
}

test('repeated identical dock slots do not replay the evasion animation', t => {
  const h = environment(t)
  h.update(0)
  h.update(68)
  assert.equal(h.animations.length, 1)
  assert.equal(h.animations[0].frames[0].transform, 'translate3d(-68px,0px,0)')
  for (let i = 0; i < 10; i++) h.update(68)
  assert.equal(h.animations.length, 1)
  assert.equal(h.animations[0].cancelled, 0)
})

test('retarget takes the visible offset before cancelling and stale finish cannot reset the new motion', t => {
  const h = environment(t)
  h.update(0)
  h.update(68)
  const first = h.animations[0]
  h.node.tx = -25
  h.update(0)
  const second = h.animations[1]
  assert.equal(second.frames[0].transform, 'translate3d(43px,0px,0)')
  assert.equal(first.cancelled, 1)
  first.onfinish()
  assert.equal(second.cancelled, 0)
  assert.equal(h.node.style.willChange, 'transform')
  second.onfinish()
  assert.equal(second.cancelled, 1)
  assert.equal(h.node.style.willChange, '')
})

test('RTL and vertical motions follow physical slot displacement', t => {
  const h = environment(t)
  h.update(136)
  h.update(68)
  assert.equal(h.animations[0].frames[0].transform, 'translate3d(68px,0px,0)')
  h.node.tx = 0
  h.update(68, 68)
  assert.equal(h.animations[1].frames[0].transform, 'translate3d(0px,-68px,0)')
})

test('slot sampling excludes item transforms, container translation, scroll and placeholders', () => {
  let origin = { left: 200, top: 600 }
  const item = {
    dataset: { dockKey: 'a' },
    getBoundingClientRect: () => {
      assert.fail('do not sample animated item')
    },
  }
  const slot = {
    getBoundingClientRect: () => ({ left: origin.left + 136, top: origin.top + 68 }),
    querySelector: () => item,
  }
  const placeholder = { querySelector: () => null }
  const grid = { getBoundingClientRect: () => origin, querySelectorAll: () => [placeholder, slot] }
  const first = readDockReorderPoses(grid)
  assert.equal(first[0].x, 136)
  assert.equal(first[0].y, 68)
  assert.equal(first.length, 1)
  origin = { left: 150, top: 570 }
  assert.deepEqual(readDockReorderPoses(grid), first)
})

test('reduced motion, node replacement, removal and disposal clean only their owned animation', t => {
  const h = environment(t)
  h.update(0)
  h.update(68)
  h.update(136, 0, true)
  assert.equal(h.animations[0].cancelled, 1)
  h.update(204)
  const second = h.animations[1]
  const replacement = { ...h.node }
  h.update(204, 0, false, replacement)
  assert.equal(second.cancelled, 1)
  assert.equal(h.animations.length, 2)
  h.update(272, 0, false, replacement)
  const third = h.animations[2]
  h.controller.update([], false, 68)
  assert.equal(third.cancelled, 1)
  h.update(0)
  h.update(68)
  const fourth = h.animations[3]
  h.controller.dispose()
  assert.equal(fourth.cancelled, 1)
})

test('fallback timer is invalidated on retarget and cannot clear the successor transform', t => {
  const h = environment(t, true)
  h.update(0)
  h.update(68)
  const stale = [...h.timers.values()][0]
  h.node.tx = -25
  h.update(0)
  assert.equal(h.timers.size, 1)
  const transition = h.node.style.transition
  stale()
  assert.equal(h.node.style.transition, transition)
  assert.equal(h.node.style.willChange, 'transform')
  ;[...h.timers.values()][0]()
  assert.equal(h.timers.size, 0)
  assert.equal(h.node.style.transform, '')
  assert.equal(h.node.style.transition, '')
})
