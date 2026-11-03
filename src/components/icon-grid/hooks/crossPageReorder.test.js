import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as policy from '../domain/crossPageReorder.ts'
import { getPageAnchorEntries } from '../domain/topLevelLayout.ts'
import { getReorderAnimationDuration } from './reorderMotion.ts'
import { MOTION_SPRING_EASING } from '../constants.ts'

function harness({ reduced = false, waapi = true, rtl = false, scale = 1 } = {}) {
  const values = [],
    effectRecords = []
  let cursor = 0,
    dirty = false,
    pending = [],
    settings = { reduced }
  const react = {
    useState(initial) {
      const i = cursor++
      if (!(i in values)) values[i] = typeof initial === 'function' ? initial() : initial
      return [
        values[i],
        next => {
          const value = typeof next === 'function' ? next(values[i]) : next
          if (!Object.is(value, values[i])) {
            values[i] = value
            dirty = true
          }
        },
      ]
    },
    useRef(initial) {
      const i = cursor++
      values[i] ??= { current: initial }
      return values[i]
    },
    useCallback(fn) {
      return fn
    },
    useLayoutEffect(fn, deps) {
      const i = cursor++,
        old = effectRecords[i]
      if (!old || deps.some((v, j) => !Object.is(v, old.deps[j])))
        pending.push(() => {
          old?.cleanup?.()
          effectRecords[i] = { deps, cleanup: fn() }
        })
    },
  }
  const animations = [],
    nodes = new Map()
  const grid = { getBoundingClientRect: () => ({ width: 208 * scale }) }
  const viewport = { getBoundingClientRect: () => ({ width: 1000 }) }
  const makeNode = () => {
    const n = { style: {}, tx: 0, ty: 0, parentElement: grid, closest: () => viewport }
    if (waapi)
      n.animate = (frames, options) => {
        const animation = {
          frames,
          options,
          cancelled: false,
          cancel() {
            this.cancelled = true
          },
        }
        animations.push(animation)
        return animation
      }
    return n
  }
  const source = readFileSync(new URL('./useCrossPageReorder.ts', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports = {}
  const modules = {
    react,
    'framer-motion': { useReducedMotion: () => settings.reduced },
    '../constants': { MOTION_SPRING_EASING },
    '../domain/crossPageReorder': policy,
    './reorderMotion': {
      getReorderAnimationDuration,
      readCurrentTranslate: n => ({ x: n.tx, y: n.ty }),
    },
  }
  runInNewContext(compiled, {
    exports,
    require: name => modules[name],
    getComputedStyle: () => ({ direction: rtl ? 'rtl' : 'ltr' }),
  })
  const items = Array.from({ length: 8 }, (_, i) => ({ kind: 'icon', key: String(i), icon: {} }))
  let layout
  const render = (order, opts = {}) => {
    layout = order
      ? {
          page: 0,
          pageSize: 4,
          columns: 2,
          hiddenIds: [],
          ...opts,
          order,
          entries: getPageAnchorEntries(
            order,
            items,
            opts.page ?? 0,
            opts.pageSize ?? 4,
            opts.columns ?? 2
          ),
        }
      : layout
    for (let count = 0; count < 20; count++) {
      cursor = 0
      dirty = false
      pending = []
      const result = exports.useCrossPageReorder(layout, {
        itemWidth: 100,
        itemHeight: 120,
        gap: 8,
      })
      if (dirty) continue
      const ids = new Set(result.entries.map(entry => entry.id))
      nodes.forEach((_, id) => {
        if (!ids.has(id)) {
          result.bindNode(id, null)
          nodes.delete(id)
        }
      })
      ids.forEach(id => {
        if (!nodes.has(id)) nodes.set(id, makeNode())
        result.bindNode(id, nodes.get(id))
      })
      pending.forEach(fn => fn())
      if (!dirty) return result
    }
    assert.fail('render did not settle')
  }
  return {
    render,
    animations,
    nodes,
    settings,
    unmount: () => effectRecords.forEach(effect => effect?.cleanup?.()),
  }
}
const before = ['0', '1', '2', '3', '4', '5', null, null]
const after = ['0', '1', '2', null, '4', '5', '3', null]

test('spilled tile remains mounted and inert until it travels to the actual offscreen slot', () => {
  const h = harness()
  h.render(before)
  const originalNode = h.nodes.get('3')
  const result = h.render(after)
  assert.equal(h.nodes.get('3'), originalNode)
  assert.equal(result.entries.filter(entry => entry.id === '3').length, 1)
  assert.equal(result.flightIds.has('3'), true)
  assert.equal(h.animations.length, 1)
  const animation = h.animations[0]
  assert.equal(animation.frames[0].transform, 'translate3d(0px,0px,0)')
  assert.equal(animation.frames[1].transform, 'translate3d(892px,0px,0)')
  assert.equal(animation.options.easing, MOTION_SPRING_EASING)
  assert.ok(animation.options.duration >= 300)
  animation.onfinish()
  const finished = h.render()
  assert.equal(finished.flightIds.size, 0)
  assert.equal(h.nodes.has('3'), false)
  assert.equal(animation.cancelled, true)
  h.unmount()
})

test('reversal during an exit reuses its node and starts from the current visible pose', () => {
  const h = harness()
  h.render(before)
  h.render(after)
  const node = h.nodes.get('3')
  node.tx = 400
  node.ty = -40
  const oldAnimation = h.animations[0]
  const result = h.render(['0', '1', '3', '2', '4', '5', null, null])
  assert.equal(h.nodes.get('3'), node)
  assert.equal(result.entries.filter(entry => entry.id === '3').length, 1)
  const reversed = h.animations[1]
  assert.equal(reversed.frames[0].transform, 'translate3d(508px,-40px,0)')
  assert.equal(reversed.frames[1].transform, 'translate3d(0px,0px,0)')
  assert.equal(oldAnimation.cancelled, true)
  oldAnimation.onfinish()
  assert.equal(
    h.render().flightIds.has('3'),
    true,
    'stale completion cannot remove a retargeted tile'
  )
  node.tx = node.ty = 0
  reversed.onfinish()
  assert.equal(h.render().flightIds.size, 0)
  assert.equal(h.nodes.get('3'), node)
  h.unmount()
})

test('arriving from another page animates into its slot and unrelated layout updates do not restart', () => {
  const h = harness()
  h.render(after)
  h.render(before)
  const animation = h.animations[0]
  assert.equal(animation.frames[0].transform, 'translate3d(892px,0px,0)')
  assert.equal(animation.frames[1].transform, 'translate3d(0px,0px,0)')
  h.render([...before])
  assert.equal(h.animations.length, 1)
  h.unmount()
  assert.equal(animation.cancelled, true)
})

test('edit scale and RTL still place the spill beyond the physical viewport', () => {
  const h = harness({ scale: 0.97, rtl: true })
  h.render(before)
  h.render(after)
  const transform = h.animations[0].frames[1].transform
  const x = Number(transform.match(/\(([-\d.]+)px/)[1])
  assert.ok(Math.abs(x - (-1000 / 0.97 + 108)) < 1e-8)
  h.unmount()
})

test('reduced motion and WebView without WAAPI never leave a retained exit behind', () => {
  for (const options of [{ reduced: true }, { waapi: false }]) {
    const h = harness(options)
    h.render(before)
    const result = h.render(after)
    assert.equal(result.flightIds.size, 0)
    assert.equal(
      result.entries.some(entry => entry.id === '3'),
      false
    )
    assert.equal(h.animations.length, 0)
    h.unmount()
  }
})

test('switching page, deletion and unmount cancel retained animation work', () => {
  for (const action of ['page', 'delete', 'unmount']) {
    const h = harness()
    h.render(before)
    h.render(after)
    const animation = h.animations[0]
    if (action === 'page') h.render(after, { page: 1 })
    if (action === 'delete') h.render(after.map(id => (id === '3' ? null : id)))
    if (action === 'unmount') h.unmount()
    assert.equal(animation.cancelled, true)
    if (action !== 'unmount') {
      assert.equal(h.render().flightIds.size, 0)
      h.unmount()
    }
  }
})
