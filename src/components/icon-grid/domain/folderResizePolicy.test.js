import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  FOLDER_RESIZE_HIGH_SLOPE,
  FOLDER_RESIZE_LOW_SLOPE,
  folderSizeFromSpan,
  getFolderResizeVisualGeometry,
  getFolderResizeThreshold,
  resolveFolderResizeGesture,
} from './folderResizePolicy.ts'

const geometry = {
  cellWidth: 100,
  cellHeight: 100,
  spacingX: 8,
  spacingY: 8,
}

test('folder resize threshold uses the average cell stride and half dead zone', () => {
  const result = getFolderResizeThreshold(geometry)
  assert.equal(result.strideX, 108)
  assert.equal(result.strideY, 108)
  assert.equal(result.threshold, 108)
  assert.equal(result.deadZone, 54)
})

test('1x1 resize chooses horizontal, vertical, or diagonal growth', () => {
  const horizontal = resolveFolderResizeGesture({
    baseSpan: { cols: 1, rows: 1 },
    deltaX: 100,
    deltaY: 0,
    ...geometry,
  })
  const vertical = resolveFolderResizeGesture({
    baseSpan: { cols: 1, rows: 1 },
    deltaX: 0,
    deltaY: 100,
    ...geometry,
  })
  const diagonal = resolveFolderResizeGesture({
    baseSpan: { cols: 1, rows: 1 },
    deltaX: 100,
    deltaY: 100,
    ...geometry,
  })
  assert.deepEqual(horizontal.span, { cols: 2, rows: 1 })
  assert.deepEqual(vertical.span, { cols: 1, rows: 2 })
  assert.deepEqual(diagonal.span, { cols: 2, rows: 2 })
})

test('2x2 resize shrinks on the negative bottom-corner direction', () => {
  const result = resolveFolderResizeGesture({
    baseSpan: { cols: 2, rows: 2 },
    deltaX: -100,
    deltaY: -100,
    ...geometry,
  })
  assert.deepEqual(result.span, { cols: 1, rows: 1 })
  assert.equal(folderSizeFromSpan(result.span), '1x1')
})

test('dead zone and slope boundaries keep the current span', () => {
  const deadZone = resolveFolderResizeGesture({
    baseSpan: { cols: 1, rows: 1 },
    deltaX: 20,
    deltaY: 20,
    ...geometry,
  })
  const lowBoundary = resolveFolderResizeGesture({
    baseSpan: { cols: 1, rows: 1 },
    deltaX: 100,
    deltaY: 100 * FOLDER_RESIZE_LOW_SLOPE,
    ...geometry,
  })
  const highBoundary = resolveFolderResizeGesture({
    baseSpan: { cols: 1, rows: 1 },
    deltaX: 100,
    deltaY: 100 * FOLDER_RESIZE_HIGH_SLOPE,
    ...geometry,
  })
  assert.equal(deadZone.changed, false)
  assert.equal(lowBoundary.direction, 'horizontal')
  assert.equal(highBoundary.direction, 'vertical')
})

test('rtl mirrors horizontal intent without changing vertical intent', () => {
  const result = resolveFolderResizeGesture({
    baseSpan: { cols: 1, rows: 1 },
    deltaX: -100,
    deltaY: 0,
    rtl: true,
    ...geometry,
  })
  assert.deepEqual(result.span, { cols: 2, rows: 1 })
})

test('resize frame geometry follows the resource-backed 1x1 and expanded branches', () => {
  assert.deepEqual(getFolderResizeVisualGeometry({ cols: 1, rows: 1 }, false), {
    hotSize: 32,
    handleRadius: 16,
    frameStrokeWidth: 2,
    handleStrokeWidth: 6,
    backgroundPaddingX: 10,
    backgroundPaddingY: 16,
  })
  assert.equal(getFolderResizeVisualGeometry({ cols: 2, rows: 2 }, true).hotSize, 46)
  assert.equal(getFolderResizeVisualGeometry({ cols: 2, rows: 2 }, true).handleRadius, 18)
  assert.equal(getFolderResizeVisualGeometry({ cols: 2, rows: 2 }, true).frameStrokeWidth, 4)
})
