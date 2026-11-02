import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFAULT_FOLDER_PREVIEW_THEME,
  shouldRenderFolderPreviewHolders,
} from './folderPreviewThemePolicy.ts'

test('default theme fills missing stacked preview slots', () => {
  assert.equal(shouldRenderFolderPreviewHolders(DEFAULT_FOLDER_PREVIEW_THEME), true)
})

test('night and themed icons suppress holder slots', () => {
  assert.equal(
    shouldRenderFolderPreviewHolders({
      isDefaultTheme: true,
      isNightIcon: true,
      isThemedIcon: false,
    }),
    false
  )
  assert.equal(
    shouldRenderFolderPreviewHolders({
      isDefaultTheme: true,
      isNightIcon: false,
      isThemedIcon: true,
    }),
    false
  )
})
