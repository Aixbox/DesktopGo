import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as hotseat from '../domain/hotseatLayout.ts'
import { DOCK_GAP } from '../domain/dock.ts'

const require = createRequire(import.meta.url)
function loadDock() {
  const modules = {
    'react/jsx-runtime': require('react/jsx-runtime'),
    react: {
      useRef: value => ({ current: value }),
      useState: value => [value, () => {}],
      useCallback: fn => fn,
      useEffect() {},
      useLayoutEffect() {},
    },
    'lucide-react': { Check: 'check' },
    'framer-motion': { motion: { div: 'motion-div' } },
    '@/lib/i18n': { useI18n() {}, translate: value => value },
    '@/stores/iconStore': { useIconStore: () => ({}) },
    '@/components/icons/IconContextMenu': { IconContextMenu: 'menu' },
    './DockFolderContextMenu': { DockFolderContextMenu: 'folder-menu' },
    '../domain/dock': { DOCK_GAP },
    './folderVisualPolicy': { getDesktopSingleSlotFolderMetrics: () => ({}), scaledRadius: x => x },
    './FolderVisuals': { FolderIconVisual: 'folder' },
    './DockFolderCreatePreview': { DockFolderCreatePreview: 'preview' },
    './WidgetTile': { WidgetTile: 'widget' },
    '../domain/hotseatLayout': hotseat,
    '../hooks/useDocumentDirection': { useDocumentDirection: () => 'ltr' },
    '../hooks/useDockReorderAnimation': { useDockReorderAnimation() {} },
  }
  const source = readFileSync(new URL('./DockBar.tsx', import.meta.url), 'utf8')
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText
  const exports = {}
  runInNewContext(code, {
    exports,
    require: name => {
      assert.ok(name in modules, name)
      return modules[name]
    },
  })
  return exports.DockBar
}
function find(node, predicate, found = []) {
  if (!node || typeof node !== 'object') return found
  if (Array.isArray(node)) {
    node.forEach(child => find(child, predicate, found))
    return found
  }
  if (predicate(node)) found.push(node)
  find(node.props?.children, predicate, found)
  return found
}
test('Dock folder hover keeps the insertion slot and item keys while hiding only the empty-slot indicator', () => {
  const Dock = loadDock()
  const items = ['a', 'b', 'c'].map(id => ({ kind: 'icon', key: id, icon: { path: id, name: id } }))
  const props = {
    displaySlots: ['a', null, 'b', 'c'],
    dockPreviewIndex: 1,
    dragContext: 'dock',
    dragFolderPreviewTargetId: null,
    folderPreviewFreezeTargetId: null,
    folderCreateTransitionTargetId: null,
    itemById: new Map(items.map(item => [item.key, item])),
    iconImageSize: 48,
    iconTileWidth: 100,
    iconTileHeight: 120,
    selectedSet: new Set(),
    selectionMode: false,
    dragPointerRef: { current: null },
  }
  const insert = Dock(props)
  const merge = Dock({ ...props, dragFolderPreviewTargetId: 'b' })
  const back = Dock(props)
  const slots = tree => find(tree, node => node.props?.['data-dock-slot'] !== undefined)
  for (const tree of [insert, merge, back]) {
    assert.equal(tree.props['data-hotseat-count'], 4)
    assert.deepEqual(
      slots(tree).map(node => node.key),
      ['a', 'dock-empty-1', 'b', 'c']
    )
  }
  assert.match(slots(insert)[1].props.children.props.className, /opacity-100/)
  assert.match(slots(merge)[1].props.children.props.className, /opacity-0/)
  assert.match(slots(back)[1].props.children.props.className, /opacity-100/)
})
