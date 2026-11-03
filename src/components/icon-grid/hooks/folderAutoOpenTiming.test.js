import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { useScrollableFolderDragController } from '../scroll/useScrollableFolderDragController.ts'

async function loadWorkflow(path) {
  const url = new URL(path, import.meta.url)
  const code = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText
  const imports = [...code.matchAll(/require\("([^"]+)"\)/g)].map(match => match[1])
  const modules = Object.fromEntries(
    await Promise.all(
      imports
        .filter(name => name.startsWith('.') && !/\/use[A-Z]/.test(name))
        .map(async name => [name, await import(new URL(`${name}.ts`, url))])
    )
  )
  return (overrides, clock) => {
    const exports = {}
    runInNewContext(code, {
      exports,
      window: clock,
      require: name => {
        if (name in overrides) return overrides[name]
        if (name in modules) return modules[name]
        const hookName = name.split('/').at(-1)
        assert.match(hookName, /^use[A-Z]/)
        return { [hookName]: () => ({}) }
      },
    })
    return Object.values(exports)[0]
  }
}

const workflows = {
  paged: await loadWorkflow('./useIconGridDragWorkflow.ts'),
  scroll: await loadWorkflow('../scroll/useScrollableIconGridDragWorkflow.ts'),
}
const ref = current => ({ current })
const noop = () => {}

function harness(t, load, mode) {
  let now = 0,
    id = 0,
    processor
  const timers = new Map(),
    opened = []
  const clock = {
    setTimeout: (callback, delay) => {
      timers.set(++id, { callback, due: now + delay })
      return id
    },
    clearTimeout: timerId => timers.delete(timerId),
  }
  const oldWindow = globalThis.window
  globalThis.window = clock
  t.after(() => {
    globalThis.window = oldWindow
  })
  const source = { kind: 'icon', key: 'source', icon: {} }
  const target = { kind: 'folder', id: 'target', size: '2x2', children: [] }
  const hitAt = state => ({
    targetId: 'folder:target',
    zone: state.pointerX < 75 ? 'center' : 'right',
  })
  const geometry = {
    findTopLevelMaxOverlapHit: hitAt,
    findCompactScrollGroupOverlapHit: hitAt,
    resolveCompactScrollHoverZone: (_state, _target, hit) => hit.zone,
  }
  const commit = { commitIntoExistingFolderForAutoOpen: () => [source] }
  const captureProcessor = params => {
    processor = params
    return noop
  }
  const hook = load(
    {
      react: { useRef: ref, useState: value => [value, noop], useEffect: noop },
      './useEdgeAutoPaging': { useEdgeAutoPaging: () => ({ clearEdgeSwitchTimer: noop }) },
      '../hooks/useEdgeAutoPaging': { useEdgeAutoPaging: () => ({ clearEdgeSwitchTimer: noop }) },
      './usePagedDragGeometryController': { usePagedDragGeometryController: () => geometry },
      './useScrollableDragGeometryController': {
        useScrollableDragGeometryController: () => geometry,
      },
      './usePagedDragMoveProcessor': { usePagedDragMoveProcessor: captureProcessor },
      './useScrollableDragMoveProcessor': { useScrollableDragMoveProcessor: captureProcessor },
      './useDragDropCommit': { useDragDropCommit: () => commit },
      './useScrollableDragDropCommit': { useScrollableDragDropCommit: () => commit },
      './useScrollableFolderDragController': { useScrollableFolderDragController },
    },
    clock
  )
  const runtime = hook({
    config: {},
    selectedIconKeys: [],
    itemById: new Map([
      ['folder:target', target],
      ['source', source],
    ]),
    itemsRef: ref([source, target]),
    iconConfig: { imgSize: 64 },
    outerDropMode: mode === 'compact' ? 'compact-page' : 'paged',
    containerRef: ref(null),
    folderTileRefs: ref(new Map()),
    onOpenFolder: id => opened.push(id),
    setOpenFolderId: noop,
  })
  const state = {
    context: 'outer',
    draggingItem: source,
    draggingId: 'source',
    draggingIds: ['source'],
    pointerId: 1,
    pointerX: 50,
    pointerY: 50,
    workingOrder: ['folder:target'],
    folderPreviewTargetId: 'folder:target',
    hoverTargetId: 'folder:target',
    hoverZone: 'center',
  }
  return {
    timers,
    opened,
    runtime,
    enter() {
      processor.publishMoveDragState({ ...state })
      processor.scheduleFolderAutoOpen('folder:target')
    },
    leave() {
      processor.publishMoveDragState({ ...state, hoverZone: 'right', pointerX: 90 })
    },
    advance(ms) {
      now += ms
      for (const [id, timer] of [...timers]) {
        if (timer.due > now) continue
        timers.delete(id)
        timer.callback()
      }
    },
  }
}

for (const mode of ['paged', 'scroll', 'compact']) {
  const load = mode === 'paged' ? workflows.paged : workflows.scroll
  test(`${mode}: leaving the opening area resets the full 500ms dwell even if the drop preview remains`, t => {
    const h = harness(t, load, mode)
    h.enter()
    h.advance(400)
    assert.equal(h.opened.length, 0)
    h.leave()
    assert.equal(h.timers.size, 0)
    h.advance(50)
    h.enter()
    h.advance(499)
    assert.equal(h.opened.length, 0)
    h.advance(1)
    assert.deepEqual(h.opened, ['target'])
    assert.equal(h.runtime.dragRef.current.context, 'folder')
  })
  test(`${mode}: timeout rechecks the latest pointer before opening`, t => {
    const h = harness(t, load, mode)
    h.enter()
    h.runtime.dragPointerRef.current = { pointerX: 90, pointerY: 50 }
    h.advance(500)
    assert.equal(h.opened.length, 0)
    assert.equal(h.runtime.dragRef.current.context, 'outer')
  })
}
