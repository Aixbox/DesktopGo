import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as policy from '../domain/edgePagingPolicy.ts'
import * as session from '../domain/edgePagingSession.ts'
import * as slots from '../domain/slots.ts'
import * as model from '../model.ts'

function hookRunner() {
  const values = [],
    effects = []
  let cursor = 0,
    dirty = false
  const react = {
    useRef(value) {
      const i = cursor++
      values[i] ??= { current: value }
      return values[i]
    },
    useState(value) {
      const i = cursor++
      if (!(i in values)) values[i] = typeof value === 'function' ? value() : value
      return [
        values[i],
        next => {
          if (!Object.is(values[i], next)) {
            values[i] = next
            dirty = true
          }
        },
      ]
    },
    useCallback(fn, deps) {
      const i = cursor++
      const old = values[i]
      if (!old || deps.some((v, j) => !Object.is(v, old.deps[j]))) values[i] = { fn, deps }
      return values[i].fn
    },
    useLayoutEffect(fn, deps) {
      const i = cursor++
      const old = values[i]
      if (!old || !deps || deps.some((v, j) => !Object.is(v, old.deps[j]))) {
        effects.push(() => {
          old?.cleanup?.()
          values[i] = { deps, cleanup: fn() }
        })
      }
    },
  }
  return {
    react,
    render(fn, attach = () => {}) {
      let result
      for (let count = 0; count < 15; count++) {
        cursor = 0
        dirty = false
        result = fn()
        attach(result)
        effects.splice(0).forEach(effect => effect())
        if (!dirty) return result
      }
      assert.fail('unstable render loop')
    },
    unmount() {
      values.forEach(v => v?.cleanup?.())
    },
  }
}
function load(file, modules, globals = {}) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText
  const exports = {}
  runInNewContext(compiled, {
    exports,
    require: name => {
      assert.ok(name in modules, 'unexpected module: ' + name)
      return modules[name]
    },
    ...globals,
  })
  return exports
}

test('edge hook uses latest page/drag refs, extends one empty page, and blocks folder-open paging', () => {
  const hooks = hookRunner(),
    timers = new Map()
  let id = 0,
    prepared = 0,
    rechecked = 0
  const rect = { left: 0, right: 1000, top: 0, bottom: 800 }
  const viewport = { getBoundingClientRect: () => rect }
  const drag = {
    pointerId: 1,
    dragStartedAt: 1,
    draggingId: 'folder',
    context: 'outer',
    draggingItem: { kind: 'folder', id: 'folder', size: '2x2', children: [] },
    pointerX: 990,
    pointerY: 300,
    offsetX: 80,
    workingOrder: ['a', null],
  }
  const params = {
    disabled: false,
    itemWidth: 60,
    gridGap: 8,
    containerRef: {
      current: {
        closest: () => viewport,
        getBoundingClientRect: () => ({ top: 100, bottom: 700 }),
      },
    },
    dragRef: { current: drag },
    currentPageRef: { current: 0 },
    pageSizeRef: { current: 2 },
    setCurrentPage: page => {
      params.currentPageRef.current = page
    },
    setDragState: state => {
      params.dragRef.current = state
    },
    prepare: () => {
      prepared++
    },
    recheck: d => {
      assert.equal(d, params.dragRef.current)
      rechecked++
    },
  }
  const { useEdgeAutoPaging } = load(
    './useEdgeAutoPaging.ts',
    {
      react: hooks.react,
      '../model': model,
      '../domain/slots': slots,
      '../domain/edgePagingPolicy': policy,
      '../domain/edgePagingSession': session,
    },
    {
      window: {
        setTimeout: (fn, ms) => {
          timers.set(++id, { fn, ms })
          return id
        },
        clearTimeout: key => timers.delete(key),
      },
      getComputedStyle: () => ({ direction: 'ltr' }),
    }
  )
  const render = () => hooks.render(() => useEdgeAutoPaging(params))
  let control = render()
  assert.equal(control.maybeHandleOuterEdgeSwitch(drag, 990, 300), true)
  control = render()
  assert.equal(control.edgePaging.state.phase, 'pending')
  const main = [...timers].find(([, t]) => t.ms === 400)
  timers.delete(main[0])
  main[1].fn()
  control = render()
  assert.equal(params.currentPageRef.current, 1)
  assert.equal(params.dragRef.current.workingOrder.length, 4)
  control.edgePaging.onTransitionStart(1)
  control.edgePaging.onTransitionEnd(1)
  assert.equal(rechecked, 1)
  assert.ok(prepared >= 2)
  assert.equal(control.maybeHandleOuterEdgeSwitch(params.dragRef.current, 990, 300), false)
  params.disabled = true
  control = render()
  assert.equal(control.maybeHandleOuterEdgeSwitch(params.dragRef.current, 10, 300), false)
  params.disabled = false
  control = render()
  assert.equal(control.maybeHandleOuterEdgeSwitch(params.dragRef.current, 10, 300), true)
  hooks.unmount()
  assert.equal(timers.size, 0)
})

