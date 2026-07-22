import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clampCropCornerRadii,
  constrainCropFramePosition,
  constrainMediaPositionToViewport,
  extractImageColorAtViewportPoint,
  getImageBoundedSquareCropSize,
  getNextIconCropWheelZoom,
  getRotatedImageSize,
  getSourceImagePointAtViewportPoint,
  getUpscaledContainObjectFit,
  normalizeRotation,
  resizeCropCornerRadius,
  resizeSquareCrop,
  ICON_CROP_MAX_ZOOM,
  ICON_CROP_MIN_ZOOM,
  ICON_CROP_WHEEL_ENLARGE_FACTOR,
  ICON_CROP_WHEEL_SHRINK_FACTOR,
} from './imageCrop.ts'

test('icon crop zoom supports shrinking and enlarging the source image', () => {
  assert.equal(ICON_CROP_MIN_ZOOM, 0.1)
  assert.equal(ICON_CROP_MAX_ZOOM, 3)
  assert.equal(ICON_CROP_WHEEL_ENLARGE_FACTOR, 1.2)
  assert.equal(ICON_CROP_WHEEL_SHRINK_FACTOR, 0.85)
})

test('wheel zoom uses separate factors above and below the 1x baseline', () => {
  assert.equal(getNextIconCropWheelZoom(1, 1), 1.2)
  assert.equal(getNextIconCropWheelZoom(1, -1), 0.85)
  assert.equal(getNextIconCropWheelZoom(1.2, -1), 1)
  assert.equal(getNextIconCropWheelZoom(0.85, 1), 1)
  assert.equal(getNextIconCropWheelZoom(2.9, 1), 3)
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

test('crop corner radius handles grow inward and shrink outward independently', () => {
  assert.equal(resizeCropCornerRadius(0, 20, 20, 'nw', 60), 20)
  assert.equal(resizeCropCornerRadius(10, -20, 20, 'ne', 60), 30)
  assert.equal(resizeCropCornerRadius(30, 20, 20, 'se', 60), 10)
  assert.equal(resizeCropCornerRadius(10, 100, -100, 'sw', 60), 60)
})

test('crop corner radii stay inside half of the crop frame', () => {
  assert.deepEqual(clampCropCornerRadii({ nw: -5, ne: 30, se: 80, sw: 10 }, 40), {
    nw: 0,
    ne: 30,
    se: 40,
    sw: 10,
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

test('constrainMediaPositionToViewport stops image edges at the image viewport', () => {
  assert.deepEqual(
    constrainMediaPositionToViewport({ x: 500, y: -500 }, 300, 200, 0, 2, 300, 300),
    { x: 150, y: -50 }
  )
  assert.deepEqual(
    constrainMediaPositionToViewport({ x: 500, y: -500 }, 300, 200, 0, 0.5, 300, 300),
    { x: 75, y: -100 }
  )
})

test('constrainCropFramePosition keeps the crop frame inside the image viewport', () => {
  assert.deepEqual(
    constrainCropFramePosition({ x: 140, y: 90 }, { width: 100, height: 100 }, 300, 300),
    { x: 100, y: 90 }
  )
})

test('a crop frame touching an edge moves inward as it grows', () => {
  const grownSize = resizeSquareCrop(100, 20, 0, 'e', 10, 300)
  assert.deepEqual(grownSize, { width: 140, height: 140 })
  assert.deepEqual(constrainCropFramePosition({ x: -100, y: 0 }, grownSize, 300, 300), {
    x: -80,
    y: 0,
  })
})

test('viewport color sampling maps transformed display points back to source pixels', () => {
  const viewport = {
    crop: { x: 20, y: -10 },
    cropSize: { width: 200, height: 200 },
    mediaSize: { width: 200, height: 100, naturalWidth: 100, naturalHeight: 50 },
    zoom: 2,
    rotation: 0,
  }

  assert.deepEqual(
    getSourceImagePointAtViewportPoint({ x: 60, y: 10 }, viewport, {
      width: 100,
      height: 50,
    }),
    { x: 60, y: 30 }
  )
})

test('viewport color sampling accounts for image rotation and rejects points outside the image', () => {
  const viewport = {
    crop: { x: 0, y: 0 },
    cropSize: { width: 200, height: 200 },
    mediaSize: { width: 100, height: 50, naturalWidth: 100, naturalHeight: 50 },
    zoom: 1,
    rotation: 90,
  }

  const rotatedPoint = getSourceImagePointAtViewportPoint({ x: 0, y: 20 }, viewport, {
    width: 100,
    height: 50,
  })
  assert.ok(rotatedPoint)
  assert.ok(Math.abs(rotatedPoint.x - 70) < 0.000001)
  assert.ok(Math.abs(rotatedPoint.y - 25) < 0.000001)
  assert.equal(
    getSourceImagePointAtViewportPoint({ x: 80, y: 80 }, viewport, {
      width: 100,
      height: 50,
    }),
    null
  )
})

test('image color sampling returns RGB hex and ignores transparent pixels', async () => {
  let pixel = [12, 34, 56, 255]
  let sampledSourceRect = []
  const context = {
    clearRect() {},
    drawImage(_image, sourceX, sourceY, sourceWidth, sourceHeight) {
      sampledSourceRect = [sourceX, sourceY, sourceWidth, sourceHeight]
    },
    getImageData: () => ({ data: Uint8ClampedArray.from(pixel) }),
  }

  globalThis.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => context,
    }),
  }
  globalThis.Image = class {
    naturalWidth = 100
    naturalHeight = 50

    set src(_value) {
      this.onload()
    }
  }

  const viewport = {
    crop: { x: 0, y: 0 },
    cropSize: { width: 100, height: 100 },
    mediaSize: { width: 100, height: 50, naturalWidth: 100, naturalHeight: 50 },
    zoom: 1,
    rotation: 0,
  }
  assert.equal(
    await extractImageColorAtViewportPoint('data:image/png;base64,source', viewport, {
      x: 0,
      y: 0,
    }),
    '#0C2238'
  )
  assert.deepEqual(sampledSourceRect, [50, 25, 1, 1])

  pixel = [255, 255, 255, 0]
  assert.equal(
    await extractImageColorAtViewportPoint('data:image/png;base64,source', viewport, {
      x: 0,
      y: 0,
    }),
    null
  )

  delete globalThis.document
  delete globalThis.Image
})
