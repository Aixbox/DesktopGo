import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as layoutStore from '../services/layoutStore.ts'
import { buildGridGeometryKey } from '../domain/gridGeometry.ts'
import { buildPersistedItemCoordinates } from '../domain/topLevelLayout.ts'
import { getPageCountBySlots } from '../domain/slots.ts'
import { getIconGridRowHeight, ICON_SIZE_CONFIG, WINDOW_SIZE_CONFIG } from '../../../types/index.ts'
import { getPagedGridInsets, getPagedGridGeometrySuffix } from '../domain/pagedGridMetrics.ts'

const source = readFileSync(new URL('./usePagedIconGridLayout.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText
const dependencies = {}
for (const [, name] of compiled.matchAll(/require\("([^"]+)"\)/g)) {
  if (name === 'react' || name === './useWidgetResizeHandler') continue
  dependencies[name] = await import(new URL(`${name}.ts`, import.meta.url).href)
}

const geometryKey = (width, height, dpr = 1, mode = 'medium') =>
  buildGridGeometryKey(mode, 'medium', true, {
    viewportWidth: width,
    viewportHeight: height,
    devicePixelRatio: dpr,
  })

function fixture() {
  const icons = ['a', 'b', 'c', 'large', 'last', 'dock'].map(id => ({
    id,
    name: id,
    path: id,
    target_path: id,
    item_type: 'shortcut',
    icon_base64: '',
  }))
  const slots = Array(64).fill(null)
  slots[0] = 'a'
  slots[2] = 'folder:work'
  slots[6] = 'large'
  slots[61] = 'last'
  return {
    icons,
    layout: {
      items: [
        { type: 'icon', key: 'a' },
        { type: 'folder', id: 'work', name: 'Work', size: '2x2', children: ['b', 'c'] },
        { type: 'icon', key: 'large', size: '2x1' },
        { type: 'icon', key: 'last' },
        { type: 'icon', key: 'dock' },
      ],
      slots,
      dockKeys: ['dock'],
      columns: 8,
      pageSize: 32,
      geometryKey: geometryKey(1328, 768, 2),
    },
  }
}

function harness({ icons, layout, key = layout.geometryKey, read } = fixture()) {
  const state = [],
    effects = [],
    frames = new Map(),
    observers = new Set(),
    listeners = new Map()
  const container = { clientWidth: 1120, clientHeight: 480 }
  const writes = []
  const renders = []
  let cursor = 0,
    dirty = true,
    frameId = 0,
    output
  const sameDeps = (a, b) =>
    a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]))
  const react = {
    useState(initial) {
      const i = cursor++
      if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial
      return [
        state[i],
        next => {
          const value = typeof next === 'function' ? next(state[i]) : next
          if (!Object.is(value, state[i])) {
            state[i] = value
            dirty = true
          }
        },
      ]
    },
    useRef(initial) {
      const i = cursor++
      return (state[i] ??= { current: initial })
    },
    useMemo(callback, deps) {
      const i = cursor++
      if (!sameDeps(state[i]?.deps, deps)) state[i] = { deps, value: callback() }
      return state[i].value
    },
    useEffectEvent(callback) {
      const ref = react.useRef(callback)
      ref.current = callback
      return react.useMemo(
        () =>
          (...args) =>
            ref.current(...args),
        []
      )
    },
    useEffect(callback, deps) {
      const i = cursor++
      if (sameDeps(state[i]?.deps, deps)) return
      effects.push(() => {
        state[i]?.cleanup?.()
        state[i] = { deps, cleanup: callback() }
      })
    },
  }
  const modules = {
    ...dependencies,
    react,
    '../services/layoutStore': {
      ...layoutStore,
      readLayoutStrict: read ?? (async () => structuredClone(layout)),
      writeLayout: async (...args) => {
        writes.push(structuredClone(args))
      },
    },
    './useWidgetResizeHandler': { useWidgetResizeHandler: () => () => {} },
  }
  const exports = {}
  runInNewContext(compiled, {
    exports,
    console,
    require: name => {
      assert.ok(name in modules, name)
      return modules[name]
    },
    requestAnimationFrame: callback => {
      frames.set(++frameId, callback)
      return frameId
    },
    cancelAnimationFrame: id => frames.delete(id),
    ResizeObserver: class {
      constructor(callback) {
        this.callback = callback
      }
      observe() {
        observers.add(this.callback)
      }
      disconnect() {
        observers.delete(this.callback)
      }
    },
    window: {
      setTimeout,
      clearTimeout,
      addEventListener: (name, callback) => {
        if (!listeners.has(name)) listeners.set(name, new Set())
        listeners.get(name).add(callback)
      },
      removeEventListener: (name, callback) => listeners.get(name)?.delete(callback),
    },
  })
  const params = {
    icons,
    geometryKey: key,
    layoutResetToken: 0,
    dockEnabled: true,
    columnWidth: 96,
    rowHeight: 112,
  }
  const render = () => {
    cursor = 0
    dirty = false
    output = exports.usePagedIconGridLayout(params)
    renders.push({
      ready: output.layoutReady,
      pageCount: getPageCountBySlots(output.outerSlots, output.pageSize, output.layoutReady),
      slots: [...output.outerSlots],
      columns: output.columns,
      pageSize: output.pageSize,
      currentPage: output.currentPage,
    })
    output.containerRef.current = container
    output.gridRef.current = container
    for (const effect of effects.splice(0)) effect()
  }
  return {
    params,
    writes,
    renders,
    get value() {
      return output
    },
    async settle({ flushFrames = true } = {}) {
      // Drain render/effect, promise and RAF queues, including asynchronous hydration.
      for (let i = 0; i < 20; i++) {
        if (dirty) render()
        await Promise.resolve()
        if (flushFrames) {
          const pending = [...frames.values()]
          frames.clear()
          pending.forEach(callback => callback())
        }
      }
      assert.equal(dirty, false, 'layout effects must converge')
    },
    update(changes) {
      Object.assign(params, changes)
      dirty = true
    },
    resize(width, height) {
      Object.assign(container, { clientWidth: width, clientHeight: height })
      observers.forEach(callback => callback())
      listeners.get('resize')?.forEach(callback => callback())
    },
    dispose() {
      state.forEach(entry => entry?.cleanup?.())
    },
  }
}

