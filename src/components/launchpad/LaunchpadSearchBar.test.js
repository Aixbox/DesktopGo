import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const exports = {}
const modules = {
  'react/jsx-runtime': require('react/jsx-runtime'),
  'lucide-react': require('lucide-react'),
  '@/lib/i18n': { translate: text => text },
  '@/components/search/SearchFloatingMenu': { SearchFloatingMenu: 'SearchFloatingMenu' },
}
runInNewContext(
  ts.transpileModule(readFileSync(new URL('./LaunchpadSearchBar.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText,
  {
    exports,
    require: name => {
      assert.ok(name in modules, `Unexpected module: ${name}`)
      return modules[name]
    },
  }
)

function collect(node, predicate) {
  if (Array.isArray(node)) return node.flatMap(child => collect(child, predicate))
  if (!node?.props) return []
  return [...(predicate(node) ? [node] : []), ...collect(node.props.children, predicate)]
}

const baseProps = {
  searchSource: 'all',
  keyword: '',
  inputRef: { current: null },
  filterButtonRef: { current: null },
  filterMenuRef: { current: null },
  isFilterMenuOpen: false,
  filterOptions: [],
  filter: 'all',
  selectedFilterLabel: '全部',
}

test('all search sources use one material container with a transparent input', () => {
  for (const searchSource of ['all', 'everything', 'icons']) {
    const tree = exports.LaunchpadSearchBar({ ...baseProps, searchSource })
    const surfaces = collect(tree, node =>
      node.props.className?.includes('launchpad-material-surface')
    )
    assert.deepEqual(surfaces, [tree])
    assert.equal(tree.type, 'div')
    assert.match(tree.props.className, /h-11.*rounded-full/)
    const [input] = collect(tree, node => node.type === 'input')
    assert.equal(input.props.ref, baseProps.inputRef)
    assert.match(input.props.className, /appearance-none/)
    assert.match(input.props.className, /bg-transparent/)
    assert.doesNotMatch(input.props.className, /launchpad-glass-panel|launchpad-material-surface/)
    const buttons = collect(tree, node => node.props.className?.includes('launchpad-search-filter'))
    assert.equal(buttons.length, searchSource === 'icons' ? 0 : 1)
    if (buttons.length) {
      assert.match(buttons[0].props.className, /focus-visible:outline/)
      assert.match(buttons[0].props.className, /launchpad-glass-button/)
      assert.doesNotMatch(buttons[0].props.className, /bg-transparent|launchpad-material-surface/)
    }
  }
})

test('input and filter actions remain attached when the background moves to their container', () => {
  const events = []
  const tree = exports.LaunchpadSearchBar({
    ...baseProps,
    keyword: 'existing',
    isFilterMenuOpen: true,
    filterOptions: [{ value: 'documents', label: '文档' }],
    onKeywordChange: value => events.push(value),
    onInputFocus: () => events.push('focus'),
    onInputKeyDown: event => events.push(event.key),
    onFilterToggle: () => events.push('toggle'),
    onFilterSelect: value => events.push(value),
  })
  const [input] = collect(tree, node => node.type === 'input')
  assert.equal(input.props.value, 'existing')
  assert.equal(input.props['aria-label'], '搜索全部内容')
  input.props.onChange({ target: { value: 'query' } })
  input.props.onFocus()
  input.props.onKeyDown({ key: 'Enter' })
  const [filter] = collect(tree, node => node.props.className?.includes('launchpad-search-filter'))
  filter.props.onClick()
  const [menu] = collect(tree, node => node.type === 'SearchFloatingMenu')
  assert.equal(menu.props.open, true)
  assert.equal(menu.props.triggerRef, baseProps.filterButtonRef)
  assert.equal(menu.props.menuRef, baseProps.filterMenuRef)
  collect(menu, node => node.type === 'button')[0].props.onClick()
  assert.deepEqual(events, ['query', 'focus', 'Enter', 'toggle', 'documents'])
})
