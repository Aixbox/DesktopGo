import test from 'node:test'
import assert from 'node:assert/strict'
import { ICON_COLOR_PRESETS, normalizeIconColor, resolveIconColor } from './iconColors.ts'

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map(offset => {
    const v = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((left, right) => left - right)
  return (values[1] + 0.05) / (values[0] + 0.05)
}

test('all icon presets resolve and custom colors are normalized without changing their RGB', () => {
  for (const preset of ICON_COLOR_PRESETS) {
    assert.equal(normalizeIconColor(preset.id), preset.id)
    assert.equal(resolveIconColor(preset.id).color, preset.color)
  }
  assert.equal(normalizeIconColor(' #A1B2C3 '), '#a1b2c3')
  assert.equal(resolveIconColor('#a1b2c3').color, '#a1b2c3')
  for (const invalid of [null, 123, '', '#fff', '#12345678', '#zzzzzz', 'red', 'url(test)']) {
    assert.equal(normalizeIconColor(invalid), 'none')
    assert.equal(resolveIconColor(invalid).color, 'transparent')
  }
})

test('preset backgrounds retain readable text', () => {
  for (const preset of ICON_COLOR_PRESETS.filter(item => item.id !== 'none')) {
    assert.ok(contrast(preset.color, preset.foreground) >= 4.5, preset.id)
  }
})

test('custom backgrounds across RGB space retain at least 4.5:1 text contrast', () => {
  const channels = [0, 51, 102, 153, 204, 255]
  for (const r of channels)
    for (const g of channels)
      for (const b of channels) {
        const color = `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`
        const resolved = resolveIconColor(color)
        assert.ok(contrast(color, resolved.foreground) >= 4.5, `${color}: ${resolved.foreground}`)
      }
})
