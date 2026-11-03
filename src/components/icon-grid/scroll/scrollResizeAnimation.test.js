import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { getId } from '../model.ts'
import { buildScrollGroupEntries } from './scrollGroupLayout.ts'

async function loadHook(path) {
  const url = new URL(path, import.meta.url)
  const code = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const names = [...code.matchAll(/require\("([^"]+)"\)/g)].map(match => match[1])
  const modules = Object.fromEntries(
    await Promise.all(
      names
        .filter(name => name.startsWith('.'))
        .map(async name => [name, await import(new URL(`${name}.ts`, url))])
    )
  )
  return overrides => {
    const exports = {}
    runInNewContext(code, {
      exports,
      window: globalThis.window,
      document: globalThis.document,
      require: name => overrides[name] ?? modules[name],
    })
    return Object.values(exports)[0]
  }
}
const loadResize = await loadHook('../hooks/useGridItemResizeController.ts')
const loadWorkflow = await loadHook('./useScrollableOuterGridDragWorkflow.ts')

function hooks() {
  const cells = [],
    effects = []
  let cursor = 0
  const dependenciesChanged = (previous, next) =>
    !previous || !next || next.some((value, i) => value !== previous[i])
  const effect = (callback, deps) => {
    const index = cursor++
    if (!dependenciesChanged(cells[index]?.deps, deps)) return
    effects.push(() => {
      cells[index]?.cleanup?.()
      cells[index] = { deps, cleanup: callback() }
    })
  }
  return {
    react: {
      useRef: initial => (cells[cursor++] ??= { current: initial }),
      useState: initial => {
        const index = cursor++
        if (!(index in cells)) cells[index] = typeof initial === 'function' ? initial() : initial
        return [
          cells[index],
          value => {
            cells[index] = typeof value === 'function' ? value(cells[index]) : value
          },
        ]
      },
      useMemo: (callback, deps) => {
        const index = cursor++
        if (dependenciesChanged(cells[index]?.deps, deps))
          cells[index] = { deps, value: callback() }
        return cells[index].value
      },
      useEffect: effect,
      useLayoutEffect: effect,
    },
    render: callback => {
      cursor = 0
      return callback()
    },
    flush: () => {
      effects.splice(0).forEach(callback => callback())
    },
    dispose: () => cells.forEach(cell => cell?.cleanup?.()),
  }
}

function fixture(t, kind, reducedMotion = false, scale = 1) {
  const oldWindow = globalThis.window,
    oldDocument = globalThis.document
  globalThis.window = { addEventListener() {}, removeEventListener() {}, clearTimeout() {} }
  globalThis.document = { addEventListener() {}, removeEventListener() {} }
  t.after(() => {
    globalThis.window = oldWindow
    globalThis.document = oldDocument
  })
  const resized =
    kind === 'folder'
      ? { kind, id: 'resized', name: 'Folder', size: '1x1', children: [] }
      : { kind, key: 'resized', icon: {} }
  const items = [
    resized,
    ...Array.from({ length: 10 }, (_, i) => ({ kind: 'icon', key: `neighbor-${i}`, icon: {} })),
  ]
  const ids = items.map(getId),
    nodes = new Map(),
    animations = []
  const external = { current: null }
  const resizeHooks = hooks(),
    workflowHooks = hooks()
  const useResize = loadResize({ react: resizeHooks.react })
  const useWorkflow = loadWorkflow({
    react: workflowHooks.react,
    'framer-motion': { useReducedMotion: () => reducedMotion },
    '@dnd-kit/core': { useSensor() {}, useSensors() {} },
    '@dnd-kit/sortable': {},
  })
  const params = {
    items,
    itemsRef: { current: items },
    dockKeysRef: { current: [] },
    dockEnabled: false,
    outerSlotsRef: { current: [...ids, ...Array(16 - ids.length).fill(null)] },
    columns: 4,
    pageSizeRef: { current: 16 },
    layoutDimensionsTracker: { read: () => ({ columns: 4, pageSize: 16 }) },
    setItems: items => {
      params.items = items
    },
    setOuterSlots: slots => {
      params.outerSlotsRef.current = slots
    },
    onBeforeLayoutChange: () => {
      external.current = new Map([...nodes].map(([id, node]) => [id, node.getBoundingClientRect()]))
    },
  }
  const render = () => {
    const resize = resizeHooks.render(() => useResize(params))
    const entries = buildScrollGroupEntries(ids, resize.renderItemById, 4)
    const workflow = workflowHooks.render(() =>
      useWorkflow({
        committedEntries: entries,
        committedItemIds: ids,
        activeItemById: resize.renderItemById,
        activeSection: { groupId: 'group' },
        layoutColumns: 4,
        itemWidth: 96,
        itemHeight: 110,
        gridGap: 8,
        externalGridFlipPositionsRef: external,
        reorderAnimationMs: 300,
      })
    )
    for (const entry of entries) {
      let node = nodes.get(entry.id)
      if (!node) {
        node = {
          style: {},
          offsetWidth: 96,
          offsetHeight: 110,
          left: 0,
          top: 0,
          dx: 0,
          dy: 0,
          getBoundingClientRect() {
            return {
              left: (this.left + this.dx) * scale,
              top: (this.top + this.dy) * scale,
              width: this.offsetWidth * scale,
              height: this.offsetHeight * scale,
            }
          },
          animate(frames, options) {
            const [x, y] = frames[0].transform.match(/-?[\d.]+(?=px)/g).map(Number)
            this.dx = x
            this.dy = y
            const animation = {
              id: entry.id,
              frames,
              options,
              cancelled: false,
              cancel: () => {
                animation.cancelled = true
                this.dx = this.dy = 0
                animation.oncancel?.()
              },
            }
            animations.push(animation)
            return animation
          },
        }
        nodes.set(entry.id, node)
      }
      node.left = entry.col * 104
      node.top = entry.row * 118
      node.offsetWidth = entry.span.cols * 104 - 8
      node.offsetHeight = entry.span.rows * 118 - 8
      workflow.gridItemRefs.current.set(entry.id, node)
    }
    workflowHooks.flush()
    return resize
  }
  t.after(() => workflowHooks.dispose())
  const sampleMotion = progress =>
    nodes.forEach(node => {
      node.dx *= 1 - progress
      node.dy *= 1 - progress
    })
  return { render, params, nodes, animations, external, sampleMotion, id: ids[0] }
}

for (const kind of ['icon', 'folder']) {
  test(`${kind}: scroll resize animates neighbors from the displayed positions through growth, retarget and cancel`, t => {
    const h = fixture(t, kind)
    h.render().actions.preview(h.id, '2x2')
    assert.ok(h.external.current, 'resize must capture before React changes the grid')
    h.render()
    assert.ok(h.animations.some(animation => animation.id === 'neighbor-0'))
    assert.equal(
      h.nodes.get('neighbor-0').getBoundingClientRect().left,
      104,
      'first frame retains original position'
    )
    assert.equal(h.nodes.get('neighbor-0').left, 208, 'CSS grid already owns the new destination')
    for (const size of ['1x2', '2x1']) {
      h.sampleMotion(0.5)
      const before = h.nodes.get('neighbor-0').getBoundingClientRect()
      h.render().actions.preview(h.id, size)
      h.render()
      assert.deepEqual(
        h.nodes.get('neighbor-0').getBoundingClientRect(),
        before,
        'retarget starts at the visible pose'
      )
    }
    h.sampleMotion(0.5)
    const beforeCancel = h.nodes.get('neighbor-0').getBoundingClientRect()
    h.render().actions.cancel()
    h.render()
    assert.deepEqual(h.nodes.get('neighbor-0').getBoundingClientRect(), beforeCancel)
    assert.equal(
      h.nodes.get('neighbor-0').left,
      104,
      'cancel animates back to the committed layout'
    )
    assert.equal(h.params.items[0].size ?? '1x1', '1x1')
  })
  test(`${kind}: releasing a resize preserves in-flight motion and commits the preview size`, t => {
    const h = fixture(t, kind)
    h.render().actions.preview(h.id, '2x2')
    h.render()
    h.sampleMotion(0.6)
    const before = h.nodes.get('neighbor-0').getBoundingClientRect()
    const animationCount = h.animations.length
    h.render().actions.commit(h.id, '2x2')
    assert.equal(h.render().plan, null)
    assert.equal(h.params.items[0].size, '2x2')
    assert.deepEqual(h.nodes.get('neighbor-0').getBoundingClientRect(), before)
    assert.equal(h.nodes.get('neighbor-0').left, 208)
    assert.equal(
      h.animations.length,
      animationCount,
      'release must continue the existing animation'
    )
  })
}

test('scroll resize honors reduced motion without dropping the new layout or its rollback', t => {
  const h = fixture(t, 'folder', true)
  h.render().actions.preview(h.id, '2x2')
  h.render()
  assert.equal(h.nodes.get('neighbor-0').left, 208)
  assert.equal(h.animations.length, 0)
  h.render().actions.cancel()
  h.render()
  assert.equal(h.nodes.get('neighbor-0').left, 104)
  assert.equal(h.external.current, null)
})

test('scroll reorder translates in local pixels while the grid is scaled for editing', t => {
  const h = fixture(t, 'icon', false, 0.97)
  h.render().actions.preview(h.id, '2x2')
  h.render()
  assert.ok(Math.abs(h.nodes.get('neighbor-0').getBoundingClientRect().left - 104 * 0.97) < 1e-9)
  h.sampleMotion(0.5)
  const before = h.nodes.get('neighbor-0').getBoundingClientRect()
  h.render().actions.preview(h.id, '1x2')
  h.render()
  const after = h.nodes.get('neighbor-0').getBoundingClientRect()
  assert.ok(Math.abs(after.left - before.left) < 1e-9)
  assert.ok(Math.abs(after.top - before.top) < 1e-9)
})
