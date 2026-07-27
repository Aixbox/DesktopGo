import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  getAnchorCoordinateFromCells,
  getAnchorIndexFromCoordinate,
  getGridCoordinateForIndex,
  getLocalAnchorIndexFromCoordinate,
  projectCoordinateToNearestAnchorIndex,
} from './gridCoordinates.ts'

test('grid indices map to persisted page coordinates', () => {
  const cases = [
    { index: 0, expected: { page: 0, row: 0, col: 0 } },
    { index: 5, expected: { page: 0, row: 1, col: 2 } },
    { index: 6, expected: { page: 1, row: 0, col: 0 } },
    { index: 11, expected: { page: 1, row: 1, col: 2 } },
  ]

  cases.forEach(({ index, expected }) => {
    assert.deepEqual(getGridCoordinateForIndex(index, 3, 6), expected)
  })
})

test('the top-left occupied cell is the persisted anchor', () => {
  assert.deepEqual(
    getAnchorCoordinateFromCells([
      { page: 1, row: 1, col: 1 },
      { page: 0, row: 2, col: 0 },
      { page: 0, row: 1, col: 2 },
    ]),
    { page: 0, row: 1, col: 2 }
  )
  assert.equal(getAnchorCoordinateFromCells([]), null)
})

test('persisted coordinates reject invalid grid cells', () => {
  const invalidCoordinates = [
    { page: -1, row: 0, col: 0 },
    { page: 0, row: -1, col: 0 },
    { page: 0, row: 0, col: -1 },
    { page: 0, row: 0, col: 3 },
    { page: 0, row: 2, col: 0 },
    { page: 0.5, row: 0, col: 0 },
  ]

  invalidCoordinates.forEach(coordinate => {
    assert.equal(getAnchorIndexFromCoordinate(coordinate, 3, 6), null)
  })
})

test('local anchors ignore the persisted page while overflow projections stay on it', () => {
  assert.equal(getAnchorIndexFromCoordinate({ page: 2, row: 1, col: 1 }, 3, 6), 16)
  assert.equal(getLocalAnchorIndexFromCoordinate({ page: 2, row: 1, col: 1 }, 3, 6), 4)
  assert.equal(projectCoordinateToNearestAnchorIndex({ page: 2, row: 9, col: 9 }, 3, 6), 17)
  assert.equal(projectCoordinateToNearestAnchorIndex({ page: -1, row: 0, col: 0 }, 3, 6), null)
})
