import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ITEM_MENU_HIT_CLEARANCE,
  ITEM_MENU_GAP,
  itemFocusBackdropClip,
  getFocusVisualContour,
  isPointInFocusVisual,
  placeItemMenu,
} from './focusedItemMenuGeometry.ts'

const overlaps = (a, b) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y

test('menus stay in the viewport and outside icons, folders and their handle hit area', () => {
  for (const width of [360, 768, 1440])
    for (const height of [480, 900]) {
      const viewport = { left: 24, top: 24, width, height }
      for (const [itemWidth, itemHeight] of [
        [72, 96],
        [176, 96],
        [72, 208],
        [176, 208],
      ]) {
        for (const scale of [0.97, 1])
          for (const fx of [0, 0.5, 1])
            for (const fy of [0, 0.5, 1]) {
              const item = {
                left: viewport.left + 16 + fx * (width - itemWidth * scale - 32),
                top: viewport.top + 16 + fy * (height - itemHeight * scale - 32),
                width: itemWidth * scale,
                height: itemHeight * scale,
              }
              const menu = placeItemMenu(item, viewport, { width: 224, height: 320 })
              assert.ok(menu.x >= viewport.left + 8 - 1e-6)
              assert.ok(menu.y >= viewport.top + 8 - 1e-6)
              assert.ok(menu.x + menu.width <= viewport.left + width - 8 + 1e-6)
              assert.ok(menu.y + menu.height <= viewport.top + height - 8 + 1e-6)
              assert.equal(
                overlaps(menu, {
                  x: item.left - ITEM_MENU_HIT_CLEARANCE,
                  y: item.top - ITEM_MENU_HIT_CLEARANCE,
                  width: item.width + ITEM_MENU_HIT_CLEARANCE * 2,
                  height: item.height + ITEM_MENU_HIT_CLEARANCE * 2,
                }),
                false
              )
            }
      }
    }
})

test('the whole target determines menu placement on all four sides, including small windows', () => {
  const viewport = { left: 0, top: 0, width: 600, height: 600 }
  const size = { width: 176, height: 280 }
  const rect = (left, top, width = 100) => ({ left, top, width, height: 100 })
  assert.equal(placeItemMenu(rect(40, 40), viewport, size).side, 'right')
  assert.equal(placeItemMenu(rect(460, 40), viewport, size).side, 'left')
  assert.equal(placeItemMenu(rect(100, 40, 400), viewport, size).side, 'bottom')
  assert.equal(placeItemMenu(rect(100, 460, 400), viewport, size).side, 'top')
  const limited = placeItemMenu(rect(100, 100), { ...viewport, width: 320, height: 320 }, size)
  assert.ok(limited.width < size.width || limited.height < size.height)
  assert.ok(ITEM_MENU_GAP > ITEM_MENU_HIT_CLEARANCE)
})

test('the clear cutout follows the surface contour, not the title or invisible handle hot area', () => {
  const viewport = { left: 24, top: 24, width: 600, height: 400 }
  const visual = {
    left: 100,
    top: 120,
    width: 80,
    height: 100,
    radius: 18,
    exponent: 4,
    padding: 0,
  }
  const points = getFocusVisualContour(visual)
  assert.equal(Math.min(...points.map(p => p.x)), 100)
  assert.equal(Math.max(...points.map(p => p.x)), 180)
  assert.equal(Math.min(...points.map(p => p.y)), 120)
  assert.equal(Math.max(...points.map(p => p.y)), 220)
  assert.equal(
    isPointInFocusVisual(visual, 99.9, 170),
    false,
    'even the area immediately outside the edge is frosted'
  )
  assert.equal(isPointInFocusVisual(visual, 140, 224), false, 'title starts 4px below the surface')
  assert.equal(
    isPointInFocusVisual(visual, 97, 117),
    false,
    'rounded corner background stays veiled'
  )
  assert.equal(isPointInFocusVisual(visual, 140, 170), true)
  const clip = itemFocusBackdropClip(visual, viewport)
  assert.ok(clip.includes('76.0000px'))
  assert.ok(clip.includes('196.0000px'))
  assert.ok(
    !clip.includes('210.0000px'),
    'never add the old 14px hot-area padding to visual clarity'
  )
})
