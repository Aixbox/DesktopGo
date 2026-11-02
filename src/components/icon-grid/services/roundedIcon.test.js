import assert from 'node:assert/strict'
import test from 'node:test'
import { getIconVisibleBounds } from '../domain/iconVisibleBounds.ts'
import { loadRoundedIcon, readCachedRoundedIcon } from './roundedIcon.ts'

function paddedSample(width, height, bounds) {
  const data = new Uint8ClampedArray(width * height * 4)
  if (bounds) {
    for (let y = bounds.y; y < bounds.y + bounds.height; y++) {
      for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
        data[(y * width + x) * 4 + 3] = 255
      }
    }
  }
  return { data, width, height }
}

test('visible bounds account for transparent padding, rectangular content and empty artwork', () => {
  for (const bounds of [
    { x: 0, y: 0, width: 12, height: 10 },
    { x: 3, y: 2, width: 6, height: 6 },
    { x: 1, y: 4, width: 10, height: 2 },
  ]) {
    const sample = paddedSample(12, 10, bounds)
    assert.deepEqual(getIconVisibleBounds(sample.data, sample.width, sample.height), bounds)
  }
  assert.equal(getIconVisibleBounds(new Uint8ClampedArray(16), 2, 2), null)
  assert.equal(getIconVisibleBounds(new Uint8ClampedArray(4), 2, 2), null)
})

function installDecoder(t) {
  const images = [],
    canvases = [],
    calls = [],
    timers = new Map()
  const context = {
    drawImage: (...args) => calls.push(['draw', ...args.slice(1)]),
    getImageData: (_x, _y, width, height) =>
      paddedSample(width, height, { x: 2, y: 1, width: 8, height: 4 }),
    clearRect: (...args) => calls.push(['clear', ...args]),
    beginPath: () => calls.push(['begin']),
    roundRect: (...args) => calls.push(['round', ...args]),
    clip: () => calls.push(['clip']),
  }
  const globals = {
    Image: class {
      naturalWidth = 12
      naturalHeight = 6
      constructor() {
        images.push(this)
      }
    },
    document: {
      createElement: () => {
        const canvas = {
          width: 0,
          height: 0,
          getContext: () => context,
          toDataURL: () => 'data:image/png;base64,rounded',
        }
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
  return { images, canvases, calls, timers, context }
}

test('rounding clips the visible rectangle, retains canvas padding and shares cached work', async t => {
  const h = installDecoder(t)
  const source = 'data:image/png;base64,padded'
  const pending = loadRoundedIcon(source)
  assert.equal(loadRoundedIcon(source), pending)
  h.images[0].onload()
  assert.equal(await pending, 'data:image/png;base64,rounded')
  assert.deepEqual(h.calls, [
    ['draw', 0, 0, 12, 6],
    ['clear', 0, 0, 12, 6],
    ['begin'],
    ['round', 2, 1, 8, 4, 1],
    ['clip'],
    ['draw', 0, 0, 12, 6],
  ])
  assert.deepEqual([h.canvases[0].width, h.canvases[0].height], [12, 6])
  assert.equal(readCachedRoundedIcon(source), await loadRoundedIcon(source))
  assert.equal(h.images.length, 1)
  assert.equal(h.images[0].onload, null)
  assert.equal(h.timers.size, 0)
})

test('large images are bounded and keep their aspect ratio', async t => {
  const h = installDecoder(t)
  const pending = loadRoundedIcon('data:image/png;base64,large')
  h.images[0].naturalWidth = 2048
  h.images[0].naturalHeight = 1024
  h.images[0].onload()
  await pending
  assert.deepEqual([h.canvases[0].width, h.canvases[0].height], [512, 256])
})

test('decode, canvas and timeout failures allow retry; transparent images have no processed result', async t => {
  const h = installDecoder(t)
  const read = h.context.getImageData
  for (const failure of ['decode', 'canvas', 'timeout', 'transparent']) {
    const source = `data:image/png;base64,${failure}`
    const pending = loadRoundedIcon(source)
    const image = h.images.at(-1)
    if (failure === 'decode') image.onerror()
    if (failure === 'timeout') [...h.timers.values()][0]()
    if (failure === 'canvas' || failure === 'transparent') {
      h.context.getImageData =
        failure === 'canvas'
          ? () => {
              throw new Error('unavailable')
            }
          : (_x, _y, width, height) => paddedSample(width, height)
      image.onload()
    }
    assert.equal(await pending, null)
    assert.equal(readCachedRoundedIcon(source), null)
    assert.equal(h.timers.size, 0)
    h.context.getImageData = read
    const retry = loadRoundedIcon(source)
    assert.notEqual(h.images.at(-1), image)
    h.images.at(-1).onload()
    assert.equal(await retry, 'data:image/png;base64,rounded')
  }
  const count = h.images.length
  assert.equal(await loadRoundedIcon('https://example.com/icon.png'), null)
  assert.equal(h.images.length, count)
})
