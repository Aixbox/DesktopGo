import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as layout from '../domain/topLevelLayout.ts'

const require = createRequire(import.meta.url)
const exports = {}
const motion = {
  pageTransition: null,
  oldPageLayerRef: {},
  currentPageLayerRef: {},
  peekLayerRef: {},
}
const code = ts.transpileModule(
  readFileSync(new URL('./OuterGridView.tsx', import.meta.url), 'utf8'),
  {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }
).outputText
const modules = {
  react: { useMemo: fn => fn() },
  'react/jsx-runtime': require('react/jsx-runtime'),
  '@dnd-kit/core': { DndContext: 'DndContext', closestCenter: () => {} },
  'lucide-react': { ChevronLeft: 'Left', ChevronRight: 'Right' },
  '../hooks/gridItemResizeContext': { GridItemResizeContext: { Provider: 'ResizeProvider' } },
  '../domain/topLevelLayout': layout,
  './OuterGridPageLayer': { OuterGridPageLayer: 'PageLayer' },
  '../hooks/useOuterPageMotion': { useOuterPageMotion: () => motion },
}
runInNewContext(code, {
  exports,
  require: name => {
    assert.ok(name in modules, `Unexpected import: ${name}`)
    return modules[name]
  },
})

function collect(node, predicate) {
  if (Array.isArray(node)) return node.flatMap(value => collect(value, predicate))
  if (!node?.props) return []
  return [...(predicate(node) ? [node] : []), ...collect(node.props.children, predicate)]
}
function render(page, direction = 1, preview = true) {
  const items = [
    { kind: 'icon', key: 'first', icon: {} },
    { kind: 'folder', id: 'middle', name: 'Folder', size: '1x1', children: [] },
    { kind: 'widget', id: 'last', widgetType: 'clock', spanX: 1, spanY: 1 },
  ]
  const ids = ['first', 'folder:middle', 'widget:last']
  const pageOrder = ids.flatMap(id => [id, null, null, null])
  const pageSwipe = {
    trackRef: {},
    preview: preview ? { page, width: 1000, direction, pageCount: 3 } : null,
  }
  const props = {
    currentPage: page,
    columns: 2,
    rows: 2,
    pageCellCount: 4,
    pageOrder,
    pageAnchorEntries: layout.getPageAnchorEntries(pageOrder, items, page, 4, 2),
    itemById: new Map(ids.map((id, i) => [id, items[i]])),
    pageSwipe,
    gridWidth: 872,
    gridHeight: 600,
    hiddenOuterItemIds: [],
    highlightedOuterItemIds: [],
  }
  return { tree: exports.OuterGridView(props), pageSwipe, ids }
}

for (const direction of [1, -1]) {
  test(`both real neighbors share the drag track and stay inert (${direction})`, () => {
    const { tree, pageSwipe, ids } = render(1, direction)
    const [track] = collect(tree, n => n.props['data-page-swipe-track'] === true)
    assert.equal(track.ref ?? track.props.ref, pageSwipe.trackRef)
    const neighbors = collect(track, n => n.props['data-page-swipe-neighbor'] !== undefined)
    assert.equal(neighbors.length, 2)
    for (const neighbor of neighbors) {
      const page = neighbor.props['data-page-swipe-neighbor']
      assert.equal(
        neighbor.props.style.transform,
        `translate3d(${(page - 1) * 1000 * direction}px, 0, 0)`
      )
      assert.equal(neighbor.props.inert, true)
      assert.equal(neighbor.props['aria-hidden'], 'true')
      const [layer] = collect(neighbor, n => n.type === 'PageLayer')
      assert.equal(layer.props.interactive, false)
      assert.equal(layer.props.data.page, page)
      assert.equal(layer.props.data.entries[0].id, ids[page])
    }
    const layers = collect(track, n => n.type === 'PageLayer')
    assert.equal(layers.filter(n => n.props.interactive).length, 1)
    assert.equal(layers.find(n => n.props.interactive).props.data.page, 1)
  })
}

for (const page of [0, 2]) {
  test(`page ${page} renders only its existing neighbor`, () => {
    const { tree } = render(page)
    const neighbors = collect(tree, n => n.props['data-page-swipe-neighbor'] !== undefined)
    assert.equal(neighbors.length, 1)
    assert.equal(neighbors[0].props['data-page-swipe-neighbor'], 1)
  })
}

test('idle pages do not mount hidden neighbors or duplicate sortable targets', () => {
  const { tree } = render(1, 1, false)
  assert.equal(collect(tree, n => n.props['data-page-swipe-neighbor'] !== undefined).length, 0)
  assert.equal(collect(tree, n => n.type === 'PageLayer').length, 1)
})
