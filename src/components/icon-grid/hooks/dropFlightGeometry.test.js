import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { getId } from '../model.ts'

// Load real commit hooks and domain policies; control only React, DOM reads and animation clocks.
async function compileHook(path) {
  const url = new URL(path, import.meta.url)
  const code = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText
  const imports = [...code.matchAll(/require\("([^"]+)"\)/g)].map(match => match[1])
  const modules = Object.fromEntries(
    await Promise.all(
      imports
        .filter(name => name.startsWith('.'))
        .map(async name => [name, await import(new URL(`${name}.ts`, url))])
    )
  )
  return (overrides, globals) => {
    const exports = {}
    runInNewContext(code, {
      ...globals,
      exports,
      require: name => overrides[name] ?? modules[name],
    })
    return Object.values(exports)[0]
  }
}

const hooks = {
  paged: await compileHook('./useDragDropCommit.ts'),
  scroll: await compileHook('../scroll/useScrollableDragDropCommit.ts'),
}

class Matrix {
  constructor(transform) {
    const values = transform.slice(7, -1).split(',').map(Number)
    ;[this.a, this.b, this.c, this.d, this.m41, this.m42] = values
    this.is2D = true
  }
}

function installDom(t) {
  const frames = [],
    timers = []
  const globals = {
    DOMMatrixReadOnly: Matrix,
    window: {
      getComputedStyle: node => node.style,
      setTimeout: callback => timers.push(callback),
      clearTimeout() {},
    },
    requestAnimationFrame: callback => frames.push(callback),
    cancelAnimationFrame() {},
  }
  for (const [key, value] of Object.entries(globals)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key)
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    })
  }
  return { globals, frames, timers }
}

const gridRect = { left: 100, top: 50, width: 1000, height: 600 }
const origin = { x: 600, y: 350 }
const editScale = 0.97

function scaleRect(rect, scale) {
  return {
    left: origin.x + (rect.left - origin.x) * scale,
    top: origin.y + (rect.top - origin.y) * scale,
    width: rect.width * scale,
    height: rect.height * scale,
  }
}

function tileFixture(rect, { editing, measuredScale, translation = { x: 12, y: -8 } }) {
  const grid = {
    closest: () => (editing ? {} : null),
    getBoundingClientRect: () => scaleRect(gridRect, measuredScale),
    style: {
      transform: `matrix(${measuredScale},0,0,${measuredScale},0,0)`,
      getPropertyValue: name => (name === '--launchpad-edit-grid-scale' ? `${editScale}` : ''),
    },
  }
  const target = {
    closest: () => grid,
    getBoundingClientRect: () =>
      scaleRect(
        { ...rect, left: rect.left + translation.x, top: rect.top + translation.y },
        measuredScale
      ),
  }
  return {
    querySelector: () => target,
    style: { transform: `matrix(1,0,0,1,${translation.x},${translation.y})` },
  }
}

function reactHarness() {
  const cells = []
  let cursor = 0
  return {
    react: {
      useEffect() {},
      useRef(value) {
        return (cells[cursor++] ??= { current: value })
      },
      useState(initial) {
        const index = cursor++
        if (!(index in cells)) cells[index] = initial
        return [
          cells[index],
          value => {
            cells[index] = typeof value === 'function' ? value(cells[index]) : value
          },
        ]
      },
    },
    render(hook, props) {
      cursor = 0
      return hook(props)
    },
  }
}

function dropFixture(items, geometry) {
  const draggingIds = items.map(getId)
  const slots = [...draggingIds, ...Array(64 - items.length).fill(null)]
  const session = {
    context: 'outer',
    sourceFolderId: null,
    pointerId: 1,
    dragStartedAt: 0,
    draggingId: draggingIds[0],
    draggingItem: items[0],
    draggingIds,
    pointerX: 450,
    pointerY: 320,
    offsetX: 0,
    offsetY: 0,
    workingOrder: slots,
    sourceSlotIndex: 0,
    previewSlotIndex: 16,
    dockPreviewIndex: null,
    hoverTargetId: null,
    hoverZone: null,
    hoverIou: 0,
    folderPreviewTargetId: null,
    initialCenters: {},
  }
  const rects = items.map((item, index) => ({
    left: 200 + index * 300,
    top: 180 + index * 100,
    width:
      item.kind === 'folder'
        ? Number(item.size[0]) * 96 - 8
        : 64 + (Number(item.size?.[0] ?? 1) - 1) * 96,
    height:
      item.kind === 'folder'
        ? Number(item.size[2]) * 110 - 42
        : 64 + (Number(item.size?.[2] ?? 1) - 1) * 110,
  }))
  const props = {
    reorderAnimationMs: 220,
    iconConfig: { imgSize: 64 },
    columns: 8,
    pageSizeRef: { current: 64 },
    itemsRef: { current: items },
    outerSlotsRef: { current: slots },
    dockKeysRef: { current: [] },
    hotseatEntriesRef: { current: [] },
    dragRef: { current: session },
    tileRefs: {
      current: new Map(items.map((item, i) => [getId(item), tileFixture(rects[i], geometry)])),
    },
    setItems() {},
    setOuterSlots() {},
    setDockKeys() {},
    setHotseatEntries() {},
    setDragState() {},
    clearEdgeSwitchTimer() {},
    resolveNearestDropOrderByContext: () => slots,
    resolveNearestSlotIndexByContext: () => 16,
  }
  return { props, rects, session }
}

