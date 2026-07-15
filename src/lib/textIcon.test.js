import assert from 'node:assert/strict'
import { ICON_COLOR_PRESETS, normalizeTextIconText, pickRandomIconColor } from './textIcon.ts'

assert.deepEqual(
  ICON_COLOR_PRESETS.map(preset => preset.id),
  ['none', 'ocean', 'emerald', 'amber', 'coral', 'plum']
)

assert.equal(normalizeTextIconText(' 桌面 '), '桌面')
assert.equal(normalizeTextIconText('ABC'), 'AB')
assert.equal(normalizeTextIconText(''), '')

assert.equal(
  pickRandomIconColor(() => 0),
  'ocean'
)
assert.equal(
  pickRandomIconColor(() => 0.4),
  'amber'
)
assert.equal(
  pickRandomIconColor(() => 0.999),
  'plum'
)

console.log('textIcon tests passed')
