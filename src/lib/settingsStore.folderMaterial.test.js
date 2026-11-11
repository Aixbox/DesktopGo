import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import test from 'node:test'
import ts from 'typescript'

// Exercise the actual migration and appearance read path with only native storage mocked.
const storeKey = Symbol.for('desktopgo.folder-material-test-store')
const moduleUrl = source => `data:text/javascript,${encodeURIComponent(source)}`
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@tauri-apps/plugin-store') {
      return {
        url: moduleUrl(`export class LazyStore {
          constructor() { return globalThis[Symbol.for('desktopgo.folder-material-test-store')] }
        }`),
        shortCircuit: true,
      }
    }
    if (specifier === '@tauri-apps/api/core') {
      return { url: moduleUrl('export const invoke = () => {};'), shortCircuit: true }
    }
    if (specifier === '@/types') {
      return nextResolve(new URL('../types/index.ts', import.meta.url).href, context)
    }
    return nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    if (url.startsWith(new URL('./settingsStore.ts', import.meta.url).href)) {
      const source = readFileSync(new URL(url), 'utf8').replace('import.meta.env.DEV', 'false')
      return {
        format: 'module',
        source: ts.transpileModule(source, {
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
        }).outputText,
        shortCircuit: true,
      }
    }
    return nextLoad(url, context)
  },
})

test('folder material migrates, persists and restores through saved appearance', async t => {
  t.after(() => {
    hooks.deregister()
    delete globalThis[storeKey]
  })
  const saved = new Map([
    ['settingsVersion', 15],
    ['windowMode', 'large'],
    ['launchpadLabelTone', 'black'],
  ])
  let rejectWrite = false
  globalThis[storeKey] = {
    get: async key => saved.get(key),
    set: async (key, value) => {
      if (rejectWrite) throw new Error('disk unavailable')
      saved.set(key, value)
    },
    keys: async () => [...saved.keys()],
    delete: async key => saved.delete(key),
  }
  const settings = await import('./settingsStore.ts')
  const { getSavedAppearance } = await import('./appearance.ts')
  assert.equal(await settings.getSetting('folderMaterial'), 'glass')
  assert.equal(saved.get('folderMaterial'), 'glass')
  assert.equal(saved.get('settingsVersion'), 16)
  assert.equal(await settings.getSetting('windowMode'), 'large')
  assert.equal(await settings.getSetting('launchpadLabelTone'), 'black')

  await settings.setSetting('folderMaterial', 'coloros')
  assert.equal((await getSavedAppearance()).folderMaterial, 'coloros')
  const reopened = await import('./settingsStore.ts?reopened')
  assert.equal(await reopened.getSetting('folderMaterial'), 'coloros')

  rejectWrite = true
  await assert.rejects(settings.setSetting('folderMaterial', 'glass'), /disk unavailable/)
  assert.equal((await getSavedAppearance()).folderMaterial, 'coloros')
  rejectWrite = false
  await settings.setSetting('folderMaterial', 'glass')
  assert.equal((await getSavedAppearance()).folderMaterial, 'glass')

  saved.set('folderMaterial', 'unsupported')
  const repaired = await import('./settingsStore.ts?invalid-value')
  assert.equal(await repaired.getSetting('folderMaterial'), 'glass')
  assert.equal(saved.get('folderMaterial'), 'glass')
})
