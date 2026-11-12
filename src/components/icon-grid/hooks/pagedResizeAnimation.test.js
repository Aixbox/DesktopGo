import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { getId } from '../model.ts'
import * as types from '../../../types/index.ts'

const require = createRequire(import.meta.url)
const noop = () => {}
const mocks = {
  '../types': types,
  react: null,
  'react/jsx-runtime': require('react/jsx-runtime'),
  'framer-motion': { LayoutGroup: 'LayoutGroup' },
  'lucide-react': { ChevronLeft: 'Left', ChevronRight: 'Right' },
  '../stores/iconStore': null,
  './icon-grid/hooks/usePagedIconGridLayout': null,
  './icon-grid/hooks/useGridItemResizeController': null,
  './icon-grid/hooks/usePagedGridReorderAnimations': null,
  './icon-grid/hooks/useIconGridDragWorkflow': {
    useIconGridDragWorkflow: () => ({
      dragState: null,
      dragRef: { current: null },
      hiddenOuterItemIds: [],
      frozenOuterOrder: null,
      dropImpact: null,
      clearEdgeSwitchTimer: noop,
    }),
  },
  './icon-grid/hooks/useFolderGridMeasurement': { useFolderGridMeasurement: () => ({}) },
  './icon-grid/hooks/useDockKeyboardReorder': { useDockKeyboardReorder: () => ({}) },
  './icon-grid/hooks/useGridGeometryKey': { useGridGeometryKey: () => 'stable' },
  './icon-grid/hooks/usePageBounds': { usePageBounds: noop },
  './icon-grid/hooks/useWheelPageStep': { useWheelPageStep: noop },
  './icon-grid/hooks/useMousePageSwipe': { useMousePageSwipe: () => ({ handlers: {} }) },
}
for (const name of [
  'OuterGridView',
  'DragOverlays',
  'EdgePageHints',
  'FolderModalView',
  'DockBar',
  'DragAnnouncementLiveRegion',
])
  mocks[`./icon-grid/views/${name}`] = { [name]: name }

async function moduleFactory(path) {
  const url = new URL(path, import.meta.url)
  const code = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText
  const modules = { ...mocks }
  for (const [, name] of code.matchAll(/require\("([^"]+)"\)/g)) {
    if (name in modules) continue
    modules[name] = await import(new URL(`${name}.ts`, url))
  }
  return (overrides, window) => {
    const exports = {}
    runInNewContext(code, { exports, window, require: name => overrides[name] ?? modules[name] })
    return exports
  }
}

const loadGrid = await moduleFactory('../../IconGrid.tsx')
const loadResize = await moduleFactory('./useGridItemResizeController.ts')
const loadAnimation = await moduleFactory('./usePagedGridReorderAnimations.ts')

function hooks() {
  const cells = [],
    effects = []
  let cursor = 0
  const memo = (fn, deps) => {
    const i = cursor++
    if (!cells[i] || deps.some((d, j) => !Object.is(d, cells[i].deps[j])))
      cells[i] = { deps, value: fn() }
    return cells[i].value
  }
  const effect = (fn, deps) => {
    const i = cursor++
    if (cells[i]?.deps && deps?.every((d, j) => Object.is(d, cells[i].deps[j]))) return
    effects.push(() => {
      cells[i]?.cleanup?.()
      cells[i] = { deps, cleanup: fn() }
    })
  }
  return {
    react: {
      useState: initial => {
        const i = cursor++
        if (!(i in cells)) cells[i] = typeof initial === 'function' ? initial() : initial
        return [
          cells[i],
          next => {
            cells[i] = typeof next === 'function' ? next(cells[i]) : next
          },
        ]
      },
      useRef: initial => (cells[cursor++] ??= { current: initial }),
      useMemo: memo,
      useCallback: (fn, deps) => memo(() => fn, deps),
      useEffectEvent: fn => fn,
      useLayoutEffect: effect,
      useEffect: effect,
    },
    render: fn => {
      cursor = 0
      return fn()
    },
    flush: () => effects.splice(0).forEach(fn => fn()),
    dispose: () => cells.forEach(cell => cell?.cleanup?.()),
  }
}

