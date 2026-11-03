import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)
test('retained page transfers render as inert tiles and never register interactive drag targets', () => {
  const icon = { kind: 'icon', key: 'a', icon: {} }
  const entry = {
    id: 'a',
    item: icon,
    globalIndex: 3,
    localIndex: 3,
    row: 1,
    col: 1,
    span: { cols: 1, rows: 1 },
  }
  const visualRefs = [],
    hitRefs = [],
    sortableRefs = []
  let flight = false,
    receivedOrder
  const modules = {
    react: require('react'),
    'react/jsx-runtime': require('react/jsx-runtime'),
    '@dnd-kit/core': { useDroppable: () => ({ setNodeRef() {} }) },
    '@dnd-kit/sortable': {
      SortableContext: 'sortable',
      useSortable: () => ({
        attributes: { tabIndex: 0 },
        listeners: { onKeyDown() {} },
        setNodeRef: n => sortableRefs.push(n),
      }),
    },
    '../hooks/useCrossPageReorder': {
      useCrossPageReorder: layout => {
        receivedOrder = layout.order
        return {
          entries: [entry],
          flightIds: new Set(flight ? ['a'] : []),
          bindNode: (id, node) => visualRefs.push([id, node]),
        }
      },
    },
    './ResizableIcon': { ResizableIcon: 'icon' },
    './FolderVisuals': { FolderCreatePreview: 'preview' },
    './OuterFolderTile': { OuterFolderTile: 'folder' },
    './WidgetTile': { WidgetTile: 'widget' },
  }
  modules.react = { ...modules.react, useMemo: fn => fn() }
  const compiled = ts.transpileModule(
    readFileSync(new URL('./OuterGridPageLayer.tsx', import.meta.url), 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }
  ).outputText
  const exports = {}
  runInNewContext(compiled, {
    exports,
    require: name => {
      assert.ok(name in modules, name)
      return modules[name]
    },
  })
  const data = {
    page: 0,
    entries: [entry],
    hiddenOuterItemIds: [],
    highlightedOuterItemIds: [],
    dragContext: null,
  }
  const props = {
    data,
    interactive: true,
    pageOrder: ['0', '1', '2', 'a'],
    columns: 2,
    rows: 2,
    itemWidth: 100,
    itemHeight: 120,
    gridGap: 8,
    pageCellCount: 4,
    iconConfig: { imgSize: 48, containerWidth: 60 },
    selectionMode: false,
    selectedSet: new Set(),
    bindTileRef: (id, node) => hitRefs.push([id, node]),
  }
  const normal = exports.OuterGridPageLayer(props)
  const normalWrapper = normal.props.children[2].props.children[0]
  flight = true
  data.entries = []
  props.pageOrder = ['0', '1', '2', null, 'a', null, null, null]
  const tree = exports.OuterGridPageLayer(props)
  const sortable = tree.props.children[2]
  const retained = sortable.props.children[0]
  assert.equal(retained.key, normalWrapper.key)
  assert.equal(retained.type, normalWrapper.type)
  assert.equal(retained.props.disabled, true)
  assert.equal(sortable.props.items.length, 0)
  assert.equal(receivedOrder, props.pageOrder)
  const tile = retained.type(retained.props)
  assert.equal(tile.props.inert, true)
  assert.equal(tile.props['aria-hidden'], true)
  assert.equal(tile.props['data-cross-page-motion'], 'a')
  assert.equal(tile.props.onKeyDown, undefined)
  const node = {}
  tile.props.ref(node)
  assert.equal(visualRefs.at(-1)[1], node)
  assert.equal(hitRefs.at(-1)[1], null)
  assert.equal(sortableRefs.at(-1), null)
})
