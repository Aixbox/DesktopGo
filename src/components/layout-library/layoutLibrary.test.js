import test from 'node:test'
import assert from 'node:assert/strict'

import { prepareLayoutPayloadForApply } from './layoutLibrary.ts'

const payload = (overrides = {}) =>
  JSON.stringify({
    version: 9,
    items: [
      { type: 'icon', key: 'a' },
      { type: 'icon', key: 'b' },
    ],
    slots: ['a', 'b', null, null],
    dockKeys: ['b'],
    pageSize: 4,
    columns: 2,
    coordinates: [{ id: 'a', cells: [{ page: 0, row: 0, col: 0 }] }],
    geometryKey: 'medium:medium:true',
    ...overrides,
  })

test('keeps the stored slots when the grid geometry matches', () => {
  const raw = payload()
  assert.equal(prepareLayoutPayloadForApply(raw, 'medium:medium:true'), raw)
})

test('drops slots and coordinates when the grid geometry changed', () => {
  const parsed = JSON.parse(prepareLayoutPayloadForApply(payload(), 'large:small:false'))

  assert.deepEqual(parsed.slots, [])
  assert.equal(parsed.coordinates, undefined)
  assert.equal(parsed.geometryKey, 'large:small:false')
  assert.deepEqual(parsed.items, [
    { type: 'icon', key: 'a' },
    { type: 'icon', key: 'b' },
  ])
  assert.deepEqual(parsed.dockKeys, ['b'])
  assert.equal(parsed.version, 9)
})

test('treats a payload without geometry as a mismatch', () => {
  const parsed = JSON.parse(
    prepareLayoutPayloadForApply(payload({ geometryKey: undefined }), 'medium:medium:true')
  )
  assert.deepEqual(parsed.slots, [])
})

test('passes broken payloads through untouched', () => {
  assert.equal(prepareLayoutPayloadForApply('not json', 'medium:medium:true'), 'not json')
})
