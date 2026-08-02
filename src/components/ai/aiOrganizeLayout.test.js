import test from 'node:test'
import assert from 'node:assert/strict'

import { buildAiOrganizeLayoutWrite, resolveAiOrganizeLayoutScope } from './aiOrganizeLayout.ts'
import {
  AiOrganizePreviewRefreshError,
  clearAiOrganizePreviewSessionState,
  isAiOrganizePreviewRefreshError,
  markAiOrganizePreviewLayoutWritten,
  resolveAiOrganizePreviewViewMode,
} from './useAiOrganizeLayoutPreview.helpers.ts'

const defaultName = index => `Group ${index + 1}`
const icon = key => ({ kind: 'icon', key })
const folder = id => ({ kind: 'folder', id, name: id, size: '1x1', children: [] })
const layout = ({ slots = [], scrollGroups, explicit = false, pageSize } = {}) => ({
  items: [],
  slots,
  dockKeys: [],
  scrollGroups,
  scrollGroupItemsExplicit: explicit,
  pageSize,
})

test('maps paged mode to paged scope without creating scroll groups', () => {
  assert.equal(resolveAiOrganizeLayoutScope('paged'), 'paged')
  assert.deepEqual(
    buildAiOrganizeLayoutWrite({
      viewMode: 'paged',
      items: [icon('a')],
      baselineLayout: layout({
        scrollGroups: [{ id: 'old', name: 'Old', icon: 'code', itemIds: ['a'] }],
      }),
      defaultScrollGroupName: defaultName,
    }),
    { scope: 'paged' }
  )
})

test('keeps the captured preview scope when the current view mode changes', () => {
  assert.equal(resolveAiOrganizePreviewViewMode('scroll', 'paged'), 'scroll')
  assert.equal(resolveAiOrganizePreviewViewMode(undefined, 'paged'), 'paged')
})

test('clears baseline and dirty flags when an AI preview session is reset', () => {
  const state = clearAiOrganizePreviewSessionState(
    {
      baseline: { viewMode: 'scroll' },
      baselineCaptured: true,
      dirty: true,
      applied: true,
    }
  )

  assert.deepEqual(state, {
    baseline: null,
    baselineCaptured: false,
    dirty: false,
    applied: false,
  })
})

test('keeps the preview baseline after a written layout cannot refresh', () => {
  const baseline = { viewMode: 'scroll' }
  const state = markAiOrganizePreviewLayoutWritten({
    baseline,
    baselineCaptured: true,
    dirty: false,
    applied: false,
  })

  assert.deepEqual(state, {
    baseline,
    baselineCaptured: true,
    dirty: true,
    applied: false,
  })
  assert.equal(state.baseline, baseline)
})

test('classifies a post-write preview refresh failure without losing its cause', () => {
  const cause = new Error('refresh rejected')
  const error = new AiOrganizePreviewRefreshError(cause)

  assert.equal(isAiOrganizePreviewRefreshError(error), true)
  assert.equal(error.cause, cause)
  assert.equal(isAiOrganizePreviewRefreshError(cause), false)
})

test('preserves explicit scroll group metadata and order while normalizing memberships', () => {
  const result = buildAiOrganizeLayoutWrite({
    viewMode: 'scroll',
    items: [icon('a'), icon('b'), folder('folder-1'), icon('c')],
    baselineLayout: layout({
      explicit: true,
      scrollGroups: [
        { id: 'work', name: ' Work ', icon: 'briefcase', itemIds: ['b', 'missing', 'a', 'b'] },
        { id: 'play', name: 'Play', icon: 'gamepad', itemIds: ['c', 'a'] },
      ],
    }),
    defaultScrollGroupName: defaultName,
  })

  assert.equal(result.scope, 'scroll')
  assert.deepEqual(result.scrollGroups, [
    { id: 'work', name: 'Work', icon: 'briefcase', itemIds: ['b', 'a'] },
    { id: 'play', name: 'Play', icon: 'gamepad', itemIds: ['c', 'folder:folder-1'] },
  ])

  const representedIds = result.scrollGroups.flatMap(group => group.itemIds)
  assert.deepEqual([...representedIds].sort(), ['a', 'b', 'c', 'folder:folder-1'])
  assert.equal(new Set(representedIds).size, 4)
})

test('migrates legacy slots after removing desktop and customapp prefixes', () => {
  const result = buildAiOrganizeLayoutWrite({
    viewMode: 'scroll',
    items: [icon('a'), icon('b'), icon('c'), folder('folder-1')],
    baselineLayout: layout({
      slots: ['desktop:a', 'customapp:b', null, 'c'],
      pageSize: 2,
      scrollGroups: [
        { id: 'first', name: 'First', icon: 'grid', itemIds: [] },
        { id: 'second', name: 'Second', icon: 'code', itemIds: [] },
      ],
    }),
    defaultScrollGroupName: defaultName,
  })

  assert.deepEqual(result.scrollGroups, [
    { id: 'first', name: 'First', icon: 'grid', itemIds: ['a', 'b'] },
    { id: 'second', name: 'Second', icon: 'code', itemIds: ['c', 'folder:folder-1'] },
  ])
})

test('creates one default group for an empty scroll baseline', () => {
  const result = buildAiOrganizeLayoutWrite({
    viewMode: 'scroll',
    items: [folder('folder-1'), icon('a')],
    baselineLayout: null,
    defaultScrollGroupName: defaultName,
  })

  assert.deepEqual(result.scrollGroups, [
    {
      id: 'scroll-group-migrated-1',
      name: 'Group 1',
      icon: 'grid',
      itemIds: ['folder:folder-1', 'a'],
    },
  ])
})
