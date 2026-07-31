import { rankSearchHits } from './relevance.ts'

const hit = (name, path = `C:/Files/${name}`, runCount = 0) => ({
  name,
  path,
  parent: path.slice(0, Math.max(0, path.lastIndexOf('/'))),
  isFile: true,
  isFolder: false,
  iconBase64: '',
  highlightedName: name,
  highlightedPath: path,
  runCount,
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
  '精确匹配和前缀匹配应排在仅包含关键词的名称之前'
)

assertEqual(
  rankSearchHits([hit('notes'), hit('archive', 'C:/settings/archive')], 'settings', {
    matchPath: true,
  }),
  ['archive', 'notes'],
  '开启路径匹配后，路径命中应排在完全无关的结果之前'
)

assertEqual(
  rankSearchHits([hit('settings backup'), hit('settings tool'), hit('settings')], 'settings', {
    matchPath: false,
  }),
  ['settings', 'settings tool', 'settings backup'],
  '同为前缀匹配时名称更短的应更靠前'
)

assertEqual(
  rankSearchHits([hit('a-very-long-unrelated-name'), hit('-flavor'), hit('notes')], 'vs', {
    matchPath: false,
  }),
  ['a-very-long-unrelated-name', '-flavor', 'notes'],
  '一条都没匹配上时应保留提供方顺序，不能把名称最短的顶到首位'
)

assertEqual(
  rankSearchHits([hit('unrelated'), hit('vs code'), hit('my vs'), hit('-flavor')], 'vs', {
    matchPath: false,
  }),
  ['vs code', 'my vs', 'unrelated', '-flavor'],
  '没匹配上的结果应排在所有真实命中之后'
)

// 以下为本轮新增：Listary 式优先级与运行次数加权

assertEqual(
  rankSearchHits(
    [
      hit(
        'flavor.html',
        'D:/Program/maven-local-repository/wrapper/dists/gradle-8.12-all/h/docs/kotlin-dsl/-flavor/flavor.html'
      ),
      hit('flavor.md', 'D:/Project/notes/flavor.md'),
    ],
    'flavor',
    { matchPath: false }
  ),
  ['flavor.md', 'flavor.html'],
  '包管理器缓存里的生成文档应被降权到普通文件之后'
)

assertEqual(
  rankSearchHits(
    [
      hit('vscode.cmd', 'D:/Project/app/node_modules/.bin/vscode.cmd'),
      hit(
        'VSCode.exe - 快捷方式.lnk',
        'C:/Users/me/AppData/Roaming/Microsoft/Windows/Start Menu/Programs/VSCode.exe - 快捷方式.lnk'
      ),
    ],
    'vscode',
    { matchPath: false }
  ),
  ['VSCode.exe - 快捷方式.lnk', 'vscode.cmd'],
  '开始菜单的快捷方式应压过 node_modules 里的同名前缀匹配'
)

assertEqual(
  rankSearchHits([hit('report.txt'), hit('report.doc', 'C:/Files/report.doc', 30)], 'report', {
    matchPath: false,
  }),
  ['report.doc', 'report.txt'],
  '运行次数高的结果在匹配质量相同时应更靠前'
)

assertEqual(
  rankSearchHits(
    [
      hit('tool.exe', 'C:/Windows/WinSxS/amd64_x/tool.exe'),
      hit('toolbox.exe', 'D:/Apps/toolbox.exe'),
    ],
    'tool',
    { matchPath: false }
  ),
  ['toolbox.exe', 'tool.exe'],
  '系统组件目录的最强降权应压过更短名称带来的优势'
)

assertEqual(
  rankSearchHits(
    [hit('deep.log', 'C:/Windows/WinSxS/amd64_x/deep.log'), hit('nothing-here')],
    'deep',
    { matchPath: false }
  ),
  ['deep.log', 'nothing-here'],
  '被降权但真实命中的结果仍应排在完全没匹配上的结果之前'
)

assertEqual(
  rankSearchHits(
    [hit('b.txt', 'C:/Files/b.txt'), hit('a.txt', 'C:/Files/a.txt')],
    '.txt',
    { matchPath: false }
  ),
  ['b.txt', 'a.txt'],
  '各项完全同分时应稳定保留提供方顺序'
)

console.log('文件结果相关性排序测试通过')