function findGrid(tree) {
  if (Array.isArray(tree)) return tree.map(findGrid).find(Boolean)
  if (!tree?.props) return null
  if (tree.type === 'OuterGridView') return tree.props
  return findGrid(tree.props.children)
}

function createLayout(kind) {
  const source =
    kind === 'folder'
      ? { kind, id: 'source', name: 'Source', size: '1x1', children: [] }
      : { kind, key: 'source', icon: {} }
  const id = getId(source)
  const slots = Array.from({ length: 16 }, (_, i) => (i === 0 ? null : i === 10 ? id : `n${i}`))
  const items = slots
    .filter(Boolean)
    .map(key => (key === id ? source : { kind: 'icon', key, icon: {} }))
  const layout = {
    items,
    itemsRef: { current: items },
    outerSlots: slots,
    outerSlotsRef: { current: slots },
    dockKeys: [],
    dockKeysRef: { current: [] },
    hotseatEntries: [],
    hotseatEntriesRef: { current: [] },
    activeDockKeys: [],
    outerItemIds: items.map(getId),
    columns: 4,
    rows: 4,
    pageSize: 16,
    pageSizeRef: { current: 16 },
    currentPage: 0,
    currentPageRef: { current: 0 },
    itemWidth: 96,
    itemHeight: 110,
    layoutReady: true,
    layoutDimensionsTracker: { read: () => ({ columns: 4, pageSize: 16 }) },
    setItems: items => {
      layout.items = items
    },
    setOuterSlots: slots => {
      layout.outerSlots = slots
    },
  }
  return { id, layout }
}

function createNode(id, animations) {
  const node = {
    style: {},
    left: 0,
    top: 0,
    dx: 0,
    dy: 0,
    getBoundingClientRect() {
      return { left: this.left + this.dx, top: this.top + this.dy }
    },
    animate(frames, options) {
      ;[this.dx, this.dy] = frames[0].transform.match(/-?[\d.]+(?=px)/g).map(Number)
      const animation = {
        id,
        frames,
        options,
        cancelled: false,
        cancel: () => {
          animation.cancelled = true
          node.dx = node.dy = 0
          animation.oncancel?.()
        },
      }
      animations.push(animation)
      return animation
    },
  }
  return node
}

function fixture(t, kind, reduced = false) {
  const runtime = hooks()
  const window = {
    addEventListener: noop,
    removeEventListener: noop,
    matchMedia: () => ({ matches: reduced }),
  }
  const { id, layout } = createLayout(kind)
  const modules = { react: runtime.react }
  modules['./icon-grid/hooks/useGridItemResizeController'] = loadResize(modules, window)
  modules['./icon-grid/hooks/usePagedGridReorderAnimations'] = loadAnimation(modules, window)
  let beforeRestore
  modules['./icon-grid/hooks/usePagedIconGridLayout'] = {
    usePagedIconGridLayout: params => {
      beforeRestore = params.onBeforeLayoutChange
      return layout
    },
  }
  modules['../stores/iconStore'] = {
    useIconStore: () => ({ iconSize: 'medium', selectedIconKeys: [], dockEnabled: false }),
  }
  const { IconGrid } = loadGrid(modules, window)
  const nodes = new Map(),
    animations = []
  const render = () => {
    const props = findGrid(runtime.render(() => IconGrid({ icons: [], layoutResetToken: 0 })))
    for (const entry of props.pageAnchorEntries) {
      if (!nodes.has(entry.id)) nodes.set(entry.id, createNode(entry.id, animations))
      const node = nodes.get(entry.id)
      node.left = entry.col * 104
      node.top = entry.row * 118
      props.bindTileRef(entry.id, node)
    }
    runtime.flush()
    return props
  }
  t.after(() => runtime.dispose())
  const restoreSlots = slots => {
    assert.equal(
      typeof beforeRestore,
      'function',
      'external restoration must capture the current pose'
    )
    beforeRestore()
    layout.outerSlots = slots
    layout.outerSlotsRef.current = slots
  }
  return { id, render, nodes, animations, layout, restoreSlots }
}

