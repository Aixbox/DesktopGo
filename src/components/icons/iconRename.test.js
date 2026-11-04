import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { create } from 'zustand'
import ts from 'typescript'
import * as types from '../../types/index.ts'
import * as iconKey from '../../lib/iconKey.ts'
import * as shellMenu from '../../lib/shellContextMenu.ts'
import * as iconManager from '../../lib/iconManager.ts'

function load(path, modules) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText
  const exports = {}
  runInNewContext(compiled, {
    exports,
    console,
    require: name => {
      assert.ok(name in modules, `Missing test dependency: ${name}`)
      return modules[name]
    },
  })
  return exports
}

const original = {
  id: 'stable-id',
  path: 'C:\\Entries\\Original.lnk',
  name: 'Catalog alias',
  target_path: 'C:\\Apps\\Original.exe',
  item_type: 'shortcut',
  icon_base64: 'cached-artwork',
}
const renamed = {
  id: original.id,
  old_path: original.path,
  path: 'C:\\Entries\\新名称.lnk',
  name: '新名称',
  target_path: original.target_path,
}

function storeHarness(rename = async () => [renamed]) {
  const calls = []
  const saved = []
  const { useIconStore: store } = load('../../stores/iconStore.ts', {
    zustand: { create },
    '@tauri-apps/api/core': {
      invoke: async (command, args) => {
        calls.push({ command, args })
        if (command === 'show_shell_context_menu') return 'rename'
        assert.equal(command, 'rename_icon_entry')
        return rename(args)
      },
    },
    '../types': types,
    '../lib/iconKey': iconKey,
    '../lib/windowGeometry': { waitForWindowGeometrySync: async () => {} },
    '../lib/shellContextMenu': shellMenu,
    '../lib/settingsStore': {},
    '../lib/customNamesStore': { saveCustomNames: async value => saved.push(value) },
  })
  store.setState({
    icons: [original],
    selectedIconKeys: [original.id],
    customNames: {
      [original.path]: 'Old alias',
      [renamed.path]: 'Stale destination alias',
      unrelated: 'Keep',
    },
  })
  return { store, calls, saved }
}

function editorHarness(store, icon = original) {
  const states = []
  let cursor = 0
  let effects = []
  const errors = []
  const react = {
    useState(initial) {
      const index = cursor++
      if (!(index in states)) states[index] = initial
      return [
        states[index],
        value => {
          states[index] = value
        },
      ]
    },
    useRef(initial) {
      const index = cursor++
      if (!(index in states)) states[index] = { current: initial }
      return states[index]
    },
    useEffect(effect, deps) {
      const index = cursor++
      const previous = states[index]
      if (previous && deps.every((value, i) => value === previous.deps[i])) return
      effects.push(() => {
        previous?.cleanup?.()
        states[index] = { deps, cleanup: effect() }
      })
    },
  }
  const useStore = selector => selector(store.getState())
  useStore.subscribe = store.subscribe
  const { useIconRename } = load('./useIconRename.ts', {
    react,
    '../../stores/iconStore': { useIconStore: useStore },
    '../../lib/iconManager': iconManager,
    '../../lib/i18n': { translate: text => text },
    '../ui/toast': { useToast: () => ({ error: (...args) => errors.push(args) }) },
  })
  const render = () => {
    cursor = 0
    effects = []
    const result = useIconRename(icon)
    effects.forEach(effect => effect())
    return result
  }
  render()
  return { render, errors }
}

const key = (value, isComposing = false) => ({
  key: value,
  nativeEvent: { isComposing },
  stopPropagation() {},
  preventDefault() {},
})

test('native menu rename opens the editor with the source filename, not a custom alias', async () => {
  const { store, calls } = storeHarness()
  const editor = editorHarness(store)
  await store.getState().showShellContextMenu(original)
  assert.equal(editor.render().isRenaming, true)
  assert.equal(editor.render().draftName, 'Original')
  assert.equal(store.getState().renameTriggerPath, null)
  assert.equal(calls.length, 1)
})

test('file rename updates the launch path only after success, preserving ID, artwork and selection', async () => {
  let finish
  const { store, calls, saved } = storeHarness(
    () =>
      new Promise(resolve => {
        finish = resolve
      })
  )
  const request = store.getState().renameIconSource(original, '新名称')
  assert.equal(store.getState().icons[0], original)
  assert.equal(store.getState().customNames[original.path], 'Old alias')
  finish([renamed])
  await request
  const state = store.getState()
  assert.equal(calls[0].command, 'rename_icon_entry')
  assert.equal(calls[0].args.id, original.id)
  assert.equal(calls[0].args.name, '新名称')
  assert.equal(state.icons[0].name, renamed.name)
  assert.equal(state.icons[0].path, renamed.path)
  assert.equal(state.icons[0].target_path, original.target_path)
  assert.equal(state.icons[0].id, original.id)
  assert.equal(state.icons[0].icon_base64, original.icon_base64)
  assert.deepEqual(state.selectedIconKeys, [original.id])
  assert.equal(state.customNames[original.path], undefined)
  assert.equal(state.customNames[renamed.path], undefined)
  assert.equal(saved[0].unrelated, 'Keep')
})