const snapshot = value =>
  structuredClone({
    items: layoutStore.serializeItems(value.items),
    slots: value.outerSlots,
    dock: value.dockKeys,
    columns: value.columns,
    rows: value.rows,
    coordinates: buildPersistedItemCoordinates(
      value.outerSlots,
      value.items,
      value.pageSize,
      value.columns
    ),
  })

test('4K → 1080p → 4K preserves paged positions and causes no layout/history writes', async t => {
  const h = harness()
  t.after(() => h.dispose())
  await h.settle()
  h.value.setCurrentPage(1)
  await h.settle()
  const before = snapshot(h.value)
  const writes = h.writes.length
  for (const [width, height, dpr] of [
    [640, 360, 2],
    [1280, 720, 1],
    [1328, 768, 2],
  ]) {
    h.update({ geometryKey: geometryKey(width, height, dpr) })
    h.resize(width - 128, height - 240)
    await h.settle()
    assert.deepEqual(snapshot(h.value), before)
    assert.equal(h.value.currentPage, 1)
    assert.equal(h.writes.length, writes, 'viewport-only changes must not enter the layout writer')
  }
})

test('restart at lower resolution restores stored rows, columns, spans and page positions', async t => {
  const data = fixture()
  const h = harness({ ...data, key: geometryKey(1280, 720, 1) })
  t.after(() => h.dispose())
  h.resize(500, 200)
  await h.settle()
  assert.equal(h.value.columns, 8)
  assert.equal(h.value.rows, 4)
  assert.deepEqual([...h.value.outerSlots], data.layout.slots)
  assert.deepEqual(layoutStore.serializeItems(h.value.items), data.layout.items)
  for (const saved of h.writes) {
    assert.deepEqual(saved[1], data.layout.slots)
    assert.equal(saved[3], 32)
    assert.equal(saved[4], 8)
    assert.equal(
      saved[5],
      data.layout.geometryKey,
      'keep legacy metadata to avoid a migration snapshot'
    )
  }
})

