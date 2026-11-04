import assert from 'node:assert/strict'
import test from 'node:test'
import { createAddIconDialogInitialState } from './addIconDialogState.ts'
import { createIconAppearanceDraft } from './iconAppearanceDraft.ts'
import {
  buildQuickImportEditDraft,
  buildQuickImportEntryInput,
} from '../quick-import/quickImportModel.ts'

test('new icon sessions start from the text icon defaults', () => {
  const state = createAddIconDialogInitialState(null)
  assert.equal(state.entryKind, 'app')
  assert.equal(state.selectedIconSource, 'text')
  assert.equal(state.iconText, 'D')
  assert.equal(state.iconTextColor, 'black')
  assert.equal(state.targetPreviewLoading, false)
  assert.equal(state.currentIconPreview, '')
})

const originalDraft = {
  displayName: 'Terminal',
  targetPath: 'C:\\Apps\\terminal.exe',
  launchArguments: '',
  workingDirectory: '',
  customIconPath: '',
  generatedIconBase64: 'data:image/png;base64,current',
  currentIconBase64: 'data:image/png;base64,current',
  iconColor: 'none',
}

const appearanceInput = (overrides = {}) => ({
  initialDraft: { ...originalDraft, iconSource: 'target' },
  entryKind: 'app',
  selectedIconSource: 'current',
  selectedPreview: 'data:image/png;base64,alternative',
  editedRasterPreviews: [],
  normalizedTargetPath: originalDraft.targetPath,
  customIconPath: '',
  websitePreview: '',
  iconColor: 'none',
  iconText: '',
  iconTextColor: 'black',
  ...overrides,
})

test('existing target, custom and text icons are initially selected as the current icon', () => {
  for (const iconSource of ['target', 'custom', 'text']) {
    const state = createAddIconDialogInitialState({ ...originalDraft, iconSource })
    assert.equal(state.selectedIconSource, 'current')
    assert.equal(state.currentIconPreview, originalDraft.currentIconBase64)
    assert.equal(state.targetPreview, '')
    assert.equal(state.targetPreviewLoading, true)
  }
})

test('selecting current after an alternative restores original artwork and source metadata', async () => {
  for (const iconSource of ['target', 'custom', 'text']) {
    const draft = {
      ...originalDraft,
      iconSource,
      customIconPath: 'C:\\Images\\original.png',
      iconColor: 'ocean',
      iconText: '原图',
    }
    const result = await createIconAppearanceDraft(
      appearanceInput({
        initialDraft: draft,
        customIconPath: 'C:\\Images\\replacement.png',
        iconText: '新图',
        iconColor: 'coral',
      })
    )
    assert.equal(result.generatedIconBase64, draft.generatedIconBase64)
    assert.equal(result.iconSource, iconSource)
    assert.equal(result.iconColor, 'ocean')
    assert.equal(result.iconText, iconSource === 'text' ? '原图' : '')
    assert.equal(result.customIconPath, iconSource === 'custom' ? draft.customIconPath : '')
    assert.equal('currentIconBase64' in result, false)
  }
})

test('automatic extraction does not accidentally reuse the previously edited artwork', async () => {
  const result = await createIconAppearanceDraft(appearanceInput({ selectedIconSource: 'target' }))
  assert.equal(result.generatedIconBase64, '')
  assert.equal(result.iconSource, 'target')
})

test('current website icons retain their image when new website candidates have been extracted', async () => {
  const draft = {
    ...originalDraft,
    entryKind: 'website',
    targetPath: 'https://example.com',
    generatedIconBase64: '',
    websiteIconBase64: originalDraft.currentIconBase64,
    iconSource: 'target',
  }
  assert.equal(createAddIconDialogInitialState(draft).selectedIconSource, 'current')
  const result = await createIconAppearanceDraft(
    appearanceInput({ initialDraft: draft, entryKind: 'website' })
  )
  assert.equal(result.generatedIconBase64, draft.currentIconBase64)
  assert.equal(result.websiteIconBase64, draft.websiteIconBase64)
  assert.equal(result.iconSource, 'target')
})

test('current icons can fall back to the displayed preview when the canonical file is unavailable', async () => {
  const result = await createIconAppearanceDraft(
    appearanceInput({
      initialDraft: { ...originalDraft, generatedIconBase64: '', iconSource: 'target' },
    })
  )
  assert.equal(result.generatedIconBase64, originalDraft.currentIconBase64)
})

