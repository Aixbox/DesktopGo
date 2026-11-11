import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as metrics from '../domain/folderPreviewMetrics.ts'
import * as geometry from './folderTilePreviewGeometry.ts'
import * as motionPolicy from './folderResizeMotion.ts'
import * as visualPolicy from './folderVisualPolicy.ts'
import * as types from '../../../types/index.ts'

const require = createRequire(import.meta.url)
const modules = {
  'react/jsx-runtime': require('react/jsx-runtime'),
  'lucide-react': require('lucide-react'),
  'framer-motion': {
    motion: { div: 'div', span: 'span', button: 'button' },
    useReducedMotion: () => false,
    useTransform: (value, transform) => transform(value),
  },
  '../domain/folderPreviewMetrics': metrics,
  './folderTilePreviewGeometry': geometry,
  './folderResizeMotion': motionPolicy,
  './folderVisualPolicy': visualPolicy,
  '../../../types': types,
  '../hooks/useFolderResizeMotion': { useFolderResizeMotion: value => value },
  '../../icons/focusedItemMenuContext': { useItemMenuFocused: () => false },
  './FolderResizeHandle': { FolderResizeHandle: 'FolderResizeHandle' },
  './FolderDropReceiver': { FolderDropReceiver: 'FolderDropReceiver' },
}

function loadComponent(name) {
  const exports = {}
  runInNewContext(
    ts.transpileModule(readFileSync(new URL(`./${name}.tsx`, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    {
      exports,
      require: name => {
        assert.ok(name in modules, `Unexpected import: ${name}`)
        return modules[name]
      },
    }
  )
  return exports
}

const { FolderTilePreview } = loadComponent('FolderTilePreview')
modules['./FolderTilePreview'] = { FolderTilePreview }
const { FolderTileContents } = loadComponent('FolderTileContents')

function collect(node, predicate) {
  if (Array.isArray(node)) return node.flatMap(child => collect(child, predicate))
  if (!node?.props) return []
  return [...(predicate(node) ? [node] : []), ...collect(node.props.children, predicate)]
}

function fixture(size, count, options = {}) {
  const [cols, rows] = size.split('x').map(Number)
  const events = []
  const props = {
    folder: {
      kind: 'folder',
      id: 'folder-test',
      name: '工具',
      size,
      children: Array.from({ length: count }, (_, index) => ({
        kind: 'icon',
        key: `app-${index}`,
        icon: { name: `应用 ${index}`, path: `C:/Apps/app-${index}.exe` },
      })),
    },
    span: { cols, rows },
    slotWidth: 96,
    slotHeight: 110,
    gridGap: 12,
    titleLineCount: 'two',
    folderPreview: false,
    folderOpen: false,
    sharedLayoutActive: false,
    selectionMode: false,
    rtl: false,
    reducedMotion: false,
    ...options,
    onOpenFolder: id => events.push(['folder', id]),
    onLaunchIcon: path => events.push(['app', path]),
  }
  props.metrics = visualPolicy.getDesktopFolderTileMetrics({ ...props, folderSize: size })
  const body = FolderTileContents(props)
  const preview = FolderTilePreview(props)
  const buttons = collect(preview, node => node.props['data-folder-preview-key'])
  return { props, body, buttons, preview, events }
}

function click(button, body) {
  let stopped = false
  const event = {
    stopPropagation: () => {
      stopped = true
    },
  }
  button.props.onClick(event)
  if (!stopped) body.props.onClick(event)
  assert.equal(stopped, true, 'a preview click must not also open the parent folder')
}

for (const size of ['1x2', '2x1', '2x2']) {
  for (const rtl of [false, true]) {
    test(`${size} ${rtl ? 'RTL' : 'LTR'}: full icons launch apps, overflow miniatures open the folder`, () => {
      const capacity = size === '2x2' ? 9 : 3
      for (const count of [1, capacity, capacity + 1, capacity + 5]) {
        const { props, body, buttons, events } = fixture(size, count, { rtl })
        const directCount = Math.min(count, count > capacity ? capacity - 1 : capacity)
        buttons.forEach((button, index) => {
          if (button.props.disabled) {
            assert.equal(button.props['aria-hidden'], true)
            assert.equal(button.props.style.pointerEvents, 'none')
            return
          }
          events.length = 0
          click(button, body)
          const direct = index < directCount
          assert.deepEqual(events, [
            direct ? ['app', props.folder.children[index].icon.path] : ['folder', props.folder.id],
          ])
          assert.equal(
            button.props['aria-label'],
            direct ? props.folder.children[index].icon.name : props.folder.name
          )
          let pressStopped = false
          button.props.onPointerDown({
            stopPropagation: () => {
              pressStopped = true
            },
          })
          assert.equal(
            pressStopped,
            direct,
            'direct app presses must not start dragging the whole folder'
          )
        })
      }
    })
  }
}

test('compact folder miniatures and selection mode never launch applications', () => {
  for (const size of ['1x1', '1x2', '2x1', '2x2']) {
    const { body, buttons, events } = fixture(size, 12, { selectionMode: size !== '1x1' })
    for (const button of buttons.filter(button => !button.props.disabled)) click(button, body)
    assert.ok(events.length > 0)
    assert.ok(events.every(([action]) => action === 'folder'))
  }
})

test('folder gaps, unused stack positions and the title keep opening the folder', () => {
  for (const count of [0, 2, 10]) {
    const { body, preview, events } = fixture('2x2', count)
    assert.match(preview.props.className, /pointer-events-none/)
    for (const holder of collect(preview, node => node.type === 'span')) {
      assert.equal(holder.props['aria-hidden'], 'true')
      assert.equal(holder.props.onClick, undefined)
    }
    body.props.onClick({ stopPropagation() {} })
    assert.deepEqual(events, [['folder', 'folder-test']])
    const [titleComponent] = collect(
      body,
      node => typeof node.type === 'function' && node.props.name === '工具'
    )
    const title = titleComponent.type(titleComponent.props)
    assert.equal(title.type, 'button')
    assert.equal(title.props['aria-label'], '工具')
    assert.equal(title.props.onClick, undefined, 'title clicks bubble to the folder body')
  }
})
