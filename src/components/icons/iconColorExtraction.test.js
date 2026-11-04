import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as colors from '../../lib/iconColors.ts'
import { createIconAppearanceDraft } from './iconAppearanceDraft.ts'
import { createAddIconDialogInitialState } from './addIconDialogState.ts'

const require = createRequire(import.meta.url)
function load(file, modules) {
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const exports = {}
  runInNewContext(code, {
    exports,
    require: name => {
      assert.ok(name in modules, `Unexpected module: ${name}`)
      return modules[name]
    },
  })
  return exports
}

function harness() {
  const cells = [],
    effects = [],
    pending = [],
    changes = []
  let cursor = 0,
    writes = 0
  const react = {
    useRef: current => (cells[cursor++] ??= { current }),
    useMemo: (compute, dependencies) => {
      const index = cursor++,
        previous = cells[index]
      if (
        !previous ||
        dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))
      ) {
        cells[index] = { dependencies, value: compute() }
      }
      return cells[index].value
    },
    useState: initial => {
      const index = cursor++
      if (!(index in cells)) cells[index] = initial
      return [
        cells[index],
        next => {
          writes += 1
          cells[index] = next
        },
      ]
    },
    useLayoutEffect: (effect, dependencies) => {
      const index = cursor++,
        previous = cells[index]
      if (
        !previous ||
        !dependencies ||
        dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))
      ) {
        effects.push(() => {
          previous?.cleanup?.()
          cells[index] = { dependencies, cleanup: effect() }
        })
      }
    },
  }
  const { useIconColorExtraction } = load('./useIconColorExtraction.ts', {
    react,
    '../../lib/iconColorSampling': {
      loadIconColor: source =>
        new Promise((resolve, reject) => pending.push({ source, resolve, reject })),
    },
    '../../lib/iconColors': colors,
  })
  const options = {
    source: 'data:image/png;base64,original',
    selectionKey: 'current',
    value: 'none',
    disabled: false,
    onChange: color => changes.push(color),
  }
  return {
    options,
    pending,
    changes,
    writes: () => writes,
    render(overrides = {}) {
      Object.assign(options, overrides)
      cursor = 0
      const result = useIconColorExtraction({ ...options })
      effects.splice(0).forEach(effect => effect())
      return result
    },
    unmount: () => cells.forEach(cell => cell?.cleanup?.()),
  }
}

test('manual extraction applies the sampled color and preserves it through save and reopen', async () => {
  const h = harness()
  const request = h.render().extract()
  assert.equal(h.render().pending, true)
  assert.equal(h.pending[0].source, h.options.source)
  h.pending[0].resolve('#336699')
  await request
  assert.deepEqual(h.changes, ['#336699'])
  assert.equal(h.render().pending, false)
  const draft = {
    displayName: 'Example',
    targetPath: 'C:\\example.exe',
    launchArguments: '',
    workingDirectory: '',
    ...(await createIconAppearanceDraft({
      initialDraft: null,
      entryKind: 'app',
      selectedIconSource: 'target',
      selectedPreview: h.options.source,
      editedRasterPreviews: [],
      normalizedTargetPath: 'C:\\example.exe',
      customIconPath: '',
      websitePreview: '',
      iconColor: h.changes[0],
      iconText: '',
    })),
  }
  assert.equal(draft.iconColor, '#336699')
  assert.equal(createAddIconDialogInitialState(draft).iconColor, '#336699')
})

test('source, selection, manual color changes and submission invalidate pending extraction', async () => {
  for (const change of [
    { source: 'new-image' },
    { selectionKey: 'target' },
    { value: '#ffffff' },
    { disabled: true },
  ]) {
    const h = harness()
    const request = h.render().extract()
    assert.equal(h.render(change).pending, false)
    h.pending[0].resolve('#336699')
    await request
    assert.deepEqual(h.changes, [])
  }
})

test('switching away and back cannot revive an old request; unmount never applies its result', async () => {
  const h = harness()
  const request = h.render().extract()
  const source = h.options.source
  h.render({ source: 'new' })
  assert.equal(h.render({ source }).pending, false)
  h.pending[0].resolve('#336699')
  await request
  assert.deepEqual(h.changes, [])
  const next = h.render().extract()
  const writes = h.writes()
  h.unmount()
  h.pending[1].resolve('#123456')
  await next
  assert.deepEqual(h.changes, [])
  assert.equal(h.writes(), writes)
})

test('missing artwork is disabled; failed extraction leaves the color unchanged and can retry', async () => {
  const h = harness()
  await h.render({ source: '' }).extract()
  await h.render({ source: 'image', disabled: true }).extract()
  assert.equal(h.pending.length, 0)
  for (const failure of ['empty', 'rejected']) {
    const request = h.render({ disabled: false }).extract()
    if (failure === 'empty') h.pending.at(-1).resolve(null)
    else h.pending.at(-1).reject(new Error('decode failed'))
    await request
    assert.equal(h.render().failed, true)
    assert.deepEqual(h.changes, [])
  }
  const retry = h.render().extract()
  assert.equal(h.render().failed, false)
  h.pending.at(-1).resolve('#aabbcc')
  await retry
  assert.deepEqual(h.changes, ['#aabbcc'])
})

test('rapid repeated extraction only applies the newest request', async () => {
  const h = harness(),
    view = h.render()
  const first = view.extract(),
    second = view.extract()
  h.pending[1].resolve('#aabbcc')
  await second
  h.pending[0].resolve('#123456')
  await first
  assert.deepEqual(h.changes, ['#aabbcc'])
})

test('the extraction button exposes loading, unavailable and failure states', () => {
  let state = { pending: false, failed: false, extract: () => {} }
  const { IconColorExtractionButton } = load('./IconColorExtractionButton.tsx', {
    'react/jsx-runtime': require('react/jsx-runtime'),
    'lucide-react': { Pipette: 'Pipette', RefreshCw: 'RefreshCw' },
    '@/components/ui/button': { Button: 'button' },
    '@/lib/i18n': { translate: text => text },
    './useIconColorExtraction': { useIconColorExtraction: () => state },
  })
  const props = {
    source: 'image',
    selectionKey: 'target',
    value: 'none',
    disabled: false,
    onChange: () => {},
  }
  assert.equal(
    IconColorExtractionButton({ ...props, source: '' }).props.children[0].props.disabled,
    true
  )
  state = { ...state, pending: true }
  const loading = IconColorExtractionButton(props).props.children[0]
  assert.equal(loading.props['aria-busy'], true)
  assert.equal(loading.props.disabled, true)
  state = { ...state, pending: false, failed: true }
  const failure = IconColorExtractionButton(props).props.children
  assert.equal(failure[0].props.disabled, false)
  assert.equal(failure[1].props.role, 'status')
})