test('delayed hydration never normalizes saved slots using the provisional viewport', async t => {
  const data = fixture()
  let finish
  const h = harness({
    ...data,
    read: () =>
      new Promise(resolve => {
        finish = resolve
      }),
  })
  t.after(() => h.dispose())
  h.resize(80, 80)
  await h.settle()
  assert.equal(h.writes.length, 0)
  h.resize(500, 200)
  finish(data.layout)
  await h.settle()
  assert.deepEqual([...h.value.outerSlots], data.layout.slots)
  assert.equal(h.value.pageSize, 32)
  assert.ok(h.writes.every(args => args[3] === 32 && args[4] === 8))
})

test('refresh and explicit history restore still hydrate after geometry was already measured', async t => {
  const data = fixture()
  const h = harness(data)
  t.after(() => h.dispose())
  await h.settle()
  const before = snapshot(h.value)
  h.update({ icons: [...data.icons], geometryKey: geometryKey(1280, 720, 1) })
  await h.settle()
  assert.deepEqual(snapshot(h.value), before)
  h.update({ layoutResetToken: 1 })
  await h.settle()
  assert.deepEqual(snapshot(h.value), before)
})

test('reopening a ready grid keeps every refresh frame visible without waiting for a new measurement', async t => {
  const data = fixture()
  const h = harness(data)
  t.after(() => h.dispose())
  await h.settle()
  h.value.setCurrentPage(1)
  await h.settle()
  const before = snapshot(h.value)
  for (let reopen = 0; reopen < 3; reopen++) {
    const start = h.renders.length
    // Focus refresh returns new IPC objects, even when icon content is unchanged.
    h.update({ icons: structuredClone(data.icons) })
    await h.settle({ flushFrames: false })
    assert.deepEqual(snapshot(h.value), before)
    assert.equal(h.value.currentPage, 1)
    for (const frame of h.renders.slice(start)) {
      assert.equal(frame.ready, true, 'background refresh must never hide the grid')
      assert.equal(frame.pageCount, 2, 'page indicators must stay visible too')
    }
    await h.settle()
  }
})

test('background refresh updates icon artwork and folder children without hiding the measured grid', async t => {
  const data = fixture()
  const h = harness(data)
  t.after(() => h.dispose())
  await h.settle()
  const before = snapshot(h.value)
  const start = h.renders.length
  h.update({
    icons: data.icons.map(icon => ({
      ...icon,
      name: `Updated ${icon.name}`,
      icon_base64: 'new-image',
    })),
  })
  await h.settle()
  assert.deepEqual(snapshot(h.value), before)
  assert.equal(h.value.items.find(item => item.key === 'a').icon.name, 'Updated a')
  const folder = h.value.items.find(item => item.kind === 'folder')
  assert.equal(folder.children[0].icon.icon_base64, 'new-image')
  assert.ok(h.renders.slice(start).every(frame => frame.ready))
})

test('background icon additions and removals publish complete slots without a blank frame', async t => {
  const data = fixture()
  const h = harness(data)
  t.after(() => h.dispose())
  await h.settle()
  const start = h.renders.length
  h.update({
    icons: [
      ...data.icons.filter(icon => icon.id !== 'last'),
      { ...data.icons[0], id: 'new', path: 'new', name: 'New' },
    ],
  })
  await h.settle()
  assert.ok(h.value.outerSlots.includes('new'))
  assert.ok(!h.value.outerSlots.includes('last'))
  assert.equal(h.value.outerSlots.indexOf('folder:work'), 2)
  assert.equal(h.value.outerSlots.indexOf('large'), 6)
  assert.ok(h.renders.slice(start).every(frame => frame.ready && frame.pageCount > 0))
  for (const frame of h.renders.slice(start)) {
    if (frame.slots.includes('last')) continue // The preceding layout is still valid until refresh commits.
    assert.ok(frame.slots.includes('new'), 'new icons and their positions must publish together')
  }
})

