import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planFolderResize } from './folderResizeTransaction.ts'

const icon = key => ({ kind: 'icon', key, icon: { path: key } })
const folder = (size = '1x1') => ({
  kind: 'folder',
  id: 'docs',
  name: 'Docs',
  size,
  children: [],
})

test('resize plan keeps source anchor and migrates neighbors into a temporary order', () => {
  const items = [folder('1x1'), icon('a'), icon('b'), icon('c')]
  const result = planFolderResize({
    items,
    slots: ['folder:docs', 'a', 'b', 'c', null, null],
    folderId: 'docs',
    size: '2x2',
    columns: 3,
    pageSize: 6,
  })

  assert.ok(result)
  assert.equal(result.items.find(item => item.kind === 'folder')?.size, '2x2')
  assert.equal(result.slots[0], 'folder:docs')
  assert.equal(result.slots.includes('a'), true)
  assert.equal(result.slots.includes('b'), true)
  assert.equal(result.slots.includes('c'), true)
  assert.notEqual(result.slots[1], 'a')
})

test('resize plan is discardable and leaves the source snapshot untouched', () => {
  const items = [folder('2x2'), icon('a')]
  const slots = ['folder:docs', 'a', null, null, null, null]
  const result = planFolderResize({
    items,
    slots,
    folderId: 'docs',
    size: '1x1',
    columns: 3,
    pageSize: 6,
  })

  assert.ok(result)
  assert.equal(items[0].size, '2x2')
  assert.deepEqual(slots, ['folder:docs', 'a', null, null, null, null])
})

test('resize plan rejects a folder that is not in the outer slots', () => {
  const result = planFolderResize({
    items: [folder('1x1')],
    slots: [null, null, null],
    folderId: 'docs',
    size: '2x2',
    columns: 3,
    pageSize: 6,
  })
  assert.equal(result, null)
})
