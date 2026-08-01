import {
  buildSearchPriorityRules,
  resolveSearchPriority,
  DEFAULT_SEARCH_PRIORITY_RULES,
} from './priority.ts'

const assertPriority = (path, name, expected, message, rules) => {
  const actual = resolveSearchPriority({ path, name }, rules)
  if (actual !== expected) {
    throw new Error(`${message}\n路径：${path}\n期望：${expected}\n实际：${actual}`)
  }
}

const START_MENU = 'C:/Users/binuo/AppData/Roaming/Microsoft/Windows/Start Menu/Programs'
const DESKTOP = 'C:/Users/binuo/OneDrive/Desktop'

/** 典型配置：预设的开始菜单与桌面，外加一个绿色软件目录。 */
const rules = buildSearchPriorityRules({
  presetsApplied: true,
  folders: [
    { path: START_MENU, maxDepth: 4, enabled: true },
    { path: DESKTOP, maxDepth: 2, enabled: true },
    { path: 'D:\\Green', maxDepth: 0, enabled: true },
  ],
  extensions: [],
  includeFolders: true,
})

// 清单里的目录 → 高优先级

assertPriority(
  `${START_MENU}/VSCode.exe - 快捷方式.lnk`,
  'VSCode.exe - 快捷方式.lnk',
  'high',
  '清单里的开始菜单目录应为高优先级',
  rules
)

assertPriority(DESKTOP, 'Desktop', 'high', '目录自身也应命中前缀（末尾补斜杠）', rules)

assertPriority(
  'D:/Green/Tools/tool.exe',
  'tool.exe',
  'high',
  '自定义目录里的程序应判为高优先级',
  rules
)

assertPriority(
  'd:/green/tools/tool.exe',
  'tool.exe',
  'high',
  '前缀匹配应忽略大小写与斜杠方向',
  rules
)

assertPriority(
  'C:\\Users\\binuo\\OneDrive\\Desktop\\note.txt',
  'note.txt',
  'high',
  '反斜杠路径应与正斜杠路径等价',
  rules
)

// 前缀不该误伤兄弟目录，也不该像路径片段那样满盘乱命中

assertPriority(
  'D:/Greenhouse/tool.exe',
  'tool.exe',
  'normal',
  '前缀匹配不应误伤同名开头的兄弟目录',
  rules
)

assertPriority(
  'D:/Projects/desktop/index.html',
  'index.html',
  'normal',
  '路径里出现 desktop 字样不应被当成桌面',
  rules
)

// 不在清单里 / 已停用的目录 → 不加权

const withoutDesktop = buildSearchPriorityRules({
  presetsApplied: true,
  folders: [{ path: START_MENU, maxDepth: 4, enabled: true }],
  extensions: [],
  includeFolders: true,
})
assertPriority(
  `${DESKTOP}/note.txt`,
  'note.txt',
  'normal',
  '从清单里删掉桌面后，桌面文件不应再是高优先级',
  withoutDesktop
)
assertPriority(
  `${START_MENU}/App.lnk`,
  'App.lnk',
  'high',
  '删掉桌面不应影响开始菜单',
  withoutDesktop
)

const disabled = buildSearchPriorityRules({
  presetsApplied: true,
  folders: [{ path: 'D:\\Green', maxDepth: 2, enabled: false }],
  extensions: [],
  includeFolders: true,
})
assertPriority('D:/Green/Tools/tool.exe', 'tool.exe', 'normal', '停用的目录不应再加权', disabled)

// 降权规则与配置无关，且压得住高优先级目录

assertPriority(
  'D:/Project/self/DesktopGo/src/lib/search/relevance.ts',
  'relevance.ts',
  'normal',
  '普通源码文件不应被加权或降权',
  rules
)

assertPriority(
  'D:/Program/maven-local-repository/wrapper/dists/gradle-8.12-all/hash/gradle-8.12/docs/kotlin-dsl/gradle/org.gradle.nativeplatform/-flavor',
  '-flavor',
  'low',
  'Gradle wrapper 缓存里的生成文档应降权（真实案例）',
  rules
)

assertPriority(
  'D:/Green/app/node_modules/.bin/tool.exe',
  'tool.exe',
  'low',
  'node_modules 应压过清单目录的高优先级',
  rules
)

assertPriority(
  'C:/Windows/WinSxS/amd64_something/comctl32.dll',
  'comctl32.dll',
  'ignored',
  '系统组件目录应为最强降权档',
  rules
)

assertPriority(
  'D:/Project/app/dist/assets/index-abc123.js.map',
  'index-abc123.js.map',
  'low',
  '构建产物目录与 .map 扩展名都应降权',
  rules
)

// 无配置时只剩降权规则：高优先级完全来自用户的目录清单

if (DEFAULT_SEARCH_PRIORITY_RULES.roots.length !== 0) {
  throw new Error('默认规则不应包含任何高优先级目录')
}
assertPriority(
  `${START_MENU}/App.lnk`,
  'App.lnk',
  'normal',
  '没有配置时不该凭空假设开始菜单是高优先级'
)

const ruleCount =
  DEFAULT_SEARCH_PRIORITY_RULES.folders.length + DEFAULT_SEARCH_PRIORITY_RULES.extensions.length
if (ruleCount < 30) {
  throw new Error(`默认降权规则表意外为空或过小：${ruleCount} 条`)
}

const customPriority = resolveSearchPriority(
  { path: 'D:/Scratch/tmp/foo.txt', name: 'foo.txt' },
  { folders: [{ priority: 'ignored', folder: '/scratch/' }], roots: [], extensions: [] }
)
if (customPriority !== 'ignored') {
  throw new Error(`规则表应可被调用方替换，实际：${customPriority}`)
}

console.log('搜索优先级规则测试通过')