test('background refresh preserves live edits while explicit restore still loads and validates saved layout', async t => {
  const data = fixture()
  let reads = 0
  const h = harness({
    ...data,
    read: async () => {
      reads++
      return structuredClone(data.layout)
    },
  })
  t.after(() => h.dispose())
  await h.settle()
  h.value.setItems(
    h.value.items.map(item => (item.kind === 'folder' ? { ...item, name: 'Edited' } : item))
  )
  await h.settle()
  h.update({ icons: structuredClone(data.icons) })
  await h.settle()
  assert.equal(reads, 1)
  assert.equal(h.value.items.find(item => item.kind === 'folder').name, 'Edited')
  const start = h.renders.length
  h.update({ layoutResetToken: 1 })
  await h.settle()
  assert.equal(reads, 2)
  assert.equal(h.value.items.find(item => item.kind === 'folder').name, 'Work')
  assert.ok(
    h.renders.slice(start).every(frame => frame.ready),
    'external restore publishes validated positions without hiding the measured grid'
  )
  assert.equal(h.value.layoutReady, true)
})

test('preview and cancel keep the preceding grid visible until complete replacement slots are ready', async t => {
  const data = fixture()
  let resolveRead
  let defer = false
  const h = harness({
    ...data,
    read: () =>
      defer
        ? new Promise(resolve => {
            resolveRead = resolve
          })
        : Promise.resolve(structuredClone(data.layout)),
  })
  t.after(() => h.dispose())
  const captured = []
  h.update({ onBeforeLayoutChange: () => captured.push([...h.value.outerSlots]) })
  await h.settle()
  assert.equal(captured.length, 0, 'initial hydration has no existing pose to animate')
  const original = [...h.value.outerSlots]
  const preview = structuredClone(data.layout)
  preview.slots[0] = null
  preview.slots[1] = 'a'
  defer = true
  for (const [token, incoming] of [
    [1, preview],
    [2, data.layout],
  ]) {
    const previous = [...h.value.outerSlots]
    const start = h.renders.length
    h.update({ layoutResetToken: token })
    await h.settle()
    assert.deepEqual([...h.value.outerSlots], previous)
    resolveRead(structuredClone(incoming))
    await h.settle({ flushFrames: false })
    assert.deepEqual(captured.at(-1), previous)
    assert.deepEqual([...h.value.outerSlots], incoming.slots)
    assert.ok(h.renders.slice(start).every(frame => frame.ready && frame.pageCount === 2))
    await h.settle()
  }
  assert.deepEqual([...h.value.outerSlots], original)
  assert.equal(captured.length, 2)
})

test('restoring different saved dimensions publishes rows and slots together without a blank frame', async t => {
  const data = fixture()
  let saved = data.layout
  const h = harness({ ...data, read: async () => structuredClone(saved) })
  t.after(() => h.dispose())
  await h.settle()
  const original = snapshot(h.value)
  const start = h.renders.length
  saved = { ...data.layout, columns: 10, pageSize: 50, slots: Array(100).fill(null) }
  saved.slots[1] = 'a'
  saved.slots[3] = 'folder:work'
  saved.slots[7] = 'large'
  saved.slots[96] = 'last'
  const previewSlots = [...saved.slots]
  h.update({ layoutResetToken: 1 })
  await h.settle()
  assert.equal(h.value.columns, 10)
  assert.equal(h.value.rows, 5)
  assert.deepEqual([...h.value.outerSlots], saved.slots)
  saved = data.layout
  h.update({ layoutResetToken: 2 })
  await h.settle()
  assert.deepEqual(snapshot(h.value), original)
  for (const frame of h.renders.slice(start)) {
    assert.equal(frame.ready, true)
    assert.deepEqual(frame.slots, frame.columns === 10 ? previewSlots : data.layout.slots)
    assert.equal(frame.pageCount, 2)
  }
})