test('text and cropped custom candidates still save their chosen artwork', async () => {
  const text = await createIconAppearanceDraft(
    appearanceInput({ selectedIconSource: 'text', iconText: '新图' })
  )
  assert.equal(text.generatedIconBase64, 'data:image/png;base64,alternative')
  assert.equal(text.iconText, '新图')
  const custom = await createIconAppearanceDraft(
    appearanceInput({
      selectedIconSource: 'custom',
      customIconPath: 'C:\\Images\\replacement.png',
      editedRasterPreviews: ['data:image/png;base64,alternative'],
    })
  )
  assert.equal(custom.generatedIconBase64, 'data:image/png;base64,alternative')
  assert.equal(custom.customIconPath, 'C:\\Images\\replacement.png')
})

test('text color survives saving, reopening, current-artwork restoration and quick import', async () => {
  for (const iconTextColor of ['black', 'white']) {
    const appearance = await createIconAppearanceDraft(
      appearanceInput({
        selectedIconSource: 'text',
        iconText: '测试',
        iconTextColor,
      })
    )
    const draft = { ...originalDraft, ...appearance }
    assert.equal(appearance.iconTextColor, iconTextColor)
    assert.equal(createAddIconDialogInitialState(draft).iconTextColor, iconTextColor)
    const restored = await createIconAppearanceDraft(
      appearanceInput({
        initialDraft: draft,
        iconTextColor: iconTextColor === 'black' ? 'white' : 'black',
      })
    )
    assert.equal(restored.iconTextColor, iconTextColor)
    const app = { displayName: 'Example', sourcePath: draft.targetPath, preview: '', edit: draft }
    assert.equal(buildQuickImportEditDraft(app).iconTextColor, iconTextColor)
    assert.equal(buildQuickImportEntryInput(app).iconTextColor, iconTextColor)
  }
})

test('legacy text icons retain their artwork and derive the initial black or white selection', async () => {
  for (const [iconColor, expected] of [
    ['#123456', 'white'],
    ['ocean', 'black'],
  ]) {
    const draft = { ...originalDraft, iconSource: 'text', iconColor }
    const state = createAddIconDialogInitialState(draft)
    assert.equal(state.iconTextColor, expected)
    assert.equal(state.editedTextIconPreview, draft.generatedIconBase64)
    const saved = await createIconAppearanceDraft(appearanceInput({ initialDraft: draft }))
    assert.equal(saved.generatedIconBase64, draft.generatedIconBase64)
    assert.equal(saved.iconTextColor, undefined)
  }
  const raster = await createIconAppearanceDraft(
    appearanceInput({
      selectedIconSource: 'target',
      iconTextColor: 'white',
    })
  )
  assert.equal(raster.iconTextColor, undefined)
})

test('quick import editing supplies the current preview without changing the stored source', () => {
  const draft = buildQuickImportEditDraft({
    displayName: 'Terminal',
    sourcePath: originalDraft.targetPath,
    preview: originalDraft.currentIconBase64,
  })
  assert.equal(draft.currentIconBase64, originalDraft.currentIconBase64)
  assert.equal(draft.iconSource, 'target')
  assert.equal(createAddIconDialogInitialState(draft).selectedIconSource, 'current')
})

test('custom colors survive save and reopen for text, custom and target icons', async () => {
  for (const iconSource of ['text', 'custom', 'target']) {
    const draft = { ...originalDraft, iconSource, iconColor: '#a1b2c3' }
    const state = createAddIconDialogInitialState(draft)
    assert.equal(state.iconColor, '#a1b2c3')
    const saved = await createIconAppearanceDraft(appearanceInput({ initialDraft: draft }))
    assert.equal(saved.iconColor, '#a1b2c3')
    assert.equal(saved.generatedIconBase64, originalDraft.currentIconBase64)
    assert.equal(createAddIconDialogInitialState({ ...draft, ...saved }).iconColor, '#a1b2c3')
  }
  assert.equal(
    createAddIconDialogInitialState({ ...originalDraft, iconColor: '#A1B2C3' }).iconColor,
    '#a1b2c3'
  )
  assert.equal(
    createAddIconDialogInitialState({ ...originalDraft, iconColor: 'invalid' }).iconColor,
    'none'
  )
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
