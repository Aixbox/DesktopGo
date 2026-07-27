import assert from 'node:assert/strict'
import test from 'node:test'
import { createAddIconDialogInitialState } from './addIconDialogState.ts'

test('new icon sessions start from the text icon defaults', () => {
  const state = createAddIconDialogInitialState(null)
  assert.equal(state.entryKind, 'app')
  assert.equal(state.selectedIconSource, 'text')
  assert.equal(state.iconText, 'D')
  assert.equal(state.targetPreviewLoading, false)
})

test('target drafts reuse their generated preview without loading again', () => {
  const state = createAddIconDialogInitialState({
    displayName: 'Terminal',
    targetPath: 'C:\\Windows\\System32\\cmd.exe',
    launchArguments: '',
    workingDirectory: '',
    customIconPath: '',
    generatedIconBase64: 'data:image/png;base64,target',
    iconSource: 'target',
  })

  assert.equal(state.entryKind, 'app')
  assert.equal(state.targetPreview, 'data:image/png;base64,target')
  assert.equal(state.targetPreviewLoading, false)
})

test('website drafts restore the extracted website preview', () => {
  const state = createAddIconDialogInitialState({
    entryKind: 'website',
    displayName: 'Example',
    targetPath: 'https://example.com',
    launchArguments: '',
    workingDirectory: '',
    customIconPath: '',
    websiteIconBase64: 'data:image/png;base64,website',
    iconSource: 'target',
  })

  assert.equal(state.entryKind, 'website')
  assert.deepEqual(state.websitePreviews, ['data:image/png;base64,website'])
  assert.equal(state.websitePreviewResolved, true)
})