test('a delayed preview hydration cannot overwrite the newer cancellation restore', async t => {
  const data = fixture()
  const reads = []
  let deferred = false
  const h = harness({
    ...data,
    read: () =>
      deferred
        ? new Promise(resolve => reads.push(resolve))
        : Promise.resolve(structuredClone(data.layout)),
  })
  t.after(() => h.dispose())
  await h.settle()
  const original = snapshot(h.value)
  const start = h.renders.length
  deferred = true
  h.update({ layoutResetToken: 1 })
  await h.settle()
  h.update({ layoutResetToken: 2 })
  await h.settle()
  reads[1](structuredClone(data.layout))
  await h.settle()
  const stale = structuredClone(data.layout)
  stale.slots[0] = null
  stale.slots[1] = 'a'
  reads[0](stale)
  await h.settle()
  assert.deepEqual(snapshot(h.value), original)
  assert.ok(h.renders.slice(start).every(frame => frame.ready))
})

test('restoring fewer pages clamps the active page in the same visible render', async t => {
  const data = fixture()
  let saved = data.layout
  const h = harness({ ...data, read: async () => structuredClone(saved) })
  t.after(() => h.dispose())
  await h.settle()
  h.value.setCurrentPage(1)
  await h.settle()
  saved = { ...data.layout, slots: data.layout.slots.slice(0, 32) }
  saved.slots[16] = 'last'
  const start = h.renders.length
  h.update({ layoutResetToken: 1 })
  await h.settle()
  assert.equal(h.value.currentPage, 0)
  for (const frame of h.renders.slice(start)) {
    assert.equal(frame.ready, true)
    assert.ok(
      frame.currentPage < frame.pageCount,
      'no intermediate frame may display an empty invalid page'
    )
  }
})

test('failed restoration keeps the visible layout intact and can be retried', async t => {
  const data = fixture()
  let fail = false
  const h = harness({
    ...data,
    read: async () => {
      if (fail) throw new Error('restore read failed')
      return structuredClone(data.layout)
    },
  })
  t.after(() => h.dispose())
  await h.settle()
  const original = snapshot(h.value)
  const writes = h.writes.length
  const start = h.renders.length
  fail = true
  h.update({ layoutResetToken: 1 })
  await h.settle()
  assert.deepEqual(snapshot(h.value), original)
  assert.match(h.value.hydrationError, /restore read failed/)
  assert.equal(h.writes.length, writes)
  fail = false
  h.update({ layoutResetToken: 2 })
  await h.settle()
  assert.equal(h.value.hydrationError, null)
  assert.deepEqual(snapshot(h.value), original)
  assert.ok(h.renders.slice(start).every(frame => frame.ready))
})

test('explicit window-size setting changes still recompute and persist the grid', async t => {
  const h = harness()
  t.after(() => h.dispose())
  await h.settle()
  const writes = h.writes.length
  h.update({ geometryKey: geometryKey(1600, 900, 1, 'large') })
  h.resize(1472, 660)
  await h.settle()
  assert.notEqual(h.value.columns, 8)
  assert.ok(h.writes.length > writes)
  assert.ok(h.value.outerSlots.includes('folder:work'))
  assert.ok(h.value.outerSlots.includes('last'))
  assert.equal(h.writes.at(-1)[3], h.value.pageSize)
  assert.equal(h.writes.at(-1)[4], h.value.columns)
})

test('remounting the paged grid never exposes one page per saved slot during hydration', async t => {
  // Switching scroll → paged mounts a fresh hook while the stored slots arrive asynchronously.
  for (let mount = 0; mount < 3; mount++) {
    const h = harness()
    t.after(() => h.dispose())
    await h.settle()
    assert.equal(h.renders.at(-1).pageCount, 2)
    assert.ok(h.renders.some(frame => !frame.ready))
    assert.ok(h.renders.some(frame => frame.ready))
    for (const frame of h.renders) {
      assert.ok([0, 2].includes(frame.pageCount), `transient page count: ${frame.pageCount}`)
      if (frame.ready) {
        assert.equal(frame.columns, 8)
        assert.equal(frame.pageSize, 32)
      }
    }
  }
})

