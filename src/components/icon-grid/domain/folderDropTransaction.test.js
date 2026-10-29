import assert from 'node:assert/strict'
import test from 'node:test'
import { planFolderDropTransaction } from './folderDropTransaction.ts'

const icon = key => ({ kind: 'icon', key, icon: { name: key, path: key } })

test('folder drop de-duplicates incoming icons and preserves rank order', () => {
  const result = planFolderDropTransaction({
    currentChildren: [icon('a'), icon('b')],
    incomingChildren: [icon('b'), icon('c'), icon('c'), icon('d')],
    profile: { id: 'standard', columns: 2, rows: 2, previewCount: 2, stackedPreviewCount: 3 },
  })

  assert.equal(result.accepted, true)
  assert.equal(result.addedCount, 2)
  assert.deepEqual(result.nextChildren.map(child => child.key), ['a', 'b', 'c', 'd'])
  assert.equal(result.nextPageCount, 1)
})

test('bounded folder profile rejects the complete transaction without partial children', () => {
  const result = planFolderDropTransaction({
    currentChildren: [icon('a'), icon('b'), icon('c')],
    incomingChildren: [icon('d'), icon('e')],
    profile: {
      id: 'standard',
      columns: 2,
      rows: 2,
      previewCount: 2,
      stackedPreviewCount: 3,
      maxPages: 1,
    },
  })

  assert.equal(result.accepted, false)
  assert.equal(result.reason, 'capacity-exceeded')
  assert.equal(result.remaining, 1)
  assert.deepEqual(result.nextChildren.map(child => child.key), ['a', 'b', 'c'])
})

