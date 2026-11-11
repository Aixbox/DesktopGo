import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyFolderMaterialColors,
  applyLauncherFolderMaterialColors,
} from './folderMaterialColor.ts'

// Numeric channel vectors calculated from the extracted AGSL MIX -> DODGE_BG/OVERLAY
// formulas. These are color-transform unit tests, not image/screenshot comparisons.
const cases = [
  { input: [0, 0, 0], normal: [14, 15, 16], bright: [0, 0, 0], night: [29, 29, 29] },
  {
    input: [128, 128, 128],
    normal: [138, 140, 145],
    bright: [115, 115, 115],
    night: [125, 125, 125],
  },
  {
    input: [255, 255, 255],
    normal: [255, 255, 255],
    bright: [229, 229, 229],
    night: [233, 233, 233],
  },
  { input: [80, 120, 180], normal: [92, 132, 197], bright: [72, 108, 162], night: [89, 119, 170] },
  { input: [160, 80, 40], normal: [169, 93, 56], bright: [144, 72, 36], night: [153, 89, 59] },
  { input: [40, 160, 80], normal: [53, 172, 97], bright: [36, 144, 72], night: [59, 153, 89] },
  { input: [120, 80, 200], normal: [130, 93, 217], bright: [108, 72, 180], night: [119, 89, 187] },
]

test('folder color transforms follow the extracted shader order and day/night formulas', () => {
  for (const [dark, tone, branch] of [
    [false, 'dark', 'normal'],
    [false, 'bright', 'bright'],
    [true, 'dark', 'night'],
    [true, 'bright', 'night'],
  ]) {
    const channels = new Uint8ClampedArray(cases.flatMap(entry => [...entry.input, 255]))
    applyLauncherFolderMaterialColors(channels, dark, tone)
    assert.deepEqual(
      [...channels],
      cases.flatMap(entry => [...entry[branch], 255]),
      branch
    )
  }
})

test('color transformation preserves opaque alpha and tolerates empty input', () => {
  const channels = new Uint8ClampedArray([250, 255, 245, 255, 0, 0, 0, 255])
  applyLauncherFolderMaterialColors(channels, false, 'dark')
  assert.deepEqual([...channels], [255, 255, 255, 255, 14, 15, 16, 255])
  assert.doesNotThrow(() =>
    applyLauncherFolderMaterialColors(new Uint8ClampedArray(), false, 'bright')
  )
})

test('the reported #096692 blue follows the Launcher formula in every theme branch', () => {
  const input = [9, 102, 146, 255]
  for (const [dark, tone, expected] of [
    [false, 'dark', [23, 115, 163, 255]],
    [false, 'bright', [8, 92, 131, 255]],
    [true, 'dark', [35, 105, 141, 255]],
    [true, 'bright', [35, 105, 141, 255]],
  ]) {
    const channels = new Uint8ClampedArray(input)
    applyLauncherFolderMaterialColors(channels, dark, tone)
    assert.deepEqual([...channels], expected)
    assert.ok(channels[2] > channels[1] && channels[1] > channels[0], 'retain blue hue ordering')
  }
})

test('each material branch preserves continuous gradients without local brightness switches', () => {
  for (const [dark, tone] of [
    [false, 'dark'],
    [false, 'bright'],
    [true, 'dark'],
    [true, 'bright'],
  ]) {
    const ramp = new Uint8ClampedArray(Array.from({ length: 256 }, (_, v) => [v, v, v, 255]).flat())
    applyLauncherFolderMaterialColors(ramp, dark, tone)
    for (let i = 0; i < ramp.length; i += 4) {
      if (dark || tone === 'bright') {
        assert.equal(ramp[i], ramp[i + 1])
        assert.equal(ramp[i], ramp[i + 2])
      }
      assert.equal(ramp[i + 3], 255)
      if (i > 0) {
        for (let channel = 0; channel < 3; channel++) {
          const difference = ramp[i + channel] - ramp[i - 4 + channel]
          assert.ok(difference >= 0 && difference <= 2, 'no hard brightness switch')
        }
      }
    }
  }
})