for (const kind of ['icon', 'folder']) {
  test(`${kind}: layout preview cancellation animates from the current visible position back to its original slot`, t => {
    const h = fixture(t, kind)
    h.render()
    const originalSlots = [...h.layout.outerSlots]
    const originalPosition = h.nodes.get(h.id).getBoundingClientRect()
    const previewSlots = [...originalSlots]
    ;[previewSlots[10], previewSlots[11]] = [previewSlots[11], previewSlots[10]]
    h.restoreSlots(previewSlots)
    h.render()
    const node = h.nodes.get(h.id)
    assert.deepEqual(node.getBoundingClientRect(), originalPosition)
    assert.equal(h.animations.length, 2, 'only the swapped tiles animate')
    for (const id of [h.id, 'n11']) {
      h.nodes.get(id).dx *= 0.4
      h.nodes.get(id).dy *= 0.4
    }
    const interruptedPosition = node.getBoundingClientRect()
    h.restoreSlots(originalSlots)
    h.render()
    assert.deepEqual(
      node.getBoundingClientRect(),
      interruptedPosition,
      'cancel continues from the in-flight pose'
    )
    assert.deepEqual({ left: node.left, top: node.top }, originalPosition)
    assert.equal(h.animations.length, 4)
    assert.ok(h.animations[0].cancelled)
    assert.ok(h.animations.at(-1).options.duration > 0)
  })

  test(`${kind}: reduced motion restores layout preview directly without movement`, t => {
    const h = fixture(t, kind, true)
    h.render()
    const slots = [...h.layout.outerSlots]
    ;[slots[10], slots[11]] = [slots[11], slots[10]]
    h.restoreSlots(slots)
    h.render()
    assert.equal(h.nodes.get(h.id).left, 312)
    assert.equal(h.animations.length, 0)
  })

  test(`${kind}: paged size menu animates the displaced icon into the upper-left vacancy`, t => {
    const h = fixture(t, kind)
    const props = h.render()
    const previous = h.nodes.get('n11').getBoundingClientRect()
    if (kind === 'folder') props.onResizeFolder('source', '2x1')
    else props.resizeActions.commit(h.id, '2x1')
    h.render()
    assert.equal(h.layout.outerSlots[0], 'n11')
    assert.equal(h.nodes.get('n11').left, 0)
    assert.deepEqual(
      h.nodes.get('n11').getBoundingClientRect(),
      previous,
      'first animation frame retains the displayed position'
    )
    assert.equal(h.animations.length, 1, 'unaffected icons do not move')
    assert.equal(h.animations[0].id, 'n11')
    assert.ok(h.animations[0].options.duration > 0)
    assert.equal(h.animations[0].frames[1].transform, 'translate3d(0, 0, 0)')
  })

  test(`${kind}: handle preview, cancellation and release continue from the current animated position`, t => {
    const h = fixture(t, kind)
    h.render().resizeActions.preview(h.id, '2x1')
    let props = h.render()
    assert.equal(h.layout.outerSlots[11], 'n11', 'preview is not committed')
    assert.ok(h.animations.some(animation => animation.id === 'n11'))
    const node = h.nodes.get('n11')
    node.dx *= 0.4
    node.dy *= 0.4
    const intermediate = node.getBoundingClientRect()
    props.resizeActions.cancel()
    props = h.render()
    assert.equal(node.left, 312)
    assert.deepEqual(
      node.getBoundingClientRect(),
      intermediate,
      'cancel must animate back without a flash'
    )
    props.resizeActions.preview(h.id, '2x1')
    props = h.render()
    node.dx *= 0.5
    node.dy *= 0.5
    const releasePosition = node.getBoundingClientRect()
    props.resizeActions.commit(h.id, '2x1')
    h.render()
    assert.deepEqual(
      node.getBoundingClientRect(),
      releasePosition,
      'commit must not jump to the endpoint'
    )
    assert.equal(h.layout.outerSlots[0], 'n11')
  })

  test(`${kind}: reduced motion still applies resize and displacement without animations`, t => {
    const h = fixture(t, kind, true)
    h.render().resizeActions.commit(h.id, '2x1')
    h.render()
    assert.equal(h.layout.outerSlots[0], 'n11')
    assert.equal(h.animations.length, 0)
  })
}
