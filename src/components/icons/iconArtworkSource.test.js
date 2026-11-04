import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as colors from '../../lib/iconColors.ts'
import * as textColors from '../../lib/textIconColor.ts'
import * as website from '../../lib/websiteIcon.ts'
import * as state from './addIconDialogState.ts'
import * as textIcon from '../../lib/textIcon.ts'
import { extractIconDominantColor } from '../../lib/iconDominantColor.ts'
import { buildQuickImportEditDraft } from '../quick-import/quickImportModel.ts'

function load(file, modules) {
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText
  runInNewContext(code, {
    exports,
    require: name => {
      assert.ok(name in modules, `Unexpected module: ${name}`)
      return modules[name]
    },
  })
  return exports
}

const draft = {
  displayName: 'Example',
  targetPath: 'C:\\app.exe',
  customIconPath: '',
  launchArguments: '',
  workingDirectory: '',
  iconSource: 'target',
  iconColor: '#d27d60',
  generatedIconBase64: 'composited',
  currentIconBase64: 'composited',
}

function originalService(invoke = async () => '') {
  return load('./iconOriginalArtwork.ts', {
    '@tauri-apps/api/core': { invoke },
    '../../lib/iconColors': colors,
    '../../lib/textIcon': {
      createTextIconDataUri: (text, background, size, color, outline) => {
        assert.equal(background, 'none')
        assert.equal(outline, false)
        return `${text}/${color}/${size}`
      },
    },
    '../../lib/textIconColor': textColors,
    '../../lib/websiteIcon': website,
    './addIconDialogState': state,
  })
}

test('saved artwork is sampled from its clean layer, text or original file, never its added background', async () => {
  const calls = []
  const service = originalService(async (command, args) => {
    calls.push([command, args])
    return command === 'extract_website_icon' ? { icon_base64: 'web-art' } : 'original-art'
  })
  assert.equal(service.initialIconArtwork(draft), null)
  assert.equal(
    service.initialIconArtwork({ ...draft, iconArtworkBase64: 'cropped-art' }),
    'cropped-art'
  )
  for (const iconTextColor of ['black', 'white']) {
    assert.equal(
      service.initialIconArtwork({ ...draft, iconSource: 'text', iconText: '字', iconTextColor }),
      `字/${iconTextColor}/256`
    )
  }
  assert.equal(service.initialIconArtwork({ ...draft, iconColor: 'none' }), 'composited')
  assert.equal(await service.loadOriginalIconArtwork(draft), 'original-art')
  assert.equal(calls.at(-1)[0], 'get_drag_preview_icon')
  assert.equal(calls.at(-1)[1].path, draft.targetPath)
  await service.loadOriginalIconArtwork({
    ...draft,
    iconSource: 'custom',
    customIconPath: 'C:\\raw.png',
  })
  assert.equal(calls.at(-1)[0], 'get_custom_icon_source')
  assert.equal(calls.at(-1)[1].path, 'C:\\raw.png')
  assert.equal(await service.loadOriginalIconArtwork({ ...draft, entryKind: 'website' }), 'web-art')
  await assert.rejects(
    originalService(async () => {
      throw new Error('source missing')
    }).loadOriginalIconArtwork(draft)
  )
})

test('crop, extract, switch image and extract again use raw pixels; the background is only composed for saving', async () => {
  const pixels = {
    text: new Uint8ClampedArray([0, 0, 0, 255, 210, 125, 96, 0]),
    automatic: new Uint8ClampedArray([40, 170, 90, 255, 210, 125, 96, 0]),
  }
  const { createIconCropResult } = load('./iconCropResult.ts', {
    '../../lib/imageCrop': { cropImageViewportDataUri: async source => source },
  })
  const viewport = { cropSize: { width: 128 }, cornerRadii: { nw: 4, ne: 8, se: 12, sw: 16 } }
  let background = draft.iconColor
  for (const source of ['text', 'automatic', 'automatic']) {
    const cropped = await createIconCropResult(source, viewport, 256, background)
    assert.equal(cropped.dataUri, source)
    assert.equal(cropped.colorId, background)
    assert.equal(cropped.cornerRadii.se, 24)
    background = extractIconDominantColor(pixels[cropped.dataUri])
    assert.equal(background, source === 'text' ? '#000000' : '#28aa5a')
  }
  const compositions = []
  const { createIconAppearanceDraft } = load('./iconAppearanceDraft.ts', {
    '../../lib/imageCrop': { ICON_CROP_OUTPUT_SIZE: 512 },
    '../../lib/textIcon': {
      ...textIcon,
      createColoredIconDataUri: async (source, color) => {
        compositions.push({ source, color })
        return `saved-${source}-${color}`
      },
    },
    '../../lib/websiteIcon': website,
    '../../lib/textIconColor': textColors,
    './addIconDialogState': state,
  })
  for (const selectedIconSource of ['text', 'custom', 'target']) {
    const saved = await createIconAppearanceDraft({
      initialDraft: null,
      entryKind: 'app',
      selectedIconSource,
      selectedPreview: 'display',
      selectedArtwork: 'automatic',
      editedRasterPreviews: ['display'],
      normalizedTargetPath: draft.targetPath,
      customIconPath: '',
      websitePreview: '',
      iconColor: background,
      iconText: '字',
      iconTextColor: 'white',
    })
    assert.equal(saved.iconArtworkBase64, 'automatic')
    assert.equal(saved.generatedIconBase64, 'saved-automatic-#28aa5a')
    assert.equal(compositions.at(-1).source, 'automatic')
    const reopened = buildQuickImportEditDraft({ edit: { ...draft, ...saved } })
    assert.equal(originalService().initialIconArtwork(reopened), 'automatic')
  }
})

test('original artwork loading blocks composite sampling, never falls back after failure, and ignores unmounted responses', async () => {
  async function harness() {
    const cells = [],
      effects = []
    let cursor = 0,
      fulfill,
      writes = 0
    const { useIconArtworkSource } = load('./useIconArtworkSource.ts', {
      react: {
        useState: initial => {
          const index = cursor++
          if (!(index in cells)) cells[index] = typeof initial === 'function' ? initial() : initial
          return [
            cells[index],
            value => {
              cells[index] = value
              writes += 1
            },
          ]
        },
        useEffect: (effect, deps) => {
          const index = cursor++,
            previous = cells[index]
          if (!previous || deps.some((dep, i) => dep !== previous.deps[i])) {
            effects.push(() => {
              previous?.cleanup?.()
              cells[index] = { deps, cleanup: effect() }
            })
          }
        },
      },
      './iconOriginalArtwork': {
        initialIconArtwork: () => null,
        loadOriginalIconArtwork: () =>
          new Promise(resolve => {
            fulfill = resolve
          }),
      },
    })
    return {
      render() {
        cursor = 0
        const resolve = useIconArtworkSource(draft)
        effects.splice(0).forEach(effect => effect())
        return resolve
      },
      async finish(value) {
        fulfill(value)
        await new Promise(resolve => setImmediate(resolve))
      },
      unmount() {
        cells.forEach(cell => cell?.cleanup?.())
      },
      writes: () => writes,
    }
  }
  const h = await harness()
  assert.equal(h.render()('composited'), '')
  assert.equal(h.render()('new-raw-image'), 'new-raw-image')
  await h.finish('original-art')
  assert.equal(h.render()('composited'), 'original-art')
  const failed = await harness()
  failed.render()
  await failed.finish('')
  assert.equal(failed.render()('composited'), '')
  const closed = await harness()
  closed.render()
  closed.unmount()
  await closed.finish('original-art')
  assert.equal(closed.writes(), 0)
})
