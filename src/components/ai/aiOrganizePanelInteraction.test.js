import test from 'node:test'
import assert from 'node:assert/strict'

import {
  resolveAiOrganizeComposerKeyAction,
  shouldRestoreAiOrganizeLayoutPreview,
} from './aiOrganizePanelInteraction.ts'

const keyInput = overrides => ({
  key: 'Enter',
  ctrlKey: false,
  shiftKey: false,
  isComposing: false,
  composerValue: 'Organize my work apps',
  hasComposerCommand: false,
  ...overrides,
})

test('sends ordinary and Ctrl+Enter input', () => {
  assert.equal(resolveAiOrganizeComposerKeyAction(keyInput()), 'send')
  assert.equal(resolveAiOrganizeComposerKeyAction(keyInput({ ctrlKey: true })), 'send')
})

test('keeps Shift+Enter, composing Enter, and other keys at their defaults', () => {
  assert.equal(resolveAiOrganizeComposerKeyAction(keyInput({ shiftKey: true })), 'default')
  assert.equal(resolveAiOrganizeComposerKeyAction(keyInput({ isComposing: true })), 'default')
  assert.equal(resolveAiOrganizeComposerKeyAction(keyInput({ key: 'Escape' })), 'default')
})

test('removes an empty composer command on Backspace', () => {
  assert.equal(
    resolveAiOrganizeComposerKeyAction(
      keyInput({ key: 'Backspace', composerValue: '', hasComposerCommand: true })
    ),
    'remove-command'
  )
})

test('only restores previews for terminating visibility changes', () => {
  assert.equal(
    shouldRestoreAiOrganizeLayoutPreview({ open: true, visible: true, hasOnCollapse: true }),
    false
  )
  assert.equal(
    shouldRestoreAiOrganizeLayoutPreview({ open: true, visible: false, hasOnCollapse: true }),
    false
  )
  assert.equal(
    shouldRestoreAiOrganizeLayoutPreview({ open: false, visible: true, hasOnCollapse: true }),
    true
  )
  assert.equal(
    shouldRestoreAiOrganizeLayoutPreview({ open: true, visible: false, hasOnCollapse: false }),
    true
  )
})
