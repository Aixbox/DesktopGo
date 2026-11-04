import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { setImmediate as settleAsyncWork } from 'node:timers/promises'
import ts from 'typescript'
import { create } from 'zustand'
import * as types from '../types/index.ts'
import { waitForWindowGeometrySync } from './windowGeometry.ts'

function frameHarness(t) {
  const previous = globalThis.window
  const frames = new Map(),
    timers = new Map()
  let sequence = 0
  globalThis.window = {
    requestAnimationFrame: callback => {
      frames.set(++sequence, callback)
      return sequence
    },
    cancelAnimationFrame: id => frames.delete(id),
    setTimeout: callback => {
      timers.set(++sequence, callback)
      return sequence
    },
    clearTimeout: id => timers.delete(id),
  }
  t.after(() => {
    globalThis.window = previous
  })
  return {
    frames,
    timers,
    frame() {
      const pending = [...frames.values()]
      frames.clear()
      pending.forEach(fn => fn())
    },
  }
}

test('native geometry synchronization waits two frames and releases every scheduled callback', async t => {
  const h = frameHarness(t)
  let done = false
  const promise = waitForWindowGeometrySync().then(() => {
    done = true
  })
  h.frame()
  await Promise.resolve()
  assert.equal(done, false)
  h.frame()
  await promise
  assert.equal(done, true)
  assert.equal(h.frames.size + h.timers.size, 0)
})

test('hidden WebViews complete by timeout and cancel suspended frames', async t => {
  const h = frameHarness(t)
  const promise = waitForWindowGeometrySync()
  ;[...h.timers.values()][0]()
  await promise
  assert.equal(h.frames.size + h.timers.size, 0)
})

function storeHarness() {
  const calls = [],
    resize = [],
    synchronize = []
  const modules = {
    zustand: { create },
    '../types': types,
    '../lib/iconKey': {},
    '../lib/shellContextMenu': {},
    '../lib/customNamesStore': {},
    '../lib/settingsStore': { setSetting: async () => {} },
    '../lib/windowGeometry': {
      waitForWindowGeometrySync: () => new Promise(resolve => synchronize.push(resolve)),
    },
    '@tauri-apps/api/core': {
      invoke: (command, args) => {
        calls.push({ command, args })
        return new Promise((resolve, reject) => resize.push({ resolve, reject }))
      },
    },
  }
  const exports = {}
  const source = readFileSync(new URL('../stores/iconStore.ts', import.meta.url), 'utf8')
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      exports,
      console: { error() {} },
      require: name => {
        assert.ok(name in modules, name)
        return modules[name]
      },
    }
  )
  return { store: exports.useIconStore, calls, resize, synchronize }
}

test('window settings gate measurement before IPC and until WebView synchronization completes', async () => {
  const h = storeHarness()
  h.store.getState().setWindowMode('large')
  assert.equal(h.store.getState().windowMode, 'large')
  assert.equal(h.store.getState().windowGeometryPending, true)
  assert.equal(h.calls[0].args.width, 1600)
  h.resize[0].resolve()
  await settleAsyncWork()
  assert.equal(h.store.getState().windowGeometryPending, true)
  h.synchronize[0]()
  await settleAsyncWork()
  assert.equal(h.store.getState().windowGeometryPending, false)
})

test('an old request cannot release a newer resize; failures still release the current guard', async () => {
  const h = storeHarness()
  const first = h.store.getState().applyWindowMode('large')
  const second = h.store.getState().applyWindowMode('medium')
  h.resize[0].resolve()
  await settleAsyncWork()
  h.synchronize[0]()
  await first
  assert.equal(h.store.getState().windowGeometryPending, true)
  h.resize[1].reject(new Error('resize failed'))
  await second
  assert.equal(h.store.getState().windowGeometryPending, false)
})
