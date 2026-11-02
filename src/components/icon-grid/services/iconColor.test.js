import assert from 'node:assert/strict'
import test from 'node:test'
import { extractIconDominantColor } from '../domain/iconDominantColor.ts'
import { loadIconColor, readCachedIconColor } from './iconColor.ts'

test('dominant color ignores transparent RGB, weights opacity and does not mix separate hues', () => {
  const rgba = new Uint8ClampedArray([
    ...Array(20).fill([0, 255, 0, 0]).flat(),
    255,
    0,
    0,
    255,
    250,
    2,
    2,
    255,
    0,
    0,
    255,
    255,
  ])
  assert.equal(extractIconDominantColor(rgba), '#fd0101')
  assert.equal(
    extractIconDominantColor(new Uint8ClampedArray([255, 0, 0, 40, 255, 0, 0, 40, 0, 0, 255, 255])),
    '#0000ff'
  )
  for (const [rgb, expected] of [
    [[255, 255, 255], '#ffffff'],
    [[0, 0, 0], '#000000'],
    [[128, 128, 128], '#808080'],
  ]) {
    assert.equal(extractIconDominantColor(new Uint8ClampedArray([...rgb, 255])), expected)
  }
  assert.equal(extractIconDominantColor(new Uint8ClampedArray([0, 0, 0, 0, 255, 0, 0, 31])), null)
  assert.equal(extractIconDominantColor(new Uint8ClampedArray()), null)
})

function installDecoder(t) {
  const images = [],
    canvases = [],
    timers = new Map()
  const context = {
    drawImage() {},
    getImageData: () => ({ data: new Uint8ClampedArray([51, 102, 153, 255]) }),
  }
  const globals = {
    Image: class {
      naturalWidth = 128
      naturalHeight = 64
      constructor() {
        images.push(this)
      }
    },
    document: {
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
  for (const [key, value] of Object.entries(globals)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key)
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
    t.after(() =>
      previous ? Object.defineProperty(globalThis, key, previous) : delete globalThis[key]
    )
  }
  return { images, canvases, timers, context }
}

test('tile and animation reuse one bounded-size decode and its cached result', async t => {
  const h = installDecoder(t),
    source = 'data:image/png;base64,cache-case'
  const tile = loadIconColor(source),
    ghost = loadIconColor(source)
  assert.equal(tile, ghost)
  assert.equal(h.images.length, 1)
  h.images[0].onload()
  assert.equal(await tile, '#336699')
  assert.equal(readCachedIconColor(source), '#336699')
  assert.equal(await loadIconColor(source), '#336699')
  assert.equal(h.images.length, 1)
  assert.deepEqual([h.canvases[0].width, h.canvases[0].height], [32, 16])
  assert.equal(h.timers.size, 0)
  assert.equal(h.images[0].onload, null)
})

test('decode errors, unavailable canvas and timeouts fall back to glass and allow retries', async t => {
  const h = installDecoder(t)
  for (const failure of ['decode', 'canvas', 'timeout']) {
    const source = `data:image/png;base64,failure-${failure}`
    const pending = loadIconColor(source),
      image = h.images.at(-1)
    if (failure === 'decode') image.onerror()
    if (failure === 'canvas') {
      h.context.getImageData = () => {
        throw new Error('unavailable canvas')
      }
      image.onload()
    }
    if (failure === 'timeout') [...h.timers.values()][0]()
    assert.equal(await pending, null)
    assert.equal(readCachedIconColor(source), null)
    assert.equal(h.timers.size, 0)
    h.context.getImageData = () => ({ data: new Uint8ClampedArray([51, 102, 153, 255]) })
    const retry = loadIconColor(source)
    assert.notEqual(h.images.at(-1), image)
    h.images.at(-1).onload()
    assert.equal(await retry, '#336699')
  }
  const count = h.images.length
  assert.equal(await loadIconColor('https://example.com/icon.png'), null)
  assert.equal(await loadIconColor(''), null)
  assert.equal(h.images.length, count, 'extraction only reads existing local icon data')
})
