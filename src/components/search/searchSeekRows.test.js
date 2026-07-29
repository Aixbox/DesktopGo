import assert from 'node:assert/strict'
import test from 'node:test'
import { projectSearchSeekRows } from './searchSeekRows.ts'

const hit = path => ({
  path,
  name: path,
  parent: 'C:\\results',
  isFile: true,
  isFolder: false,
  iconBase64: '',
  highlightedName: '',
  highlightedPath: '',
})

test('missing seek rows retain the last painted content without claiming exact data', () => {
  const retained = [hit('first.txt'), hit('second.txt')]
  const rows = [
    { index: 4_000, item: null },
    { index: 4_001, item: null },
  ]

  assert.deepEqual(projectSearchSeekRows(rows, retained), [
    { index: 4_000, item: retained[0], retained: true },
    { index: 4_001, item: retained[1], retained: true },
  ])
})

test('exact seek rows replace retained content immediately', () => {
  const exact = hit('exact.txt')

  assert.deepEqual(projectSearchSeekRows([{ index: 4_000, item: exact }], [hit('retained.txt')]), [
    { index: 4_000, item: exact, retained: false },
  ])
})
