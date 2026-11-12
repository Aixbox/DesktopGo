import assert from 'node:assert/strict'
import test from 'node:test'
import { applyFolderMaterial } from './folderMaterialAppearance.ts'
import { DEFAULT_FOLDER_MATERIAL, isFolderMaterial } from './folderMaterialPolicy.ts'

test('existing settings keep glass and preserve the saved frost identifier', () => {
  assert.equal(DEFAULT_FOLDER_MATERIAL, 'glass')
  for (const value of ['glass', 'coloros']) assert.equal(isFolderMaterial(value), true)
  for (const value of [undefined, null, '', 'acrylic', {}, 1]) {
    assert.equal(isFolderMaterial(value), false)
  }
})

test('switching material works without wallpaper decoding, Canvas, observers or timers', t => {
  const root = { dataset: { launchpadBackground: 'custom' } }
  const forbidden = () => assert.fail('live backdrop material must not schedule texture work')
  const globals = {
    document: { documentElement: root, createElement: forbidden },
    Image: forbidden,
    ResizeObserver: forbidden,
    MutationObserver: forbidden,
    requestAnimationFrame: forbidden,
    setTimeout: forbidden,
  }
  const originals = Object.entries(globals).map(([key, value]) => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key)
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
    return [key, descriptor]
  })
  t.after(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  })
  for (const background of ['custom', undefined]) {
    if (background) root.dataset.launchpadBackground = background
    else delete root.dataset.launchpadBackground
    for (const material of ['coloros', 'coloros', 'glass', 'coloros']) {
      applyFolderMaterial(material)
      assert.equal(root.dataset.folderMaterial, material)
      assert.equal(root.dataset.launchpadBackground, background)
    }
  }
  applyFolderMaterial('unsupported')
  assert.equal(root.dataset.folderMaterial, 'glass')
})
