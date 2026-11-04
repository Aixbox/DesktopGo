import assert from 'node:assert/strict'
import test from 'node:test'
import { getPagedGridInsets, getPagedGridGeometrySuffix } from './pagedGridMetrics.ts'
import {
  getIconGridRowHeight,
  ICON_SIZE_CONFIG,
  getIconGridTitleHeight,
} from '../../../types/index.ts'
import { getIconTileMetrics } from '../views/iconTileMetrics.ts'
import { getDesktopFolderTileMetrics } from '../views/folderVisualPolicy.ts'
import { syncPagedGridInsets } from '../hooks/pagedGridInsets.ts'
import { getDockButtonSize } from './dock.ts'

for (const size of ['small', 'medium', 'large']) {
  test(`${size}: title-aware cell height fits artwork, titles and equal square folder/icon surfaces`, () => {
    const config = ICON_SIZE_CONFIG[size]
    assert.ok(getIconGridRowHeight(size, 'one') < getIconGridRowHeight(size, 'two'))
    for (const titles of ['one', 'two']) {
      const height = getIconGridRowHeight(size, titles)
      const titleHeight = getIconGridTitleHeight(titles)
      assert.ok(config.imgSize + 8 + 4 + titleHeight <= height)
      for (const tileSize of ['1x1', '1x2', '2x1', '2x2']) {
        const input = {
          span: { cols: Number(tileSize[0]), rows: Number(tileSize[2]) },
          slotWidth: config.columnWidth,
          slotHeight: height,
          gridGap: 8,
          titleLineCount: titles,
        }
        const folder = getDesktopFolderTileMetrics({ ...input, folderSize: tileSize })
        const icon = getIconTileMetrics({ ...input, imageSize: config.imgSize })
        if (tileSize !== '1x1') assert.deepEqual(icon, folder)
        if (tileSize === '2x2') {
          assert.equal(icon.shapeWidth, icon.shapeHeight)
          assert.equal(icon.shapeWidth, config.columnWidth * 2)
        }
        for (const tile of [icon, folder]) {
          assert.ok(tile.shapeHeight <= tile.bodyHeight)
          assert.ok(tile.shapeWidth <= tile.bodyWidth)
          assert.ok(tile.shapeHeight + titleHeight + 12 <= tile.footprintHeight)
        }
      }
    }
  })

  test(`${size}: reserve the whole Dock and separate page controls from the last grid row`, () => {
    const dockTop = getDockButtonSize(ICON_SIZE_CONFIG[size].imgSize) + 24 + 2 + 20
    const insets = getPagedGridInsets(size, true)
    assert.equal(insets.paginationBottom - dockTop, 8)
    assert.equal(insets.bottom - (insets.paginationBottom + 20), 8)
    assert.equal(insets.top - 68, 12)
    const withoutDock = getPagedGridInsets(size, false)
    assert.ok(withoutDock.bottom < insets.bottom)
  })
}

test('measurement follows search and Dock bounds while ignoring the grid animation and layout drawer', () => {
  const variables = new Map()
  const viewport = {
    getBoundingClientRect: () => ({ top: 16, bottom: 736 }),
    closest: () => ({
      querySelector: () => ({ getBoundingClientRect: () => ({ bottom: 100, height: 60 }) }),
    }),
    querySelector: () => ({ getBoundingClientRect: () => ({ top: 620, height: 96 }) }),
    style: { setProperty: (key, value) => variables.set(key, value) },
  }
  syncPagedGridInsets({ closest: () => viewport }, 'medium', true)
  assert.equal(variables.get('--paged-grid-top'), '96px')
  assert.equal(variables.get('--paged-pagination-bottom'), '124px')
  assert.equal(variables.get('--paged-grid-bottom'), '152px')
  syncPagedGridInsets({ closest: () => viewport }, 'medium', false)
  assert.equal(variables.get('--paged-pagination-bottom'), '20px')
  assert.equal(variables.get('--paged-grid-bottom'), '48px')
})

test('title settings have distinct capacity identities and the default is two lines', () => {
  assert.equal(getPagedGridGeometrySuffix(), getPagedGridGeometrySuffix('two'))
  assert.notEqual(getPagedGridGeometrySuffix('one'), getPagedGridGeometrySuffix('two'))
})
