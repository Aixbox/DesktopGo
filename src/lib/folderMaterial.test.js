import assert from 'node:assert/strict'
import test from 'node:test'
import { applyFolderMaterial } from './folderMaterialAppearance.ts'
import {
  DEFAULT_FOLDER_MATERIAL,
  getFolderBackdropTone,
  isFolderMaterial,
} from './folderMaterialPolicy.ts'

test('existing settings keep glass and only supported materials are accepted', () => {
  assert.equal(DEFAULT_FOLDER_MATERIAL, 'glass')
  for (const value of ['glass', 'coloros']) assert.equal(isFolderMaterial(value), true)
  for (const value of [undefined, null, '', 'acrylic', {}, 1]) {
    assert.equal(isFolderMaterial(value), false)
  }
})

test('wallpaper classification handles brightness, alpha and empty samples', () => {
  assert.equal(getFolderBackdropTone([240, 240, 240, 255]), 'bright')
  assert.equal(getFolderBackdropTone([20, 30, 50, 255]), 'dark')
  assert.equal(getFolderBackdropTone([255, 255, 255, 0, 20, 20, 20, 255]), 'dark')
  assert.equal(getFolderBackdropTone([0, 0, 0, 10, 250, 250, 250, 255]), 'bright')
  assert.equal(getFolderBackdropTone([0, 0, 0, 0]), null)
  assert.equal(getFolderBackdropTone([]), null)
  assert.equal(getFolderBackdropTone([255, 255, 255]), null)
  assert.equal(getFolderBackdropTone([154, 154, 154, 255]), 'dark')
  assert.equal(getFolderBackdropTone([195, 195, 195, 255]), 'dark')
  assert.equal(getFolderBackdropTone([196, 196, 196, 255]), 'bright')
})

function installWallpaperDecoder(t) {
  const images = []
  const canvases = []
  const timers = new Map()
  const root = { dataset: {} }
  const context = {
    drawImage() {},
    getImageData: () => ({ data: new Uint8ClampedArray([240, 240, 240, 255]) }),
  }
  const globals = {
    ResizeObserver: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    window: { addEventListener() {}, removeEventListener() {} },
    Image: class {
      constructor() {
        images.push(this)
      }
      removeAttribute(name) {
        delete this[name]
      }
    },
    document: {
      documentElement: root,
      addEventListener() {},
      removeEventListener() {},
      createElement: () => {
        const canvas = { width: 0, height: 0, getContext: () => context }
        canvases.push(canvas)
        return canvas
      },
    },
    setTimeout: callback => {
      const id = Symbol()
      timers.set(id, callback)
      return id
    },
    clearTimeout: id => timers.delete(id),
  }
  root.style = { removeProperty() {} }
  const originals = Object.entries(globals).map(([key, value]) => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key)
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
    return [key, descriptor]
  })
  t.after(() => {
    applyFolderMaterial('glass', '')
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  })
  return { images, canvases, timers, root, context }
}

test('all folders share one small wallpaper sample across repeated appearance syncs', t => {
  const h = installWallpaperDecoder(t)
  const source = 'data:image/png;base64,shared'
  applyFolderMaterial('glass', source)
  assert.equal(h.images.length, 0)
  applyFolderMaterial('coloros', source)
  applyFolderMaterial('coloros', source)
  assert.equal(h.images.length, 1)
  h.images[0].onload()
  assert.equal(h.root.dataset.folderMaterial, 'coloros')
  assert.equal(h.root.dataset.folderBackdrop, 'bright')
  assert.deepEqual([h.canvases[0].width, h.canvases[0].height], [32, 32])
  applyFolderMaterial('coloros', source)
  assert.equal(h.images.length, 1)
  assert.equal(h.timers.size, 0)
  assert.equal(h.images[0].onload, null)
})

test('wallpaper replacement and switching back to glass discard stale decode callbacks', t => {
  const h = installWallpaperDecoder(t)
  applyFolderMaterial('coloros', 'data:image/png;base64,old')
  const oldImage = h.images[0]
  const oldOnLoad = oldImage.onload
  applyFolderMaterial('coloros', 'data:image/png;base64,new')
  assert.equal(oldImage.onload, null)
  assert.equal(oldImage.src, undefined)
  assert.equal(h.timers.size, 1)
  h.context.getImageData = () => ({ data: [20, 20, 20, 255] })
  h.images[1].onload()
  oldOnLoad()
  assert.equal(h.root.dataset.folderBackdrop, 'dark')
  applyFolderMaterial('coloros', 'data:image/png;base64,third')
  const thirdOnLoad = h.images[2].onload
  applyFolderMaterial('glass', '')
  thirdOnLoad()
  assert.deepEqual(h.root.dataset, { folderMaterial: 'glass' })
  assert.equal(h.timers.size, 0)
})

test('decode, canvas and timeout failures use a neutral fallback and can retry', t => {
  const h = installWallpaperDecoder(t)
  for (const failure of ['decode', 'canvas', 'timeout']) {
    const source = `data:image/png;base64,${failure}`
    applyFolderMaterial('coloros', source)
    const image = h.images.at(-1)
    if (failure === 'decode') image.onerror()
    if (failure === 'canvas') {
      h.context.getImageData = () => {
        throw new Error('canvas unavailable')
      }
      image.onload()
    }
    if (failure === 'timeout') [...h.timers.values()][0]()
    assert.equal(h.root.dataset.folderBackdrop, undefined)
    assert.equal(h.root.dataset.folderMaterial, 'coloros')
    assert.equal(h.timers.size, 0)
    assert.equal(image.onload, null)
    h.context.getImageData = () => ({ data: [20, 20, 20, 255] })
    applyFolderMaterial('coloros', source)
    assert.notEqual(h.images.at(-1), image)
    h.images.at(-1).onload()
    assert.equal(h.root.dataset.folderBackdrop, 'dark')
  }
})

test('missing or nonlocal wallpaper never triggers a decode and clears stale tone', t => {
  const h = installWallpaperDecoder(t)
  applyFolderMaterial('coloros', 'data:image/png;base64,local')
  h.images[0].onload()
  for (const source of ['', 'https://example.com/wallpaper.png', 'invalid']) {
    applyFolderMaterial('coloros', source)
    assert.equal(h.images.length, 1)
    assert.equal(h.root.dataset.folderBackdrop, undefined)
  }
  applyFolderMaterial('invalid', '')
  assert.equal(h.root.dataset.folderMaterial, 'glass')
})
