import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getDesktopLargeFolderPreviewLayout } from './folderPreviewPolicy.ts'

const cases = [
  {
    folderSize: '2x1',
    childCount: 3,
    expected: { standardIconCount: 3, splitLastSlot: false, visibleIconCount: 3 },
  },
  {
    folderSize: '1x2',
    childCount: 4,
    expected: { standardIconCount: 2, splitLastSlot: true, visibleIconCount: 4 },
  },
  {
    folderSize: '2x1',
    childCount: 6,
    expected: { standardIconCount: 2, splitLastSlot: true, visibleIconCount: 6 },
  },
  {
    folderSize: '1x2',
    childCount: 7,
    expected: { standardIconCount: 2, splitLastSlot: true, visibleIconCount: 6 },
  },
  {
    folderSize: '2x2',
    childCount: 9,
    expected: { standardIconCount: 9, splitLastSlot: false, visibleIconCount: 9 },
  },
  {
    folderSize: '2x2',
    childCount: 10,
    expected: { standardIconCount: 8, splitLastSlot: true, visibleIconCount: 10 },
  },
  {
    folderSize: '2x2',
    childCount: 12,
    expected: { standardIconCount: 8, splitLastSlot: true, visibleIconCount: 12 },
  },
  {
    folderSize: '2x2',
    childCount: 13,
    expected: { standardIconCount: 8, splitLastSlot: true, visibleIconCount: 12 },
  },
]

for (const { folderSize, childCount, expected } of cases) {
  test(
    folderSize + ' folder with ' + childCount + ' children uses the expected preview layout',
    () => {
      assert.deepEqual(getDesktopLargeFolderPreviewLayout(folderSize, childCount), expected)
    }
  )
}
