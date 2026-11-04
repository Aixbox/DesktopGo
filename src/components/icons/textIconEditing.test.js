import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as textIcon from '../../lib/textIcon.ts'
import * as textColors from '../../lib/textIconColor.ts'
import * as dialogState from './addIconDialogState.ts'

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

test('text edits and color switches regenerate artwork; restoring current resets the original color and crop', () => {
  const cells = []
  let cursor = 0
  const initial = {
    ...dialogState.createAddIconDialogInitialState(null),
    iconText: '原图',
    iconTextColor: 'white',
    editedTextIconPreview: 'original-crop',
  }
  const { useTextIconDraft } = load('./useTextIconDraft.ts', {
    react: {
      useState: initial => {
        const index = cursor++
        if (!(index in cells)) cells[index] = initial
        return [
          cells[index],
          next => {
            cells[index] = next
          },
        ]
      },
      useMemo: compute => compute(),
    },
    '../../lib/textIcon': {
      ...textIcon,
      createTextIconDataUri: (text, background, _size, color) => `${text}/${background}/${color}`,
    },
    './addIconDialogState': dialogState,
  })
  const render = (background = 'ocean') => {
    cursor = 0
    return useTextIconDraft(initial, background)
  }
  assert.equal(render().textIconPreview, 'original-crop')
  render().changeTextColor('black')
  assert.equal(render().textIconPreview, '原图/ocean/black')
  assert.equal(render('#112233').textIconPreview, '原图/#112233/black')
  render().changeText(' 长文字123456 ')
  assert.equal(render().iconText, '长文字123')
  assert.equal(render().iconTextColor, 'black')
  render().setEditedTextIconPreview('new-crop')
  assert.equal(render().textIconPreview, 'new-crop')
  render().changeTextColor('white')
  assert.equal(render().textIconPreview, '长文字123/ocean/white')
  render().restore()
  assert.equal(render().iconTextColor, 'white')
  assert.equal(render().textIconPreview, 'original-crop')
  render().reset()
  assert.equal(render().textIconPreview, 'D/ocean/black')
})

test('text color controls are two labelled native radios with selection and disabled semantics', () => {
  const { TextIconColorPicker } = load('./TextIconColorPicker.tsx', {
    react: { useId: () => 'text-color' },
    'react/jsx-runtime': require('react/jsx-runtime'),
    '@/lib/i18n': { translate: text => text },
    '@/lib/textIconColor': textColors,
  })
  let selected
  const props = {
    value: 'white',
    disabled: false,
    onChange: value => {
      selected = value
    },
  }
  const tree = TextIconColorPicker(props)
  assert.equal(tree.type, 'fieldset')
  assert.equal(tree.props.children[0].props.children, '文字颜色')
  const labels = tree.props.children[1]
  const inputs = labels.map(label => label.props.children[0])
  assert.deepEqual(
    Array.from(inputs, input => input.props.type),
    ['radio', 'radio']
  )
  assert.deepEqual(
    Array.from(inputs, input => input.props.checked),
    [false, true]
  )
  assert.equal(inputs[0].props.name, inputs[1].props.name)
  assert.deepEqual(
    Array.from(labels, label => label.props.children[1].props.children[1]),
    ['黑色', '白色']
  )
  inputs[0].props.onChange()
  assert.equal(selected, 'black')
  assert.equal(TextIconColorPicker({ ...props, disabled: true }).props.disabled, true)
})
