import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as model from '../model.ts'
import * as visuals from './folderVisualPolicy.ts'

const require = createRequire(import.meta.url)
function load(path, modules, globals = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const exports = {}
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    { exports, ...globals, require: name => modules[name] ?? require(name) }
  )
  return exports
}
const menu = {
  MenuItem: 'MenuItem',
  MenuSeparator: 'MenuSeparator',
  MenuShortcut: 'MenuShortcut',
  MenuRadioGroup: 'MenuRadioGroup',
  MenuRadioItem: 'MenuRadioItem',
}
const submenu = {
  MenuSub: 'MenuSub',
  MenuSubTrigger: 'MenuSubTrigger',
  MenuSubContent: 'MenuSubContent',
}

test('shared size submenu lists four sizes, marks the current value and commits only a new valid size', () => {
  const { GridItemSizeMenu } = load('./GridItemSizeMenu.tsx', {
    '../../ui/menu': menu,
    '../../ui/menu-submenu': submenu,
    '../../icons/focusedItemMenuContext': { useItemMenuId: () => 'owned-menu' },
    './folderVisualPolicy': visuals,
  })
  for (const size of ['1x1', '1x2', '2x1', '2x2']) {
    const calls = []
    const tree = GridItemSizeMenu({ label: '图标大小', size, onResize: next => calls.push(next) })
    assert.equal(tree.type, 'MenuSub')
    const [trigger, content] = tree.props.children
    assert.equal(trigger.type, 'MenuSubTrigger')
    assert.equal(content.type, 'MenuSubContent')
    assert.equal(content.props['data-focused-menu-owner'], 'owned-menu')
    assert.equal(content.props['data-focused-item-menu'], true)
    const group = content.props.children
    assert.equal(group.props.value, size)
    assert.deepEqual(
      Array.from(group.props.children, option => option.props.value),
      ['1x1', '1x2', '2x1', '2x2']
    )
    group.props.onValueChange(size)
    group.props.onValueChange('4x4')
    assert.deepEqual(calls, [])
    for (const next of ['1x1', '1x2', '2x1', '2x2'].filter(value => value !== size)) {
      group.props.onValueChange(next)
    }
    assert.equal(calls.length, 3)
  }
})

test('folder menu moves size choices into the shared submenu and preserves the folder resize callback', () => {
  const calls = []
  const { OuterFolderTile } = load('./OuterFolderTile.tsx', {
    react: { memo: value => value },
    '../../../lib/i18n': { translate: text => text },
    '../../../stores/iconStore': { useIconStore: selector => selector({ titleLineCount: 'two' }) },
    '../../ui/menu': menu,
    '../../icons/FocusedItemMenu': { FocusedItemMenu: 'FocusedItemMenu' },
    '../model': model,
    './folderVisualPolicy': visuals,
    './GridItemSizeMenu': { GridItemSizeMenu: 'GridItemSizeMenu' },
    './FolderTileContents': { FolderTileContents: 'FolderTileContents' },
    '../hooks/useDocumentDirection': { useDocumentDirection: () => 'ltr' },
  })
  const tree = OuterFolderTile({
    folder: { id: 'work', kind: 'folder', name: 'Work', size: '2x1', children: [] },
    span: { cols: 2, rows: 1 },
    slotWidth: 96,
    slotHeight: 112,
    gridGap: 8,
    onResizeFolder: (...args) => calls.push(args),
  })
  assert.equal(
    tree.props.children.some(child => child.type === 'MenuRadioGroup'),
    false
  )
  const sizes = tree.props.children.find(child => child.type === 'GridItemSizeMenu')
  assert.equal(sizes.props.label, '文件夹大小')
  assert.equal(sizes.props.size, '2x1')
  sizes.props.onResize('2x2')
  assert.deepEqual(calls, [['work', '2x2']])
})

test('icon menu exposes resizing only for resizable tiles and retains the native menu action', () => {
  const systemCalls = [],
    resizeCalls = []
  const icon = { id: 'app', name: 'App', path: '/app' }
  const { IconContextMenu } = load(
    '../../icons/IconContextMenu.tsx',
    {
      react: { useState: value => [value, () => {}], useEffect: () => {} },
      '@/lib/i18n': { translate: text => text },
      '@/lib/iconContextMenu': {},
      '@/lib/settingsStore': {},
      '@/stores/iconStore': {
        useIconStore: () => ({
          iconContextMenuMode: 'custom',
          showShellContextMenu: value => systemCalls.push(value),
        }),
      },
      '@/components/ui/menu': menu,
      './FocusedItemMenu': { FocusedItemMenu: 'FocusedItemMenu' },
      '../icon-grid/views/GridItemSizeMenu': { GridItemSizeMenu: 'GridItemSizeMenu' },
    },
    { window: { setTimeout: callback => callback() } }
  )
  const props = { icon, children: 'tile' }
  assert.equal(
    IconContextMenu(props).props.children.some(child => child?.type === 'GridItemSizeMenu'),
    false
  )
  const tree = IconContextMenu({
    ...props,
    resize: { size: '1x2', onResize: value => resizeCalls.push(value) },
  })
  const sizes = tree.props.children.find(child => child?.type === 'GridItemSizeMenu')
  assert.equal(sizes.props.label, '图标大小')
  assert.equal(sizes.props.size, '1x2')
  sizes.props.onResize('2x2')
  assert.deepEqual(resizeCalls, ['2x2'])
  const system = tree.props.children.at(-1)
  assert.equal(system.props.children[1].props.children, '系统菜单')
  assert.ok(system.props.className.includes('whitespace-nowrap'))
  assert.ok(system.props.children[2].props.className.includes('whitespace-nowrap'))
  system.props.onSelect()
  assert.deepEqual(systemCalls, [icon])
})

test('submenu uses Radix Sub primitives and a portal so the parent scroll area cannot clip it', () => {
  const { MenuSub, MenuSubTrigger, MenuSubContent } = load('../../ui/menu-submenu.tsx', {
    react: {
      forwardRef: render => render,
      useState: value => [value, () => {}],
      useCallback: callback => callback,
    },
    '@radix-ui/react-menu': new Proxy({}, { get: (_, name) => name }),
    '@/lib/utils': { cn: (...values) => values.filter(Boolean).join(' ') },
    './menu-styles': { menuContentClass: 'surface', menuItemClass: 'item' },
    './native-scroll-area': { NativeScrollArea: 'NativeScrollArea' },
  })
  assert.equal(MenuSub({ children: 'entries' }).type, 'Sub')
  assert.equal(MenuSubTrigger({ children: 'Sizes' }, null).type, 'SubTrigger')
  const content = MenuSubContent({ children: 'sizes', className: 'z-[283]' }, null)
  assert.equal(content.type, 'Portal')
  assert.equal(content.props.children.props.children.type, 'SubContent')
  assert.ok(content.props.children.props.children.props.className.includes('z-[283]'))
})