test('light soft mist transmits blurred wallpaper colors through a neutral translucent tint', () => {
  // Synthetic contract inputs, not measurements from the user's reference image.
  const channels = new Uint8ClampedArray([
    0, 0, 0, 255, 128, 128, 128, 255, 255, 255, 255, 255, 9, 102, 146, 255, 170, 140, 110, 255,
  ])
  applyFolderMaterialColors(channels, false)
  assert.deepEqual(
    [...channels],
    [90, 90, 90, 255, 166, 166, 166, 255, 243, 243, 243, 255, 95, 151, 177, 255, 192, 174, 156, 255]
  )
  assert.ok(channels[8] - channels[0] >= 150, 'preserve broad wallpaper brightness differences')
  assert.ok(channels[12] < channels[13] && channels[13] < channels[14], 'retain a cool tint')
  assert.ok(channels[16] > channels[17] && channels[17] > channels[18], 'retain a warm tint')
})

test('light soft mist softens saturated colors without erasing the wallpaper hue', () => {
  const channels = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255])
  applyFolderMaterialColors(channels, false)
  for (let index = 0; index < channels.length; index += 4) {
    const rgb = channels.slice(index, index + 3)
    const chroma = Math.max(...rgb) - Math.min(...rgb)
    assert.ok(chroma >= 140 && chroma <= 160, 'keep visible color instead of a near-gray slab')
    assert.ok(Math.max(...rgb) < 255, 'avoid clipping bright wallpaper to white')
    assert.ok(Math.min(...rgb) > 0, 'the neutral tint still lifts dark channels')
    assert.equal(channels[index + 3], 255)
  }
})

test('dark soft mist retains wallpaper brightness and color through a near-black tint', () => {
  // Synthetic color inputs specify the adaptation contract, not screenshot samples.
  const inputs = [
    [0, 0, 0, 255],
    [128, 128, 128, 255],
    [255, 255, 255, 255],
    [9, 102, 146, 255],
    [170, 140, 110, 255],
  ]
  const channels = new Uint8ClampedArray(inputs.flat())
  applyFolderMaterialColors(channels, true)
  assert.deepEqual(
    [...channels],
    [8, 8, 8, 255, 72, 72, 72, 255, 136, 136, 136, 255, 12, 59, 81, 255, 93, 78, 63, 255]
  )
  assert.ok(channels[8] - channels[0] >= 120, 'avoid flattening broad wallpaper brightness changes')
  assert.ok(channels[14] - channels[12] >= 60, 'blue wallpaper must retain noticeable blue chroma')
  assert.ok(channels[16] > channels[17] && channels[17] > channels[18], 'retain a warm tint')
  for (let pixel = 1; pixel < inputs.length; pixel++) {
    const rgb = channels.slice(pixel * 4, pixel * 4 + 3)
    assert.ok(Math.max(...rgb) < Math.max(...inputs[pixel].slice(0, 3)), 'keep a dark surface')
  }
})

test('dark mist distinguishes colored backgrounds with equal channel ranges', () => {
  const channels = new Uint8ClampedArray([200, 80, 40, 255, 40, 200, 80, 255, 80, 40, 200, 255])
  applyFolderMaterialColors(channels, true)
  for (const [index, dominantChannel] of [
    [0, 0],
    [4, 1],
    [8, 2],
  ]) {
    const rgb = channels.slice(index, index + 3)
    assert.equal(rgb[dominantChannel], Math.max(...rgb), 'retain the wallpaper hue')
    const spread = Math.max(...rgb) - Math.min(...rgb)
    assert.ok(
      spread >= 70 && spread <= 90,
      'avoid collapsing different wallpapers into similar gray'
    )
  }
})

test('both soft-mist themes keep continuous neutral gradients and preserve alpha', () => {
  for (const [dark, minimum, maximum] of [
    [false, 90, 243],
    [true, 8, 136],
  ]) {
    const ramp = new Uint8ClampedArray(Array.from({ length: 256 }, (_, v) => [v, v, v, v]).flat())
    applyFolderMaterialColors(ramp, dark)
    for (let value = 0; value < 256; value++) {
      const index = value * 4
      assert.equal(ramp[index], ramp[index + 1])
      assert.equal(ramp[index], ramp[index + 2])
      assert.equal(ramp[index + 3], value)
      assert.ok(ramp[index] >= minimum && ramp[index] <= maximum)
      if (value > 0) {
        const step = ramp[index] - ramp[index - 4]
        assert.ok(step >= 0 && step <= 2, 'no band-producing brightness switch')
      }
    }
    assert.doesNotThrow(() => applyFolderMaterialColors(new Uint8ClampedArray(), dark))
  }
})
