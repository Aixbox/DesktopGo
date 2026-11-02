import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  FOLDER_RESIZE_HIGH_SLOPE,
  FOLDER_RESIZE_LOW_SLOPE,
  folderSizeFromSpan,
  getFolderResizeHandlePlacement,
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
  assert.deepEqual(getFolderResizeVisualGeometry({ cols: 1, rows: 1 }), {
    hotSize: 32,
    handleArcLength: 8 * Math.PI,
    frameStrokeWidth: 2,
    handleStrokeWidth: 6,
    backgroundPaddingX: 10,
    backgroundPaddingY: 16,
  })
  for (const span of [
    { cols: 1, rows: 1 },
    { cols: 1, rows: 2 },
    { cols: 2, rows: 1 },
    { cols: 2, rows: 2 },
  ]) {
    const visual = getFolderResizeVisualGeometry(span)
    assert.equal(visual.frameStrokeWidth, 2)
    assert.equal(visual.handleStrokeWidth, 6)
  }
  assert.equal(getFolderResizeVisualGeometry({ cols: 2, rows: 2 }).hotSize, 46)
  assert.equal(getFolderResizeVisualGeometry({ cols: 2, rows: 2 }).handleArcLength, 9 * Math.PI)
})

test('resize handle placement keeps the arc on the folder corner in both directions', () => {
  const geometry = getFolderResizeVisualGeometry({ cols: 2, rows: 2 })
  assert.deepEqual(getFolderResizeHandlePlacement(false, geometry), {
    side: 'right',
    horizontalInset: 10,
    bottomInset: 16,
  })
  assert.deepEqual(getFolderResizeHandlePlacement(true, geometry), {
    side: 'left',
    horizontalInset: 10,
    bottomInset: 16,
  })
})
