import assert from 'node:assert/strict'
import {
  deriveAccentPalette,
  extractAccentColorFromPixels,
  getAccentForegroundColor,
  isLaunchpadBackgroundDataUri,
  normalizeThemeAccentColor,
} from './appearancePolicy.ts'

assert.equal(normalizeThemeAccentColor(' #2563EB '), '#2563eb')
assert.equal(normalizeThemeAccentColor('#12345'), null)
assert.equal(normalizeThemeAccentColor('blue'), null)

assert.equal(getAccentForegroundColor('#111827'), '#ffffff')
assert.equal(getAccentForegroundColor('#facc15'), '#111827')

const bluePalette = deriveAccentPalette('#2563eb')
assert.match(bluePalette?.selectedForegroundLight ?? '', /^oklch\(0\.420 /)
assert.match(bluePalette?.selectedForegroundDark ?? '', /^oklch\(0\.820 /)
assert.equal(deriveAccentPalette('blue'), null)

assert.equal(isLaunchpadBackgroundDataUri('data:image/webp;base64,AAAA'), true)
assert.equal(isLaunchpadBackgroundDataUri('data:image/svg+xml;base64,AAAA'), false)
assert.equal(isLaunchpadBackgroundDataUri('https://example.com/background.jpg'), false)

const bluePixels = new Uint8ClampedArray([
  37, 99, 235, 255, 37, 99, 235, 255, 30, 64, 175, 255, 245, 245, 245, 255,
])
assert.match(extractAccentColorFromPixels(bluePixels) ?? '', /^#[0-9a-f]{6}$/)

const neutralPixels = new Uint8ClampedArray([128, 128, 128, 255, 245, 245, 245, 255])
assert.equal(extractAccentColorFromPixels(neutralPixels), null)

console.log('appearance tests passed')
