import { rankSearchHits } from './relevance.ts'

const hit = (name, path = `C:/Files/${name}`) => ({
  name,
  path,
  parent: 'C:/Files',
  isFile: true,
  isFolder: false,
  iconBase64: '',
  highlightedName: name,
  highlightedPath: path,
})

const assertEqual = (actual, expected, message) => {
  const actualNames = actual.map(item => item.name)
  if (JSON.stringify(actualNames) !== JSON.stringify(expected)) {
    throw new Error(
      `${message}\n期望：${JSON.stringify(expected)}\n实际：${JSON.stringify(actualNames)}`
    )
  }
}

assertEqual(
  rankSearchHits([hit('settings backup'), hit('settings'), hit('my settings')], 'settings', {
    matchPath: false,
  }),
  ['settings', 'settings backup', 'my settings'],
  'exact and prefix names should rank before a name that only contains the keyword'
)

assertEqual(
  rankSearchHits([hit('notes'), hit('archive', 'C:/settings/archive')], 'settings', {
    matchPath: true,
  }),
  ['archive', 'notes'],
  'path matches should rank before unrelated results when path matching is enabled'
)

assertEqual(
  rankSearchHits([hit('a-very-long-unrelated-name'), hit('-flavor'), hit('notes')], 'vs', {
    matchPath: false,
  }),
  ['a-very-long-unrelated-name', '-flavor', 'notes'],
  'unmatched results should keep the provider order instead of promoting the shortest name'
)

assertEqual(
  rankSearchHits([hit('unrelated'), hit('vs code'), hit('my vs'), hit('-flavor')], 'vs', {
    matchPath: false,
  }),
  ['vs code', 'my vs', 'unrelated', '-flavor'],
  'unmatched results should stay behind every real match'
)

assertEqual(
  rankSearchHits([hit('settings backup'), hit('settings tool'), hit('settings')], 'settings', {
    matchPath: false,
  }),
  ['settings', 'settings tool', 'settings backup'],
  'shorter names should still win among results that did match'
)

console.log('文件结果相关性排序测试通过')
