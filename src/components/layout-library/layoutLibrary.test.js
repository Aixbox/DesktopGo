import test from 'node:test'
import assert from 'node:assert/strict'

import { prepareLayoutPayloadForApply } from './layoutLibrary.ts'
import {
  buildGridGeometryKey,
  isSamePagedLayoutConfiguration,
} from '../icon-grid/domain/gridGeometry.ts'

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

test('display and DPI changes preserve the full history payload including checksum and placements', () => {
  const key = (width, height, dpr) =>
    buildGridGeometryKey('medium', 'medium', true, {
      viewportWidth: width,
      viewportHeight: height,
      devicePixelRatio: dpr,
    })
  const oldKey = key(1328, 768, 2)
  const raw = payload({
    version: 10,
    geometryKey: oldKey,
    revision: 12,
    checksum: 'preserve-original-bytes',
    placements: [{ id: 'a', container: 'workspace', page: 0, row: 0, col: 0, spanX: 1, spanY: 1 }],
    folderProfileId: 'standard',
    hotseatEntries: [],
  })
  for (const current of [key(1280, 720, 1), key(640, 360, 2), 'medium:medium:true']) {
    assert.equal(prepareLayoutPayloadForApply(raw, current), raw)
    assert.equal(isSamePagedLayoutConfiguration('medium:medium:true', current), true)
  }
})

test('window mode, icon size, dock and extra configuration differences remain incompatible', () => {
  for (const changed of [
    'large:medium:true',
    'medium:small:true',
    'medium:medium:false',
    'medium:medium:true:other',
  ]) {
    assert.equal(isSamePagedLayoutConfiguration('medium:medium:true', changed), false)
  }
})
