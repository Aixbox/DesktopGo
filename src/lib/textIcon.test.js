import assert from 'node:assert/strict'
import { getIconBackgroundStyle, ICON_COLOR_SHADING } from './iconBackground.ts'
import { resolveTextIconColor } from './textIconColor.ts'
import {
  createColoredIconDataUri,
  createIconWithBackgroundColorDataUri,
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
let backgroundFill = ''
let textFill = ''
const drawing = []
let clipped = false
const states = []
function gradient(kind, coords) {
  return {
    kind,
    coords,
    stops: [],
    addColorStop(offset, color) {
      this.stops.push([offset, color])
    },
  }
}
const context = {
  save() {
    states.push({ fillStyle: this.fillStyle, clipped })
    drawing.push('save')
  },
  clip() {
    clipped = true
    drawing.push('clip')
  },
  restore() {
    const state = states.pop()
    this.fillStyle = state.fillStyle
    clipped = state.clipped
    drawing.push('restore')
  },
  scale(...values) {
    drawing.push(['scale', ...values])
  },
  createLinearGradient(...coords) {
    return gradient('linear', coords)
  },
  createRadialGradient(...coords) {
    return gradient('radial', coords)
  },
  fillRect() {
    assert.equal(clipped, true, 'background lighting must stay inside the rounded outline')
    if (typeof this.fillStyle === 'string') backgroundFill = this.fillStyle
    drawing.push(this.fillStyle)
  },
  beginPath() {},
  clearRect() {},
  closePath() {},
  fill() {
    backgroundFill = this.fillStyle
  },
  fillStyle: '',
  fillText() {
    assert.equal(clipped, false, 'background drawing state must be restored before drawing text')
    drawnFont = this.font
    textFill = this.fillStyle
  },
  drawImage(_image, x, y, width, height) {
    assert.equal(clipped, false, 'background drawing state must be restored before drawing artwork')
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
assert.equal(backgroundFill, ICON_COLOR_PRESETS.find(preset => preset.id === 'ocean').color)
assert.deepEqual(drawing.slice(0, 2), ['save', 'clip'])
const shadow = drawing.find(value => value?.kind === 'linear')
const highlight = drawing.find(value => value?.kind === 'radial')
assert.deepEqual(shadow.stops, [
  [0.35, 'rgba(0, 0, 0, 0)'],
  [1, 'rgba(0, 0, 0, 0.09)'],
])
assert.deepEqual(highlight.stops, [
  [0, 'rgba(255, 255, 255, 0.14)'],
  [0.7, 'rgba(255, 255, 255, 0)'],
])
assert.ok(
  drawing.indexOf(shadow) < drawing.indexOf(highlight),
  'highlight overlays the shadow as it does in CSS'
)
assert.equal(drawing.at(-1), 'restore')
assert.equal(getIconBackgroundStyle('transparent').backgroundImage, undefined)
assert.equal(getIconBackgroundStyle('#123456').backgroundImage, ICON_COLOR_SHADING)
assert.ok(ICON_COLOR_SHADING.includes('/ 14%'))
assert.ok(ICON_COLOR_SHADING.includes('/ 9%'))
createTextIconDataUri('字', '#e5c8b1')
assert.equal(backgroundFill, '#e5c8b1')
assert.equal(textFill, '#263244')
createTextIconDataUri('字', '#123456')
assert.equal(backgroundFill, '#123456')
assert.equal(textFill, '#FFFFFF')
for (const [textColor, expected] of [
  ['black', '#000000'],
  ['white', '#FFFFFF'],
]) {
  for (const background of ['ocean', '#000000', '#ffffff', 'none']) {
    createTextIconDataUri('字', background, 256, textColor)
    assert.equal(textFill, expected, 'the selected text color must not follow the background')
    if (background === 'none') assert.notEqual(context.strokeStyle, expected)
  }
  assert.equal(resolveTextIconColor(textColor, '#123456'), textColor)
}
assert.equal(resolveTextIconColor(undefined, '#123456'), 'white')
assert.equal(resolveTextIconColor('', 'ocean'), 'black')
assert.equal(resolveTextIconColor('invalid', '#ffffff'), 'black')
assert.equal(createTextIconDataUri('', 'none'), '')
createTextIconDataUri('桌面工具栏', 'ocean')
assert.ok(Number.parseInt(drawnFont.match(/700 (\d+)px/)?.[1] ?? '0', 10) < Math.round(256 * 0.41))
assert.equal(
  await createColoredIconDataUri('data:image/png;base64,source', 'ocean'),
  'data:image/png;base64,text-icon'
)
assert.equal(backgroundFill, ICON_COLOR_PRESETS.find(preset => preset.id === 'ocean').color)
await createColoredIconDataUri('data:image/png;base64,source', '#a1b2c3')
assert.equal(backgroundFill, '#a1b2c3')
assert.equal(
  await createIconWithBackgroundColorDataUri('data:image/png;base64,source', '#123456'),
  'data:image/png;base64,text-icon'
)
assert.deepEqual(drawnImageRect, [0, 64, 256, 128])
assert.equal(states.length, 0)

delete globalThis.document
delete globalThis.Image

console.log('textIcon tests passed')
