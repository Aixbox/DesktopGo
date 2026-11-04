import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as colors from '../../lib/iconColors.ts'
import * as iconBackground from '../../lib/iconBackground.ts'

const require = createRequire(import.meta.url)
const code = ts.transpileModule(
  readFileSync(new URL('./IconColorPicker.tsx', import.meta.url), 'utf8'),
  {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }
).outputText
const modules = {
  'react/jsx-runtime': require('react/jsx-runtime'),
  'lucide-react': { Ban: 'Ban', Check: 'Check', Palette: 'Palette' },
  '@/lib/i18n': { translate: text => text },
  '@/lib/iconColors': colors,
  '@/lib/iconBackground': iconBackground,
  '@/lib/utils': { cn: (...classes) => classes.filter(Boolean).join(' ') },
  './IconColorExtractionButton': { IconColorExtractionButton: 'IconColorExtractionButton' },
}
const exports = {}
runInNewContext(code, {
  exports,
  require: name => {
    assert.ok(name in modules, `Unexpected module: ${name}`)
    return modules[name]
  },
})

function elements(tree) {
  if (Array.isArray(tree)) return tree.flatMap(elements)
  if (!tree?.props) return []
  if (typeof tree.type === 'function') return elements(tree.type(tree.props))
  return [tree, ...elements(tree.props.children)]
}

test('the native custom color selector follows all preset swatches and forwards exact RGB', () => {
  const changes = []
  const nodes = elements(
    exports.IconColorPicker({ value: 'ocean', onChange: value => changes.push(value) })
  )
  const buttons = nodes.filter(node => node.type === 'button')
  const input = nodes.find(node => node.type === 'input')
  assert.equal(buttons.length, colors.ICON_COLOR_PRESETS.length)
  assert.ok(nodes.indexOf(input) > nodes.indexOf(buttons.at(-1)))
  assert.equal(input.props.type, 'color')
  assert.equal(input.props['aria-label'], '选择自定义图标颜色')
  assert.equal(input.props.value, colors.resolveIconColor('ocean').color)
  assert.equal(buttons[1].props.style.backgroundImage, iconBackground.ICON_COLOR_SHADING)
  input.props.onChange({ currentTarget: { value: '#A1B2C3' } })
  input.props.onChange({ currentTarget: { value: 'invalid' } })
  assert.deepEqual(changes, ['#a1b2c3'])
  buttons[0].props.onClick()
  assert.deepEqual(changes, ['#a1b2c3', 'none'])
})

test('saved custom colors display their hex value and are selected independently of presets', () => {
  const nodes = elements(exports.IconColorPicker({ value: '#123456', onChange: () => {} }))
  const input = nodes.find(node => node.type === 'input')
  const customSwatch = nodes.find(node => node.type === 'label')
  assert.equal(input.props.value, '#123456')
  assert.equal(customSwatch.props.style.backgroundColor, '#123456')
  assert.equal(customSwatch.props.style.backgroundImage, iconBackground.ICON_COLOR_SHADING)
  assert.equal(customSwatch.props.style.color, '#FFFFFF')
  assert.equal(nodes.filter(node => node.props['aria-pressed']).length, 0)
  assert.ok(
    nodes.some(node => node.type === 'span' && node.props.children === '自定义颜色 #123456')
  )
})

test('submitting disables both presets and the native custom color selector', () => {
  const nodes = elements(
    exports.IconColorPicker({ value: 'none', onChange: () => {}, disabled: true })
  )
  for (const control of nodes.filter(node => ['button', 'input'].includes(node.type))) {
    assert.equal(control.props.disabled, true)
  }
  assert.match(nodes.find(node => node.type === 'input').props.value, /^#[\da-f]{6}$/i)
})

test('extraction uses the same color-change handler and stays before the final custom picker', () => {
  const onChange = () => {}
  const nodes = elements(
    exports.IconColorPicker({
      value: 'ocean',
      onChange,
      extractionSource: 'data:image/png;base64,artwork',
      selectionKey: 'target',
      disabled: true,
    })
  )
  const extraction = nodes.find(node => node.type === 'IconColorExtractionButton')
  assert.equal(extraction.props.source, 'data:image/png;base64,artwork')
  assert.equal(extraction.props.selectionKey, 'target')
  assert.equal(extraction.props.onChange, onChange)
  assert.equal(extraction.props.disabled, true)
  assert.ok(nodes.indexOf(extraction) < nodes.findIndex(node => node.type === 'input'))
})
