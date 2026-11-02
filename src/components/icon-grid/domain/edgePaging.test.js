import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EDGE_PAGING,
  getEdgePageTarget,
  resolveEdgeDirection,
  quarticOut,
} from './edgePagingPolicy.ts'
import { createEdgePagingSession } from './edgePagingSession.ts'
import { animatePageTranslation, pageTranslationFrames } from '../views/pageTranslationMotion.ts'

const target = (page = 0, direction = 'right', session = 'drag1') => ({
  session,
  fromPage: page,
  toPage: page + (direction === 'right' ? 1 : -1),
  direction,
  createPage: false,
})
function harness() {
  let now = 0,
    serial = 0,
    selected = target(),
    rechecks = 0,
    prepares = 0
  const timers = new Map(),
    history = [],
    flips = []
  const runtime = {
    later(callback, delay) {
      const id = ++serial
      timers.set(id, { at: now + delay, callback })
      return id
    },
    cancel(id) {
      timers.delete(id)
    },
    resolve: () => selected,
    publish: state => history.push(state),
    prepare: () => {
      prepares++
    },
    flip: t => flips.push(t),
    recheck: () => {
      rechecks++
      session.update()
    },
  }
  const session = createEdgePagingSession(runtime)
  return {
    session,
    timers,
    flips,
    history,
    select(t) {
      selected = t
    },
    get rechecks() {
      return rechecks
    },
    get prepares() {
      return prepares
    },
    tick(ms) {
      const end = now + ms
      while (true) {
        const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
        if (!next) break
        now = next[1].at
        timers.delete(next[0])
        next[1].callback()
      }
      now = end
    },
  }
}

test('edge alarms begin together: hint at 40 ms, switch at 400 ms; same-side movement does not reset', () => {
  const h = harness()
  assert.equal(h.session.update(), true)
  assert.equal(h.session.state().phase, 'pending')
  h.tick(39)
  assert.equal(h.session.state().phase, 'pending')
  h.tick(1)
  assert.equal(h.session.state().phase, 'peeking')
  h.tick(160)
  h.session.update()
  h.tick(199)
  assert.equal(h.flips.length, 0)
  h.tick(1)
  assert.equal(h.flips.length, 1)
  assert.equal(h.session.state().phase, 'paging')
  assert.equal(h.prepares, 1)
})

test('returning inside before either alarm cancels all pending effects', () => {
  for (const elapsed of [0, 39, 40, 399]) {
    const h = harness()
    h.session.update()
    h.tick(elapsed)
    h.select(null)
    assert.equal(h.session.update(), false)
    h.tick(1000)
    assert.equal(h.flips.length, 0)
    assert.equal(h.timers.size, 0)
    assert.equal(h.session.state().phase, 'idle')
  }
})

test('retarget after peek uses 200 ms; before peek uses a fresh 400 ms', () => {
  for (const elapsed of [20, 40]) {
    const h = harness()
    h.session.update()
    h.tick(elapsed)
    h.select(target(2, 'left'))
    h.session.update()
    const delay = elapsed === 40 ? 200 : 400
    h.tick(delay - 1)
    assert.equal(h.flips.length, 0)
    h.tick(1)
    assert.equal(h.flips[0].direction, 'left')
  }
})

test('new drag sessions cannot inherit shortened timing or fire an old alarm', () => {
  const h = harness()
  h.session.update()
  h.tick(40)
  const stale = [...h.timers.values()][0].callback
  h.select(target(0, 'right', 'drag2'))
  h.session.update()
  stale()
  h.tick(399)
  assert.equal(h.flips.length, 0)
  h.tick(1)
  assert.equal(h.flips[0].session, 'drag2')
})

test('alarm validates latest target, including disappearance without a pointer move', () => {
  for (const elapsed of [20, 100]) {
    const h = harness()
    h.session.update()
    h.tick(elapsed)
    h.select(null)
    h.tick(1000)
    assert.equal(h.flips.length, 0)
    assert.equal(h.session.state().phase, 'idle')
  }
})

test('animation locks paging until matching completion, then rearms with stationary pointer', () => {
  const h = harness()
  h.session.update()
  h.tick(400)
  h.session.startTransition(1)
  h.select(target(1))
  h.session.update()
  h.tick(1000)
  assert.equal(h.flips.length, 1)
  h.session.finishTransition(0)
  assert.equal(h.rechecks, 0)
  h.session.finishTransition(1)
  assert.equal(h.rechecks, 1)
  h.tick(400)
  assert.equal(h.flips.length, 2)
  assert.equal(h.flips[1].toPage, 2)
})

test('manual transition cancels pending edge alarms and drop prevents rearming', () => {
  const h = harness()
  h.session.update()
  h.tick(40)
  h.session.startTransition(2)
  h.tick(1000)
  assert.equal(h.flips.length, 0)
  h.select(null)
  h.session.clear()
  h.session.finishTransition(2)
  h.tick(1000)
  assert.equal(h.session.state().phase, 'idle')
  assert.equal(h.timers.size, 0)
})

test('dispose invalidates even already queued callbacks', () => {
  const h = harness()
  h.session.update()
  const callbacks = [...h.timers.values()].map(t => t.callback)
  h.session.dispose()
  callbacks.forEach(fn => fn())
  assert.equal(h.flips.length, 0)
  assert.equal(h.timers.size, 0)
})

