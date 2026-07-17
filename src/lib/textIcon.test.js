import assert from 'node:assert/strict'
import {
  createColoredIconDataUri,
  createTextIconDataUri,
  ICON_COLOR_PRESETS,
  normalizeTextIconText,
  pickRandomIconColor,
} from './textIcon.ts'

assert.deepEqual(
  ICON_COLOR_PRESETS.map(preset => preset.id),
  ['none', 'ocean', 'cyan', 'emerald', 'lime', 'amber', 'coral', 'pink', 'plum', 'graphite']
)

assert.equal(normalizeTextIconText(' 桌面 '), '桌面')
assert.equal(normalizeTextIconText('ABC'), 'ABC')
assert.equal(normalizeTextIconText('DesktopGo'), 'Deskto')
assert.equal(normalizeTextIconText(''), '')

assert.equal(
  pickRandomIconColor(() => 0),
  'ocean'
)
assert.equal(
  pickRandomIconColor(() => 0.5),
  'amber'
)
assert.equal(
  pickRandomIconColor(() => 0.999),
  'graphite'
)

let drawnFont = ''
let drawnImageRect = []
const context = {
  beginPath() {},
  clearRect() {},
  closePath() {},
  fill() {},
  fillStyle: '',
  fillText() {
    drawnFont = this.font
  },
  drawImage(_image, x, y, width, height) {
    drawnImageRect = [x, y, width, height]
  },
  font: '',
  lineJoin: '',
  lineTo() {},
  lineWidth: 0,
  measureText: text => ({ width: text.length * 100 }),
  moveTo() {},
  quadraticCurveTo() {},
  strokeStyle: '',
  strokeText() {},
  textAlign: '',
  textBaseline: '',
}

globalThis.document = {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => context,
    toDataURL: () => 'data:image/png;base64,text-icon',
  }),
}
globalThis.Image = class {
  naturalWidth = 100
  naturalHeight = 50

  set src(_value) {
    this.onload()
  }
}

assert.equal(createTextIconDataUri('', 'ocean'), 'data:image/png;base64,text-icon')
assert.equal(createTextIconDataUri('', 'none'), '')
createTextIconDataUri('桌面工具栏', 'ocean')
assert.ok(Number.parseInt(drawnFont.match(/700 (\d+)px/)?.[1] ?? '0', 10) < Math.round(256 * 0.41))
assert.equal(
  await createColoredIconDataUri('data:image/png;base64,source', 'ocean'),
  'data:image/png;base64,text-icon'
)
assert.deepEqual(drawnImageRect, [0, 64, 256, 128])

delete globalThis.document
delete globalThis.Image

console.log('textIcon tests passed')