function flightRect(flight) {
  return {
    left: flight.endLeft + (flight.width * (1 - flight.endScale)) / 2,
    top: flight.endTop + (flight.height * (1 - flight.endScale)) / 2,
    width: flight.width * flight.endScale,
    height: flight.height * flight.endScale,
  }
}

const icon = (key, size) => ({ kind: 'icon', key, size, icon: { name: key, path: key } })
const folder = size => ({ kind: 'folder', id: 'folder', size, name: 'Folder', children: [] })

for (const [mode, createHook] of Object.entries(hooks)) {
  for (const editing of [false, true]) {
    test(`${mode}: drop handoff matches the final grid when selection mode is ${editing}`, t => {
      const { globals, frames, timers } = installDom(t)
      for (const measuredScale of [0.97, 0.985, 1]) {
        for (const items of [
          [icon('a')],
          [icon('a'), icon('b')],
          ...['1x1', '1x2', '2x1', '2x2'].map(size => [folder(size)]),
          ...['1x2', '2x1', '2x2'].flatMap(size => [
            [icon('a', size)],
            [icon('a', size), icon('b', size)],
          ]),
        ]) {
          const { props, rects } = dropFixture(items, { editing, measuredScale })
          const react = reactHarness()
          const hook = createHook(
            { react: react.react, 'framer-motion': { useReducedMotion: () => false } },
            globals
          )
          assert.equal(react.render(hook, props).finishDrag(1), true)
          assert.equal(props.dragRef.current, null)
          frames.shift()()
          const result = react.render(hook, props)
          assert.equal(result.multiDropFlight.length, items.length)
          result.multiDropFlight.forEach((flight, i) => {
            const expected = scaleRect(rects[i], editing ? editScale : 1)
            const actual = flightRect(flight)
            for (const key of ['left', 'top', 'width', 'height']) {
              assert.ok(
                Math.abs(actual[key] - expected[key]) < 1e-8,
                `${items[i].kind}/${items[i].size ?? items.length}/${measuredScale}: ${key}, ${actual[key]} != ${expected[key]}`
              )
            }
          })
          // The real item is revealed before the flight is removed; their final rectangles must coincide.
          timers.shift()()
          assert.equal(react.render(hook, props).hiddenOuterItemIds.length, 0)
          timers.shift()()
          assert.equal(react.render(hook, props).multiDropFlight, null)
        }
      }
    })
  }
}

for (const [mode, createHook] of Object.entries(hooks)) {
  test(`${mode}: folder merge keeps the target preview visible until committing its original size`, t => {
    const { globals, timers } = installDom(t)
    for (const size of ['1x1', '1x2', '2x1', '2x2']) {
      const source = icon('source', '2x2')
      const target = icon('target', size)
      const { props, session } = dropFixture([source, target], { editing: false, measuredScale: 1 })
      session.draggingIds = ['source']
      session.folderPreviewTargetId = 'target'
      const slotRect = { left: 320, top: 240, width: 32, height: 32 }
      props.tileRefs.current.set('target', {
        querySelector: selector => {
          assert.equal(selector, '[data-folder-create-drop-slot]')
          return { getBoundingClientRect: () => slotRect, closest: () => null }
        },
      })
      const react = reactHarness()
      const hook = createHook(
        { react: react.react, 'framer-motion': { useReducedMotion: () => false } },
        globals
      )
      assert.equal(react.render(hook, props).finishDrag(1), true)
      const pending = react.render(hook, props)
      assert.equal(pending.folderPreviewFreezeTargetId, 'target')
      assert.equal(pending.hiddenOuterItemIds.includes('target'), false)
      assert.equal(pending.folderDropFlight.endX, 336)
      assert.equal(pending.folderDropFlight.endY, 256)
      assert.equal(props.itemsRef.current.includes(target), true)
      timers.shift()()
      const folder = props.itemsRef.current.find(item => item.kind === 'folder')
      assert.equal(folder.size, size)
      assert.equal(props.outerSlotsRef.current[1], getId(folder))
      const committed = react.render(hook, props)
      assert.equal(committed.folderDropFlight, null)
      assert.equal(committed.folderPreviewFreezeTargetId, null)
      assert.equal(committed.hiddenOuterItemIds.length, 0)
      timers.splice(0)
    }
  })
}
