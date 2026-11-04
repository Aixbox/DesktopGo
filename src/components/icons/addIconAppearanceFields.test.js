import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as iconColors from '../../lib/iconColors.ts'
import * as iconBackground from '../../lib/iconBackground.ts'

const require = createRequire(import.meta.url)
const code = ts.transpileModule(
  readFileSync(new URL('./AddIconFormSections.tsx', import.meta.url), 'utf8'),
  {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }
).outputText
const modules = {
  'react/jsx-runtime': require('react/jsx-runtime'),
  'lucide-react': require('lucide-react'),
  '@/lib/i18n': { translate: (text, params) => text.replace('{name}', params?.name ?? '') },
  '@/lib/iconColors': iconColors,
  '@/lib/iconBackground': iconBackground,
  './IconColorPicker': { IconColorPicker: 'IconColorPicker' },
  '@/lib/utils': { cn: (...classes) => classes.filter(Boolean).join(' ') },
  '@/components/ui/button': { Button: 'button' },
  '@/components/ui/input': { Input: 'input' },
}
const exports = {}
runInNewContext(code, {
  exports,
  require: name => {
    assert.ok(name in modules, `Unexpected module: ${name}`)
    return modules[name]
  },
})

function collect(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap(child => collect(child, predicate))
  if (!tree?.props) return []
  return [...(predicate(tree) ? [tree] : []), ...collect(tree.props.children, predicate)]
}

function render(overrides = {}) {
  return exports.AddIconAppearanceFields({
    entryKind: 'app',
    currentIconPreview: 'current.png',
    automaticPreview: 'automatic.png',
    automaticPreviewLabel: '自动提取',
    textIconPreview: 'text.png',
    websitePreviews: [],
    selectedIconSource: 'current',
    iconColor: 'none',
    iconText: '',
    customIconPath: 'custom.png',
    customPreview: 'custom.png',
    ...overrides,
  })
}

test('current artwork is first, before automatic, text and custom choices, and is the only selected choice', () => {
  const tree = render()
  const images = collect(tree, node => node.type === 'img').map(node => node.props.src)
  assert.deepEqual(images, ['current.png', 'automatic.png', 'text.png', 'custom.png'])
  const selected = collect(tree, node => node.props['aria-pressed'] === true)
  assert.equal(selected.length, 1)
  assert.equal(selected[0].props['aria-label'], '使用当前图标')
})

test('current artwork precedes all website candidates and can be reselected after editing', () => {
  let chosen
  const tree = render({
    entryKind: 'website',
    selectedIconSource: 'text',
    websitePreviews: ['website-a.png', 'website-b.png'],
    onIconSourceChange: value => {
      chosen = value
    },
  })
  const images = collect(tree, node => node.type === 'img').map(node => node.props.src)
  assert.deepEqual(images.slice(0, 3), ['current.png', 'website-a.png', 'website-b.png'])
  const current = collect(tree, node => node.props['aria-label'] === '使用当前图标')[0]
  assert.equal(current.props['aria-pressed'], false)
  current.props.onClick()
  assert.equal(chosen, 'current')
})

test('new icons have no current artwork choice and submission disables that choice', () => {
  const newIcon = render({ currentIconPreview: '', selectedIconSource: 'text' })
  assert.equal(collect(newIcon, node => node.props['aria-label'] === '使用当前图标').length, 0)
  const submitting = render({ disabled: true })
  const current = collect(submitting, node => node.props['aria-label'] === '使用当前图标')[0]
  assert.equal(current.props.disabled, true)
})

test('automatic, custom and website candidates preview the same shading used by enlarged icons', () => {
  for (const entryKind of ['app', 'website']) {
    const tree = render({ entryKind, iconColor: 'ocean', websitePreviews: ['website.png'] })
    const backgrounds = collect(tree, node => node.props.style?.backgroundColor)
    assert.equal(backgrounds.length, 2)
    for (const node of backgrounds) {
      assert.equal(node.props.style.backgroundColor, iconColors.resolveIconColor('ocean').color)
      assert.equal(node.props.style.backgroundImage, iconBackground.ICON_COLOR_SHADING)
    }
  }
})

test('color extraction samples the selected bitmap and waits for loading artwork', () => {
  for (const [selectedIconSource, overrides, expected] of [
    ['current', {}, 'current.png'],
    ['text', {}, 'text.png'],
    ['custom', {}, 'custom.png'],
    ['target', {}, 'automatic.png'],
    ['target', { entryKind: 'website', automaticPreview: 'website.png' }, 'website.png'],
    ['target', { automaticPreviewLoading: true }, ''],
    ['custom', { customPreviewLoading: true }, ''],
  ]) {
    const tree = render({ selectedIconSource, ...overrides })
    const picker = collect(tree, node => node.type === 'IconColorPicker')[0]
    assert.equal(picker.props.extractionSource, expected)
    assert.equal(picker.props.selectionKey, selectedIconSource)
  }
})