test('page limits include RTL, preceding pages and at most one trailing empty page', () => {
  const resolve = (page, direction, order, rtl = false) =>
    getEdgePageTarget({ page, direction, order, rtl, pageSize: 2 })
  assert.equal(resolve(0, 'left', ['a', null]), null)
  assert.deepEqual(resolve(0, 'right', ['a', null]), { toPage: 1, createPage: true })
  assert.deepEqual(resolve(0, 'right', ['a', null, 'b', null]), { toPage: 1, createPage: false })
  assert.equal(resolve(1, 'right', ['a', null, null, null]), null)
  assert.deepEqual(resolve(1, 'left', ['a', null, null, null]), { toPage: 0, createPage: false })
  assert.equal(resolve(0, 'right', ['a', null], true), null)
  assert.deepEqual(resolve(0, 'left', ['a', null], true), { toPage: 1, createPage: true })
})

test('hit bands follow viewport origin and exclude dock/outside; returning touch cancels a large ghost', () => {
  const rect = { left: 100, right: 1100, top: 120, bottom: 700 }
  const hit = (x, y = 300, centerX = x, previous = null) =>
    resolveEdgeDirection({ rect, pointer: { x, y }, centerX, previous })
  assert.equal(hit(156), 'left')
  assert.equal(hit(157), null)
  assert.equal(hit(1044), 'right')
  assert.equal(hit(1043), null)
  assert.equal(hit(99), null)
  assert.equal(hit(1101), null)
  assert.equal(hit(1050, 701), null)
  assert.equal(hit(150, 119), null)
  assert.equal(hit(1000, 300, 1080), 'right')
  assert.equal(hit(1000, 300, 1080, 'right'), null)
})

test('translation uses monotonic quartic easing, exact endpoints and no overshoot', () => {
  assert.equal(quarticOut(0.5), 0.9375)
  assert.equal(quarticOut(-1), 0)
  assert.equal(quarticOut(2), 1)
  const frames = pageTranslationFrames(-60, -1000)
  assert.equal(frames.length, 61)
  const x = frames.map(frame => Number(frame.transform.match(/\(([-\d.]+)px/)[1]))
  assert.equal(x[0], -60)
  assert.equal(x.at(-1), -1000)
  x.slice(1).forEach((value, i) => assert.ok(value <= x[i] && value >= -1000))
  assert.equal(EDGE_PAGING.peekDuration, 360)
  assert.equal(EDGE_PAGING.pageDuration, 550)
})

test('reduced motion immediately resolves at destination without requesting animation', async () => {
  const node = {
    style: {},
    animate() {
      assert.fail('must not animate')
    },
  }
  const motion = animatePageTranslation(node, -60, 0, 0)
  await motion.finished
  assert.equal(node.style.transform, 'translate3d(0px, 0, 0)')
})

test('WAAPI cancellation freezes current position and resolves; completion writes final position', async () => {
  const original = globalThis.getComputedStyle
  globalThis.getComputedStyle = () => ({ transform: 'matrix(1, 0, 0, 1, -25, 0)' })
  try {
    let finish,
      cancellations = 0
    const node = {
      style: {},
      animate: () => ({
        finished: new Promise(r => {
          finish = r
        }),
        cancel() {
          cancellations++
        },
      }),
    }
    const first = animatePageTranslation(node, 0, -60, 360)
    first.cancel()
    await first.finished
    assert.equal(node.style.transform, 'translate3d(-25px, 0, 0)')
    finish()
    await Promise.resolve()
    assert.equal(node.style.transform, 'translate3d(-25px, 0, 0)')
    const second = animatePageTranslation(node, -25, -60, 360)
    finish()
    await second.finished
    assert.equal(node.style.transform, 'translate3d(-60px, 0, 0)')
    assert.equal(cancellations, 2)
  } finally {
    globalThis.getComputedStyle = original
  }
})

test('WebView without WAAPI runs the same curve via animation frames and cleans up', async () => {
  const original = globalThis.window
  const frames = new Map()
  let id = 0
  globalThis.window = {
    requestAnimationFrame(fn) {
      frames.set(++id, fn)
      return id
    },
    cancelAnimationFrame(key) {
      frames.delete(key)
    },
  }
  try {
    const node = { style: {} }
    const motion = animatePageTranslation(node, 60, 0, 550)
    for (const [key, fn] of frames) {
      frames.delete(key)
      fn(performance.now() + 600)
      break
    }
    await motion.finished
    assert.equal(node.style.transform, 'translate3d(0px, 0, 0)')
    assert.equal(frames.size, 0)
  } finally {
    globalThis.window = original
  }
})

test('incoming content and neighboring background have complementary alpha on the same timeline', async () => {
  const captured = []
  const node = () => ({
    style: {},
    animate(frames, options) {
      captured.push({ frames, options })
      return { finished: Promise.resolve(), cancel() {} }
    },
  })
  const content = node(),
    background = node()
  const a = animatePageTranslation(content, 1000, 0, 550, { from: 0, to: 1 })
  const b = animatePageTranslation(background, -90, -1000, 550, { from: 0.2, to: 0 })
  await Promise.all([a.finished, b.finished])
  captured[0].frames.forEach((frame, i) => {
    assert.ok(Math.abs(captured[1].frames[i].opacity - 0.2 * (1 - frame.opacity)) < 1e-12)
  })
  assert.equal(content.style.opacity, '1')
  assert.equal(background.style.opacity, '0')
  assert.equal(captured[0].options.duration, captured[1].options.duration)
})