test('page controls wait for normalization when saved and current configurations differ', async t => {
  const h = harness({ ...fixture(), key: geometryKey(1600, 900, 1, 'large') })
  t.after(() => h.dispose())
  h.resize(700, 400)
  await h.settle()
  const final = h.renders.at(-1)
  assert.equal(final.ready, true)
  for (const frame of h.renders.filter(value => value.ready)) {
    assert.equal(frame.pageCount, final.pageCount)
    assert.deepEqual(frame.slots, final.slots)
    assert.equal(frame.pageSize, final.pageSize)
  }
})

test('zero-sized mounting container keeps pagination unavailable until measurement succeeds', async t => {
  const h = harness()
  t.after(() => h.dispose())
  h.resize(0, 0)
  await h.settle()
  assert.equal(h.renders.at(-1).pageCount, 0)
  h.resize(1120, 480)
  await h.settle()
  assert.equal(h.renders.at(-1).pageCount, 2)
  assert.equal(h.value.layoutReady, true)
})

test('pending pagination preserves the current page and only clamps once real pages are known', () => {
  const exports = {}
  const source = readFileSync(new URL('./usePageBounds.ts', import.meta.url), 'utf8')
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    {
      exports,
      require: () => ({ useEffect: callback => callback() }),
    }
  )
  const pageChanges = [],
    hoverChanges = []
  const pageRef = { current: 3 }
  const apply = count =>
    exports.usePageBounds(
      3,
      count,
      3,
      page => pageChanges.push(page),
      page => hoverChanges.push(page),
      pageRef
    )
  apply(0)
  assert.equal(pageRef.current, 3)
  assert.deepEqual(pageChanges, [])
  assert.deepEqual(hoverChanges, [])
  apply(2)
  assert.equal(pageRef.current, 1)
  assert.deepEqual(pageChanges, [1])
  assert.deepEqual(hoverChanges, [null])
})

test('ready empty layouts retain one page and drag previews may still add a trailing page', () => {
  assert.equal(getPageCountBySlots([], 32, true), 1)
  assert.equal(getPageCountBySlots(Array(96).fill(null), 32, true), 3)
  assert.equal(getPageCountBySlots(Array(96).fill(null), 1, false), 0)
})

test('fresh capacity uses the rendered cell size for every window, icon, title and Dock combination', async t => {
  for (const [mode, window] of Object.entries(WINDOW_SIZE_CONFIG))
    for (const [size, config] of Object.entries(ICON_SIZE_CONFIG))
      for (const titles of ['one', 'two'])
        for (const dock of [false, true]) {
          const insets = getPagedGridInsets(size, dock)
          const rowHeight = getIconGridRowHeight(size, titles)
          const width = window.width - insets.horizontal * 2
          const height = window.height - insets.top - insets.bottom
          const h = harness({ ...fixture(), read: async () => null })
          t.after(() => h.dispose())
          h.update({
            columnWidth: config.columnWidth,
            rowHeight,
            dockEnabled: dock,
            geometryKey: `${mode}:${size}:${dock}:${getPagedGridGeometrySuffix(titles)}`,
          })
          h.resize(width, height)
          await h.settle()
          assert.equal(h.value.rows, Math.floor((height + 8) / (rowHeight + 8)))
          assert.equal(h.value.columns, Math.floor((width + 8) / (config.columnWidth + 8)))
          assert.equal(h.value.itemHeight, rowHeight)
          assert.ok((h.value.rows + 1) * rowHeight + h.value.rows * 8 > height)
          assert.ok(h.value.rows * rowHeight + (h.value.rows - 1) * 8 <= height)
        }
})

