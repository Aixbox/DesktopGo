import assert from 'node:assert/strict'
import test from 'node:test'
import {
  constrainMediaPositionToViewport,
  getImageBoundedSquareCropSize,
  getRotatedImageSize,
  getUpscaledContainObjectFit,
  normalizeRotation,
  resizeSquareCrop,
  ICON_CROP_MAX_ZOOM,
  ICON_CROP_MIN_ZOOM,
} from './imageCrop.ts'

test('icon crop zoom stays within the normalized 0.1-to-1 range', () => {
  assert.equal(ICON_CROP_MIN_ZOOM, 0.1)
  assert.equal(ICON_CROP_MAX_ZOOM, 1)
})

test('getImageBoundedSquareCropSize uses the displayed image short edge', () => {
  assert.deepEqual(getImageBoundedSquareCropSize(284, 142), { width: 142, height: 142 })
  assert.deepEqual(getImageBoundedSquareCropSize(96, 192), { width: 96, height: 96 })
  assert.deepEqual(getImageBoundedSquareCropSize(128, 128), { width: 128, height: 128 })
})

test('getImageBoundedSquareCropSize rejects unloaded image dimensions', () => {
  assert.equal(getImageBoundedSquareCropSize(0, 128), null)
  assert.equal(getImageBoundedSquareCropSize(Number.NaN, 128), null)
})

test('getUpscaledContainObjectFit enlarges toward the limiting canvas edge', () => {
  assert.equal(getUpscaledContainObjectFit(32, 32), 'horizontal-cover')
  assert.equal(getUpscaledContainObjectFit(320, 180), 'horizontal-cover')
  assert.equal(getUpscaledContainObjectFit(180, 320), 'vertical-cover')
})

test('resizeSquareCrop follows Wetab fixed-square edge and corner resizing', () => {
  assert.deepEqual(resizeSquareCrop(120, 20, 0, 'e', 10, 280), {
    width: 160,
    height: 160,
  })
  assert.deepEqual(resizeSquareCrop(120, -20, 0, 'w', 10, 280), {
    width: 160,
    height: 160,
  })
  assert.deepEqual(resizeSquareCrop(120, 99, -15, 'nw', 10, 280), {
    width: 10,
    height: 10,
  })
  assert.deepEqual(resizeSquareCrop(120, 0, 30, 's', 10, 150), {
    width: 150,
    height: 150,
  })
})

test('normalizeRotation keeps rotations in the zero-to-360 range', () => {
  assert.equal(normalizeRotation(450), 90)
  assert.equal(normalizeRotation(-90), 270)
  assert.equal(normalizeRotation(720), 0)
})

test('getRotatedImageSize swaps rectangular dimensions at quarter turns', () => {
  assert.deepEqual(getRotatedImageSize(320, 180, 0), { width: 320, height: 180 })

  const rotated = getRotatedImageSize(320, 180, 90)
  assert.ok(Math.abs(rotated.width - 180) < 0.000001)
  assert.ok(Math.abs(rotated.height - 320) < 0.000001)
})

test('constrainMediaPositionToViewport keeps small images inside and zoomed images covering the viewport', () => {
  assert.deepEqual(constrainMediaPositionToViewport({ x: 80, y: -100 }, 272, 136, 0, 1, 272, 272), {
    x: 0,
    y: -68,
  })
  assert.deepEqual(constrainMediaPositionToViewport({ x: -90, y: 70 }, 272, 136, 90, 1, 272, 272), {
    x: -68,
    y: 0,
  })
  assert.deepEqual(
    constrainMediaPositionToViewport({ x: 500, y: -500 }, 272, 136, 0, 2, 272, 272),
    {
      x: 136,
      y: 0,
    }
  )
})
