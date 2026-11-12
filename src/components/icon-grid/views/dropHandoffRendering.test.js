import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as gridTypes from '../../../types/index.ts'
import * as visualPolicy from './folderVisualPolicy.ts'
import * as iconMetrics from './iconTileMetrics.ts'
import * as slots from '../domain/slots.ts'
import * as widgetResize from '../domain/widgetResize.ts'

const require = createRequire(import.meta.url)
const noop = () => {}
const react = {
  ...require('react'),
  memo: component => component,
  useMemo: callback => callback(),
  useCallback: callback => callback,
  useRef: value => ({ current: value }),
  useState: value => [value, noop],
  useEffect: noop,
}
const modules = {
  react,
  'react/jsx-runtime': require('react/jsx-runtime'),
  'framer-motion': {
    AnimatePresence: 'presence',
    motion: { div: 'div' },
    useReducedMotion: () => false,
  },
  '@dnd-kit/core': { DndContext: 'dnd', DragOverlay: 'overlay', useDroppable: () => ({}) },
  '@dnd-kit/sortable': { SortableContext: 'sortable', useSortable: () => ({}) },
  '../hooks/gridItemResizeContext': { GridItemResizeContext: { Provider: 'provider' } },
  '../hooks/useCrossPageReorder': {
    useCrossPageReorder: ({ entries }) => ({ entries, flightIds: new Set(), bindNode: noop }),
  },
  '../scroll/useScrollableOuterGridDragWorkflow': {
    useScrollableOuterGridDragWorkflow: ({ committedEntries }) => ({
      entries: committedEntries,
      gridItemRefs: { current: new Map() },
    }),
  },
  '../../../stores/iconStore': { useIconStore: select => select({ titleLineCount: 'two' }) },
  '../../../lib/i18n': { translate: value => value },
  '@/lib/i18n': { translate: value => value, useI18n: noop },
  '@/components/ui/native-scroll-area': { NativeScrollArea: 'scroll' },
  '@/components/ui/input': { Input: 'input' },
  '../../../types': gridTypes,
  './folderVisualPolicy': visualPolicy,
  './iconTileMetrics': iconMetrics,
  '../domain/widgetResize': widgetResize,
  '../domain/slots': slots,
  '../../Icon': { Icon: 'icon' },
  './ResizableIcon': { ResizableIcon: 'icon' },
  './OuterFolderTile': { OuterFolderTile: 'folder' },
  './WidgetTile': { WidgetTile: 'widget' },
  './FolderVisuals': { FolderCreatePreview: 'preview' },
  './ScrollableGroupNavigation': { ScrollableGroupNavigation: 'navigation' },
}
function loadView(name) {
  const code = ts.transpileModule(readFileSync(new URL(`./${name}.tsx`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const exports = {}
  runInNewContext(code, {
    exports,
    window: { innerWidth: 1000 },
    require: key => modules[key] ?? require(key),
  })
  return exports[name]
}
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes)
  if (!tree?.props) return []
  if (typeof tree.type === 'function') return nodes(tree.type(tree.props))
  return [tree, ...nodes(tree.props.children)]
}
function assertImmediateVisibility(node, hidden) {
  assert.ok(node, 'the real tile must remain mounted')
  assert.match(node.props.className, hidden ? /\bopacity-0\b/ : /\bopacity-100\b/)
  assert.doesNotMatch(node.props.className, /\btransition-(?:opacity|all)\b/)
  assert.doesNotMatch(node.props.style?.transition ?? '', /opacity|all/)
}
const widget = {
  kind: 'widget',
  id: 'widget',
  label: 'Widget',
  provider: 'test',
  spanX: 2,
  spanY: 2,
  minSpanX: 1,
  minSpanY: 1,
  maxSpanX: 3,
  maxSpanY: 3,
}
const items = [
  { kind: 'icon', key: 'app', icon: {} },
  { kind: 'icon', key: 'large', size: '2x2', icon: {} },
  { kind: 'folder', id: 'folder', name: 'Folder', size: '2x2', children: [] },
  widget,
]
for (const name of ['OuterGridPageLayer', 'ScrollableOuterGridView']) {
  const View = loadView(name)
  test(`${name}: all restored item kinds are immediately visible without an alpha fade`, () => {
    for (const item of items) {
      const entry = { id: 'entry', item, row: 0, col: 0, span: { cols: 2, rows: 2 } }
      for (const hidden of [false, true, false]) {
        const hiddenOuterItemIds = hidden ? ['entry'] : []
        const tree = View({
          data: { page: 0, entries: [entry], hiddenOuterItemIds, highlightedOuterItemIds: [] },
          activeSection: { entries: [entry], meta: { itemIds: ['entry'] } },
          sections: [],
          interactive: true,
          columns: 2,
          rows: 2,
          pageCellCount: 4,
          itemWidth: 96,
          itemHeight: 110,
          gridGap: 8,
          iconConfig: { imgSize: 64 },
          selectedSet: new Set(),
          hiddenOuterItemIds,
          highlightedOuterItemIds: [],
          bindTileRef: noop,
        })
        const tile = nodes(tree).find(node => node.props.style?.gridColumn)
        assertImmediateVisibility(tile, hidden)
      }
    }
  })
}

test('folder contents swap with their drag preview without fading the original artwork', () => {
  const View = loadView('FolderModalView')
  const icon = { kind: 'icon', key: 'app', icon: {} }
  for (const hidden of [false, true, false]) {
    const tree = View({
      openFolder: { ...items[2], children: [icon] },
      folderRenderOrder: ['app'],
      folderItemById: new Map([['app', icon]]),
      hiddenItemIds: new Set(hidden ? ['app'] : []),
      selectedSet: new Set(),
      folderColumns: 1,
      folderItemWidth: 96,
      folderItemHeight: 110,
      maxModalWidth: 620,
      maxModalHeight: 480,
    })
    const tile = nodes(tree).find(node => node.props['data-folder-rank'] === 0)
    assertImmediateVisibility(tile, hidden)
  }
})

test('widget preview keeps its normal fill opacity while disabling resize controls', () => {
  const View = loadView('WidgetTile')
  const props = {
    widget,
    span: { cols: 2, rows: 2 },
    slotWidth: 96,
    slotHeight: 110,
    gridGap: 8,
    onResize: noop,
  }
  const normal = View(props)
  const preview = View({ ...props, onResize: undefined })
  assert.equal(preview.props.className, normal.props.className)
  assert.equal(preview.props.style.opacity, normal.props.style.opacity)
  assert.ok(nodes(normal).some(node => node.type === 'button'))
  assert.ok(!nodes(preview).some(node => node.type === 'button'))
})
