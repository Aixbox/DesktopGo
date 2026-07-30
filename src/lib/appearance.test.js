import assert from 'node:assert/strict'
import {
  BACKGROUND_BLUR_MAX,
  BACKGROUND_BLUR_MAX_PX,
  BACKGROUND_OVERLAY_MAX,
  DEFAULT_BACKGROUND_BLUR,
  DEFAULT_BACKGROUND_OVERLAY,
  backgroundBlurToPixels,
  clampBackgroundBlur,
  clampBackgroundOverlay,
  deriveAccentPalette,
  extractAccentColorFromPixels,
  getAccentForegroundColor,
  isBackgroundBlur,
  isBackgroundOverlay,
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

assert.equal(clampBackgroundOverlay(35), 35)
assert.equal(clampBackgroundOverlay(35.4), 35)
assert.equal(clampBackgroundOverlay(-10), 0)
assert.equal(clampBackgroundOverlay(1000), BACKGROUND_OVERLAY_MAX)
assert.equal(clampBackgroundOverlay(Number.NaN), DEFAULT_BACKGROUND_OVERLAY)

assert.equal(clampBackgroundBlur(12), 12)
assert.equal(clampBackgroundBlur(-1), 0)
assert.equal(clampBackgroundBlur(999), BACKGROUND_BLUR_MAX)
assert.equal(clampBackgroundBlur(Number.POSITIVE_INFINITY), DEFAULT_BACKGROUND_BLUR)

// 模糊以百分比存储，渲染时才换算成 px 半径。
assert.equal(backgroundBlurToPixels(0), 0)
assert.equal(backgroundBlurToPixels(BACKGROUND_BLUR_MAX), BACKGROUND_BLUR_MAX_PX)
assert.equal(backgroundBlurToPixels(50), BACKGROUND_BLUR_MAX_PX / 2)
assert.equal(backgroundBlurToPixels(999), BACKGROUND_BLUR_MAX_PX)
assert.equal(backgroundBlurToPixels(Number.NaN), 0)

assert.equal(isBackgroundOverlay(0), true)
assert.equal(isBackgroundOverlay(BACKGROUND_OVERLAY_MAX), true)
assert.equal(isBackgroundOverlay(BACKGROUND_OVERLAY_MAX + 1), false)
assert.equal(isBackgroundOverlay('20'), false)
assert.equal(isBackgroundBlur(BACKGROUND_BLUR_MAX), true)
assert.equal(isBackgroundBlur(-1), false)
assert.equal(isBackgroundBlur(null), false)

console.log('appearance tests passed')
