import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildDropImpactKeyframes,
  resolveDropImpactStrength,
  resolveOuterDropImpactTarget,
} from './dropImpactMotion.ts'

test('drop impact strength fades smoothly with distance', () => {
  assert.equal(resolveDropImpactStrength(0, 100), 1)
  assert.equal(resolveDropImpactStrength(100, 100), 0)
  assert.ok(resolveDropImpactStrength(25, 100) > resolveDropImpactStrength(75, 100))
})

test('drop impact keyframes include a squash, rebound, and settled shape', () => {
  const keyframes = buildDropImpactKeyframes({
    deltaX: 72,
    deltaY: 0,
    radialOffsetX: 3,
    strength: 1,
  })

  assert.equal(keyframes.length, 5)
  assert.match(String(keyframes[1].transform), /scale\(0\.9[0-9]+, 1\.0[0-9]+\)/)
  assert.match(String(keyframes[2].transform), /scale\(1\.0[0-9]+, 0\.9[0-9]+\)/)
  assert.equal(keyframes[4].transform, 'translate3d(0, 0, 0) scale(1, 1) rotate(0deg)')
})

test('drop impact centers on the landed item after a reorder', () => {
  assert.deepEqual(
    resolveOuterDropImpactTarget({
      context: 'outer',
      draggingId: 'dragged',
      previewSlotIndex: 4,
      folderPreviewTargetId: null,
      hoverTargetId: 'neighbor',
    }),
    { itemId: 'dragged', targetId: 'dragged' }
  )
})

test('drop impact centers on the folder preview target when merging', () => {
  assert.deepEqual(
    resolveOuterDropImpactTarget({
      context: 'outer',
      draggingId: 'dragged',
      previewSlotIndex: 3,
      folderPreviewTargetId: 'folder-target',
      hoverTargetId: 'folder-target',
    }),
    { itemId: 'dragged', targetId: 'folder-target' }
  )
})

test('drop impact is skipped when the drag has no resolved landing slot', () => {
  assert.equal(
    resolveOuterDropImpactTarget({
      context: 'outer',
      draggingId: 'dragged',
      previewSlotIndex: null,
      folderPreviewTargetId: null,
      hoverTargetId: null,
    }),
    null
  )
})