test('window mode changes cannot lock old bounds before native resize completes', async t => {
  const h = harness()
  t.after(() => h.dispose())
  await h.settle()
  const writes = h.writes.length
  h.update({ geometryKey: geometryKey(1280, 720, 1, 'large'), windowGeometryPending: true })
  await h.settle()
  assert.equal(h.value.layoutReady, false)
  assert.equal(h.writes.length, writes)
  h.resize(1472, 660)
  await h.settle()
  assert.equal(h.writes.length, writes, 'intermediate native measurements cannot persist')
  h.update({ windowGeometryPending: false, columnWidth: 76, rowHeight: 93 })
  await h.settle()
  assert.equal(h.value.columns, 17)
  assert.equal(h.value.rows, 6)
  assert.equal(h.value.layoutReady, true)
  assert.equal(h.writes.at(-1)[3], 102)
  assert.ok(
    h.writes.slice(writes).every(args => args[3] === 102 && args[4] === 17),
    'every persisted layout must pair the new configuration with normalized final dimensions'
  )
})

test('capacity migration and title changes retain page/row/column coordinates instead of filling earlier pages', async t => {
  const h = harness()
  t.after(() => h.dispose())
  await h.settle()
  const before = snapshot(h.value).coordinates
  for (const titles of ['two', 'one', 'two']) {
    h.update({
      geometryKey: `${geometryKey(1280, 720)}:${getPagedGridGeometrySuffix(titles)}`,
      columnWidth: 76,
      rowHeight: getIconGridRowHeight('medium', titles),
    })
    h.resize(1152, 480)
    await h.settle()
    assert.equal(h.value.rows, titles === 'one' ? 5 : 4)
    assert.deepEqual(snapshot(h.value).coordinates, before)
    assert.ok(h.writes.at(-1)[5].endsWith(getPagedGridGeometrySuffix(titles)))
  }
})

test('updated capacity remains stable when DPI, resolution, window visibility or focus changes', async t => {
  const h = harness()
  t.after(() => h.dispose())
  const suffix = getPagedGridGeometrySuffix('one')
  h.update({ geometryKey: `${geometryKey(1280, 720)}:${suffix}`, rowHeight: 86, columnWidth: 76 })
  await h.settle()
  const before = snapshot(h.value),
    writes = h.writes.length
  h.resize(0, 0)
  await h.settle()
  h.update({ geometryKey: `${geometryKey(640, 360, 2)}:${suffix}` })
  h.resize(500, 150)
  await h.settle()
  assert.deepEqual(snapshot(h.value), before)
  assert.equal(h.writes.length, writes)
  h.update({ icons: structuredClone(h.params.icons) })
  await h.settle()
  assert.deepEqual(snapshot(h.value), before)
  assert.ok(h.value.layoutReady)
})

test('tightened spacing unlocks a saved four-row layout without moving existing page coordinates', async t => {
  const data = fixture()
  const oldKey = `${geometryKey(1280, 720)}:cells-v2:titles-two`
  const slots = Array(104).fill(null)
  slots[0] = 'a'
  slots[2] = 'folder:work'
  slots[6] = 'large'
  slots[96] = 'last'
  Object.assign(data.layout, { columns: 13, pageSize: 52, slots, geometryKey: oldKey })
  const h = harness(data)
  t.after(() => h.dispose())
  h.update({ columnWidth: 76, rowHeight: getIconGridRowHeight('medium', 'two') })
  h.resize(1152, 478)
  await h.settle()
  assert.equal(h.value.rows, 4)
  const before = snapshot(h.value).coordinates
  const writes = h.writes.length

  const insets = getPagedGridInsets('medium', true)
  h.resize(1152, 720 - insets.top - insets.bottom)
  h.update({ geometryKey: `${geometryKey(1280, 720)}:${getPagedGridGeometrySuffix('two')}` })
  await h.settle()
  assert.equal(h.value.columns, 13)
  assert.equal(h.value.rows, 5)
  assert.deepEqual(snapshot(h.value).coordinates, before)
  assert.ok(h.writes.length > writes)
  assert.ok(h.writes.slice(writes).every(args => args[3] === 65 && args[4] === 13))
})
