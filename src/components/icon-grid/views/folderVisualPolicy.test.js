import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  getClosedFolderDropPreview,
  getClosedFolderPreviewItems,
  getClosedFolderPreviewLayout,
  getDesktopLargeFolderPreviewLayout,
} from './folderPreviewPolicy.ts'
import {
  FOLDER_PREVIEW_ICON_FALLBACK_SCALE,
  FOLDER_PREVIEW_ICON_SCALE,
  FOLDER_STACKED_PREVIEW_GAP,
  FOLDER_STACKED_PREVIEW_PADDING,
  getFolderPreviewArtworkSize,
  getFolderStackedPreviewMetrics,
} from '../domain/folderPreviewMetrics.ts'

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

const closedCases = [
  [1, { standardIconCount: 1, stackedIconCount: 0, stackedSlotIndex: null }],
  [8, { standardIconCount: 8, stackedIconCount: 0, stackedSlotIndex: null }],
  [9, { standardIconCount: 9, stackedIconCount: 0, stackedSlotIndex: null }],
  [10, { standardIconCount: 8, stackedIconCount: 2, stackedSlotIndex: 8 }],
  [11, { standardIconCount: 8, stackedIconCount: 3, stackedSlotIndex: 8 }],
  [12, { standardIconCount: 8, stackedIconCount: 4, stackedSlotIndex: 8 }],
  [20, { standardIconCount: 8, stackedIconCount: 4, stackedSlotIndex: 8 }],
]

for (const [childCount, expected] of closedCases) {
  test(`ColorOS 2x2 closed preview uses the ninth slot correctly for ${childCount} items`, () => {
    const layout = getClosedFolderPreviewLayout('2x2', childCount)
    assert.equal(layout.columns, 3)
    assert.equal(layout.rows, 3)
    assert.deepEqual(
      {
        standardIconCount: layout.standardIconCount,
        stackedIconCount: layout.stackedIconCount,
        stackedSlotIndex: layout.stackedSlotIndex,
      },
      expected
    )
  })
}

test('closed preview keeps the shared item split deterministic', () => {
  const entries = Array.from({ length: 12 }, (_, index) => index)
  const preview = getClosedFolderPreviewItems(entries, '2x2')
  assert.deepEqual(preview.standardItems, entries.slice(0, 8))
  assert.deepEqual(preview.stackedItems, entries.slice(8, 12))
})

test('1x1 always previews at most four ordinary icons without a stacked last slot', () => {
  for (const mode of ['standard', 'four-grid', 'highlight']) {
    for (const count of [0, 1, 4, 5, 12, 30]) {
      const entries = Array.from({ length: count }, (_, index) => index)
      const preview = getClosedFolderPreviewItems(entries, '1x1', mode)
      assert.deepEqual(preview.standardItems, entries.slice(0, 4))
      assert.deepEqual(preview.stackedItems, [])
      assert.deepEqual(preview.layout, {
        columns: 2,
        rows: 2,
        slotCount: 4,
        standardIconCount: Math.min(count, 4),
        stackedIconCount: 0,
        stackedSlotIndex: null,
        visibleIconCount: Math.min(count, 4),
      })
      const drop = getClosedFolderDropPreview('1x1', count, 1, mode)
      assert.equal(drop.cells.length, 4)
      assert.equal(drop.cells.includes('stacked'), false)
    }
  }
})

test('minimum artwork sizes cannot exceed compact slots', () => {
  for (const slotSize of [0, 6, 9, 17, 27, 41]) {
    assert.ok(getFolderPreviewArtworkSize(slotSize, FOLDER_PREVIEW_ICON_SCALE, 20) <= slotSize)
    assert.ok(
      getFolderPreviewArtworkSize(slotSize, FOLDER_PREVIEW_ICON_FALLBACK_SCALE, 16) <= slotSize
    )
  }
})

test('closed folder drop preview shares the 3x3 grid and targets the ninth slot', () => {
  const beforeNine = getClosedFolderDropPreview('2x2', 8)
  assert.deepEqual(beforeNine.cells.slice(0, 9), [
    'occupied',
    'occupied',
    'occupied',
    'occupied',
    'occupied',
    'occupied',
    'occupied',
    'occupied',
    'next',
  ])
  assert.equal(beforeNine.nextSlotIndex, 8)

  const afterNine = getClosedFolderDropPreview('2x2', 9)
  assert.equal(afterNine.columns, 3)
  assert.equal(afterNine.rows, 3)
  assert.equal(afterNine.cells[8], 'next')
})

test('four-grid and highlight branches remain explicit policy variants', () => {
  const fourGrid = getClosedFolderPreviewLayout('2x2', 5, 'four-grid')
  assert.deepEqual(
    {
      columns: fourGrid.columns,
      rows: fourGrid.rows,
      standardIconCount: fourGrid.standardIconCount,
      stackedIconCount: fourGrid.stackedIconCount,
    },
    { columns: 2, rows: 2, standardIconCount: 3, stackedIconCount: 2 }
  )
  const highlightExactFill = getClosedFolderPreviewLayout('2x2', 6, 'highlight')
  assert.equal(highlightExactFill.standardIconCount, 6)
  assert.equal(highlightExactFill.stackedIconCount, 0)
})

test('large and narrow folder previews share artwork scale', () => {
  assert.equal(FOLDER_PREVIEW_ICON_SCALE, 0.84)
  assert.equal(FOLDER_PREVIEW_ICON_FALLBACK_SCALE, 0.68)
  assert.equal(getFolderPreviewArtworkSize(50, FOLDER_PREVIEW_ICON_SCALE), 42)
  assert.equal(getFolderPreviewArtworkSize(50, FOLDER_PREVIEW_ICON_FALLBACK_SCALE), 34)
})

test('stacked preview uses the same fixed 1px geometry as the 1x3 split preview', () => {
  assert.equal(FOLDER_STACKED_PREVIEW_PADDING, 1)
  assert.equal(FOLDER_STACKED_PREVIEW_GAP, 1)
  assert.deepEqual(getFolderStackedPreviewMetrics(41), {
    padding: 1,
    gap: 1,
    miniSize: 19,
  })
})
