import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as policy from '../domain/edgePagingPolicy.ts'
import * as contour from '../../../lib/roundedRectContour.ts'

const require = createRequire(import.meta.url)
function lifecycle() {
  const state = [],
    layout = [],
    passive = [],
    cleanups = []
  let cursor = 0
  const effect = queue => (callback, deps) => {
    const i = cursor++,
      previous = state[i]
    if (!previous || deps.some((v, j) => !Object.is(v, previous[j]))) {
      state[i] = deps
      queue.push(() => {
        cleanups[i]?.()
        cleanups[i] = callback()
      })
    }
  }
  return {
    react: {
      useState(initial) {
        const i = cursor++
        if (!(i in state)) state[i] = initial
        return [
          state[i],
          value => {
            state[i] = value
          },
        ]
      },
      useRef(initial) {
        const i = cursor++
        state[i] ??= { current: initial }
        return state[i]
      },
      useMemo: fn => fn(),
      useEffect: effect(passive),
      useLayoutEffect: effect(layout),
    },
    render: fn => {
      cursor = 0
      return fn()
    },
    flushLayout: () => layout.splice(0).forEach(fn => fn()),
    flushPassive: () => passive.splice(0).forEach(fn => fn()),
    unmount: () => cleanups.forEach(fn => fn?.()),
    reset() {
      state.length = layout.length = passive.length = cleanups.length = 0
      cursor = 0
    },
  }
}
function load(hooks, geometry) {
  const source = readFileSync(new URL('./EdgePageHints.tsx', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const exports = {},
    animations = []
  const modules = {
    react: hooks.react,
    'react/jsx-runtime': require('react/jsx-runtime'),
    'framer-motion': { useReducedMotion: () => false },
    '../../../lib/roundedRectContour': contour,
    '../domain/edgePagingPolicy': policy,
    './pageTranslationMotion': {
      readTranslationX: () => 0,
      animatePageTranslation: (...args) => {
        animations.push(args)
        return { cancel() {} }
      },
    },
  }
  runInNewContext(compiled, {
    exports,
    require: name => {
      assert.ok(name in modules, name)
      return modules[name]
    },
    getComputedStyle: node => ({ direction: 'ltr', opacity: node.style?.opacity ?? '0' }),
    ResizeObserver: class {
      constructor(callback) {
        geometry.resize = callback
      }
      observe(node) {
        geometry.observed.push(node)
      }
      disconnect() {
        geometry.disconnected = true
      }
    },
  })
  return { ...exports, animations }
}

test('edge backgrounds measure after a later sibling ref attaches on the first normal mount', () => {
  const hooks = lifecycle(),
    geometry = { observed: [] }
  const { EdgePageHints } = load(hooks, geometry)
  let width = 1000
  const viewport = { getBoundingClientRect: () => ({ width, top: 0 }) }
  const content = {
    closest: () => viewport,
    getBoundingClientRect: () => ({ top: 112, height: 500 }),
  }
  const params = {
    containerRef: { current: null },
    page: 0,
    pageSize: 2,
    folderOpen: false,
    drag: { context: 'outer', workingOrder: ['a', null] },
    paging: { state: { phase: 'idle', target: null } },
  }
  const render = () => hooks.render(() => EdgePageHints(params))
  render()
  // React visits the hints' layout effects before attaching the later sibling ref.
  hooks.flushLayout()
  params.containerRef.current = content
  hooks.flushPassive()
  const tree = render(),
    [left, right] = tree.props.children
  assert.equal(right.props.width, 1000)
  assert.equal(right.props.height, 500)
  assert.equal(right.props.style.top, 112)
  assert.equal(right.props.exposure, 34)
  assert.equal(right.props.visible, true)
  assert.equal(left.props.visible, false)
  assert.ok(right.props.children.props.points.includes('1000,'))
  assert.deepEqual(geometry.observed, [viewport, content])
  width = 800
  geometry.resize()
  assert.equal(render().props.children[1].props.width, 800)
  params.folderOpen = true
  assert.equal(render().props.children[1].props.visible, false)
  hooks.unmount()
  assert.equal(geometry.disconnected, true)
})

test('hint animation wrapper has a full-size containing block and shows the requested alpha', () => {
  const childHooks = lifecycle()
  const childModule = load(childHooks, { observed: [] })
  const shell = childHooks.render(() =>
    childModule.EdgePageHints({
      containerRef: { current: null },
      page: 0,
      pageSize: 2,
      folderOpen: false,
      drag: null,
      paging: { state: { phase: 'idle', target: null } },
    })
  )
  const Surface = shell.props.children[1].type
  const props = {
    ...shell.props.children[1].props,
    exposure: 34,
    width: 1000,
    height: 500,
    visible: true,
  }
  childHooks.reset()
  const view = childHooks.render(() => Surface(props))
  const node = { style: { opacity: '0' } }
  view.props.ref.current = node
  childHooks.flushLayout()
  assert.equal(view.props.className, 'absolute inset-0')
  assert.equal(view.props.children.props.width, 1000)
  assert.equal(node.style.opacity, '0.2')
  assert.equal(childModule.animations.at(-1)[2], -34)
  childHooks.unmount()
})