test('page animation continues from peek, locks duration across drop, and acknowledges completion', async () => {
  const hooks = hookRunner(),
    motions = [],
    completed = [],
    starts = [],
    frames = []
  const node = () => ({
    style: {},
    x: 0,
    closest: () => ({ getBoundingClientRect: () => ({ width: 1000 }) }),
  })
  const nodes = {
    oldPageLayerRef: node(),
    currentPageLayerRef: node(),
    gridClipRef: node(),
    peekLayerRef: node(),
  }
  let data = { page: 0, dragContext: 'outer' }
  const edge = {
    state: { phase: 'peeking', target: { direction: 'right' } },
    onTransitionStart: page => starts.push(page),
    onTransitionEnd: page => completed.push(page),
  }
  const { useOuterPageMotion } = load(
    './useOuterPageMotion.ts',
    {
      react: hooks.react,
      'framer-motion': { useReducedMotion: () => false },
      '../constants': { COLOROS_MOTION: { workspacePageSnapMs: 600 } },
      '../domain/edgePagingPolicy': policy,
      '../views/pageTranslationMotion': {
        readTranslationX: n => n.x,
        animatePageTranslation(n, from, to, duration) {
          let resolve
          const motion = {
            n,
            from,
            to,
            duration,
            finished: new Promise(r => {
              resolve = r
            }),
            cancel() {
              resolve()
            },
            finish() {
              n.x = to
              resolve()
            },
          }
          motions.push(motion)
          return motion
        },
      },
    },
    {
      getComputedStyle: () => ({ direction: 'ltr' }),
      window: {
        requestAnimationFrame: fn => {
          frames.push(fn)
          return frames.length
        },
        cancelAnimationFrame: () => {},
      },
    }
  )
  const render = () =>
    hooks.render(
      () => useOuterPageMotion(data, 872, edge),
      result => {
        Object.entries(nodes).forEach(([key, n]) => {
          result[key].current = n
        })
      }
    )
  render()
  nodes.peekLayerRef.x = -60
  data = { page: 1, dragContext: 'outer' }
  edge.state = { phase: 'paging', target: { direction: 'right' } }
  render()
  const pageMotions = motions.slice(-3)
  assert.equal(pageMotions[0].to, -1000)
  assert.equal(pageMotions[1].from, 1000)
  assert.equal(pageMotions[2].from, -60)
  pageMotions.forEach(m => assert.equal(m.duration, 550))
  assert.deepEqual(starts, [1])
  const count = motions.length
  data = { page: 1, dragContext: null }
  render()
  assert.equal(motions.length, count, 'drop must not restart animation')
  pageMotions.forEach(m => m.finish())
  await new Promise(resolve => setImmediate(resolve))
  frames.splice(0).forEach(fn => fn())
  render()
  assert.deepEqual(completed, [1])
  assert.equal(nodes.gridClipRef.style.overflow, '')
  assert.equal(nodes.peekLayerRef.x, 0)
  hooks.unmount()
})

test('wheel stepping cancels edge alarms before changing page and respects cooldown and boundaries', () => {
  const hooks = hookRunner(),
    events = []
  let now = 1000
  const { useWheelPageStep } = load(
    './useWheelPageStep.ts',
    {
      react: hooks.react,
      '../constants': { WHEEL_PAGE_COOLDOWN_MS: 600, WHEEL_PAGE_DELTA_THRESHOLD: 40 },
    },
    { performance: { now: () => now } }
  )
  const params = {
    pageCount: 3,
    currentPageRef: { current: 0 },
    setCurrentPage: page => events.push(['page', page]),
    clearEdgeSwitchTimer: () => events.push(['cancel']),
    clearOuterDragInteractionForPageSwitch: () => events.push(['prepare']),
  }
  const step = hooks.render(() => useWheelPageStep(params))
  step(20, true)
  assert.equal(events.length, 0)
  step(20, true)
  assert.deepEqual(events, [['cancel'], ['prepare'], ['page', 1]])
  step(100, true)
  assert.equal(events.length, 3)
  now += 600
  step(100, false)
  assert.deepEqual(events.slice(3), [['cancel'], ['page', 2]])
  now += 600
  step(100, true)
  assert.equal(events.length, 5)
  hooks.unmount()
})

test('edge hovering suppresses reorder but preserves an explicit anchor for drop from dock/folder', async () => {
  const { usePagedDragMoveProcessor } = await import('./usePagedDragMoveProcessor.ts')
  const { useScrollableDragMoveProcessor } =
    await import('../scroll/useScrollableDragMoveProcessor.ts')
  for (const createProcessor of [usePagedDragMoveProcessor, useScrollableDragMoveProcessor]) {
    let result,
      cleared = 0
    const state = {
      context: 'outer',
      pointerId: 1,
      draggingIds: ['a'],
      hoverTargetId: 'neighbor',
      folderPreviewTargetId: 'neighbor',
    }
    const process = createProcessor({
      dragRef: { current: state },
      isCompactOuterDrop: false,
      resolveTopLevelContextAtPoint: () => 'outer',
      maybeHandleOuterEdgeSwitch: () => true,
      clearOuterDwellTimer: () => {
        cleared++
      },
      resolveCandidateAnchorIndexByContext: () => 17,
      publishMoveDragState: value => {
        result = value
      },
      findTopLevelMaxOverlapHit: () => assert.fail('must not reorder at page edge'),
    })
    process(1, 990, 200)
    assert.equal(result.previewSlotIndex, 17)
    assert.equal(result.hoverTargetId, null)
    assert.equal(result.folderPreviewTargetId, null)
    assert.equal(cleared, 1)
  }
})