test('failed file rename leaves the library and display aliases unchanged', async () => {
  const { store, saved } = storeHarness(async () => {
    throw new Error('destination exists')
  })
  const before = store.getState()
  await assert.rejects(store.getState().renameIconSource(original, '新名称'), /destination exists/)
  assert.equal(store.getState().icons, before.icons)
  assert.equal(store.getState().customNames, before.customNames)
  assert.equal(saved.length, 0)
})

test('Enter plus blur submits once; the pending editor closes only after success', async () => {
  let finish
  const { store, calls } = storeHarness(
    () =>
      new Promise(resolve => {
        finish = resolve
      })
  )
  const editor = editorHarness(store)
  await store.getState().showShellContextMenu(original)
  editor.render().setDraftName('新名称')
  const active = editor.render()
  active.handleInputKeyDown(key('Enter'))
  await active.commitRename()
  assert.equal(calls.length, 2)
  assert.equal(editor.render().isSaving, true)
  assert.equal(editor.render().isRenaming, true)
  finish([renamed])
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(editor.render().isRenaming, false)
  assert.equal(editor.render().isSaving, false)
})

test('Escape, unchanged names and empty names cancel without filesystem calls', async () => {
  for (const draft of ['Original', '', '   ', 'escape']) {
    const { store, calls } = storeHarness()
    const editor = editorHarness(store)
    await store.getState().showShellContextMenu(original)
    editor.render().setDraftName(draft)
    const active = editor.render()
    if (draft === 'escape') active.handleInputKeyDown(key('Escape'))
    await active.commitRename() // includes blur after Escape
    assert.equal(calls.length, 1)
    assert.equal(editor.render().isRenaming, false)
  }
})

test('failed rename keeps the draft editable, reports the error and allows retry', async () => {
  let fail = true
  const { store } = storeHarness(async () => {
    if (fail) throw new Error('access denied')
    return [renamed]
  })
  const editor = editorHarness(store)
  await store.getState().showShellContextMenu(original)
  editor.render().setDraftName('新名称')
  await editor.render().commitRename()
  assert.equal(editor.render().isRenaming, true)
  assert.equal(editor.render().isSaving, false)
  assert.equal(editor.render().draftName, '新名称')
  assert.match(editor.errors[0][0], /access denied/)
  fail = false
  await editor.render().commitRename()
  assert.equal(editor.render().isRenaming, false)
})

test('IME confirmation does not submit, and directory names retain dots', async () => {
  const { store, calls } = storeHarness()
  const folder = { ...original, path: 'C:\\Files\\version.1', item_type: 'folder' }
  const editor = editorHarness(store, folder)
  await store.getState().showShellContextMenu(folder)
  assert.equal(editor.render().draftName, 'version.1')
  editor.render().setDraftName('中文名称')
  editor.render().handleInputKeyDown(key('Enter', true))
  assert.equal(calls.length, 1)
  assert.equal(editor.render().isRenaming, true)
})

test('wrapped .url uses the real source for the native menu, editor and updated target path', async () => {
  const urlIcon = {
    ...original,
    path: 'C:\\Private\\Cached.lnk',
    target_path: 'D:\\Files\\Original.url',
    shell_path: 'D:\\Files\\Original.url',
  }
  const next = {
    ...renamed,
    old_path: urlIcon.path,
    path: urlIcon.path,
    target_path: 'D:\\Files\\Renamed.url',
    shell_path: 'D:\\Files\\Renamed.url',
  }
  const { store, calls } = storeHarness(async () => [next])
  store.setState({ icons: [urlIcon] })
  const editor = editorHarness(store, urlIcon)
  await store.getState().showShellContextMenu(urlIcon)
  assert.equal(calls[0].args.path, urlIcon.target_path)
  assert.equal(editor.render().draftName, 'Original.url')
  editor.render().setDraftName('Renamed')
  await editor.render().commitRename()
  const updated = store.getState().icons[0]
  assert.equal(updated.target_path, 'D:\\Files\\Renamed.url')
  assert.equal(updated.shell_path, updated.target_path)
  assert.equal(updated.path, urlIcon.path)
  assert.equal(updated.id, urlIcon.id)
})

test('all references to a renamed source get updated without losing selection or other icons', async () => {
  const other = { ...original, id: 'other', path: 'C:\\Entries\\Other.lnk' }
  const untouched = { ...original, id: 'untouched', target_path: 'D:\\Other.url' }
  const nextTarget = 'D:\\Renamed.url'
  const { store } = storeHarness(async () => [
    { ...renamed, target_path: nextTarget, shell_path: nextTarget },
    { ...other, old_path: other.path, target_path: nextTarget, shell_path: nextTarget },
  ])
  store.setState({
    icons: [original, other, untouched],
    selectedIconKeys: [original.id, other.id],
    customNames: { [other.path]: 'Keep this alias' },
  })
  await store.getState().renameIconSource(original, 'Renamed')
  assert.equal(store.getState().icons[1].target_path, nextTarget)
  assert.equal(store.getState().icons[2], untouched)
  assert.equal(store.getState().customNames[other.path], 'Keep this alias')
  assert.deepEqual(store.getState().selectedIconKeys, [original.id, other.id])
})
