import { resolveSearchPriority, DEFAULT_SEARCH_PRIORITY_RULES } from './priority.ts'

const assertPriority = (path, name, expected, message) => {
  const actual = resolveSearchPriority({ path, name })
  if (actual !== expected) {
    throw new Error(`${message}\n路径：${path}\n期望：${expected}\n实际：${actual}`)
  }
}

assertPriority(
  'C:/Users/binuo/AppData/Roaming/Microsoft/Windows/Start Menu/Programs/VSCode.exe - 快捷方式.lnk',
  'VSCode.exe - 快捷方式.lnk',
  'high',
  '开始菜单里的快捷方式应为高优先级'
)

assertPriority(
  'C:/Users/binuo/OneDrive/Desktop',
  'Desktop',
  'high',
  '桌面目录自身也应命中目录规则（末尾补斜杠）'
)

assertPriority(
  'D:/Project/self/DesktopGo/src/lib/search/relevance.ts',
  'relevance.ts',
  'normal',
  '普通源码文件不应被加权或降权'
)

assertPriority(
  'D:/Program/maven-local-repository/wrapper/dists/gradle-8.12-all/hash/gradle-8.12/docs/kotlin-dsl/gradle/org.gradle.nativeplatform/-flavor',
  '-flavor',
  'low',
  'Gradle wrapper 缓存里的生成文档应降权（真实案例）'
)

assertPriority(
  'D:/Project/self/DesktopGo/node_modules/.bin/vite.cmd',
  'vite.cmd',
  'low',
  'node_modules 内的文件应降权'
)

assertPriority(
  'D:/Project/app/node_modules/esbuild/bin/esbuild.exe',
  'esbuild.exe',
  'low',
  'node_modules 里的可执行文件仍是噪音'
)

// 高优先级只由目录决定：扩展名单独不足以让一个文件变成高优先级候选，
// 否则全盘的 .exe / .lnk 都会挤进「最佳匹配」。
assertPriority(
  'D:/Games/SomeGame/bin/launcher.exe',
  'launcher.exe',
  'normal',
  '任意目录下的 .exe 不应是高优先级'
)

assertPriority(
  'D:/Backup/Shortcuts/tool.lnk',
  'tool.lnk',
  'normal',
  '任意目录下的 .lnk 不应是高优先级'
)

assertPriority(
  'C:/Windows/WinSxS/amd64_something/comctl32.dll',
  'comctl32.dll',
  'ignored',
  '系统组件目录应为最强降权档'
)

assertPriority(
  'D:/Project/app/dist/assets/index-abc123.js.map',
  'index-abc123.js.map',
  'low',
  '构建产物目录与 .map 扩展名都应降权'
)

assertPriority(
  'c:/users/binuo/desktop/note.txt',
  'note.txt',
  'high',
  '目录匹配应忽略大小写'
)

assertPriority(
  'C:\\Users\\binuo\\Desktop\\note.txt',
  'note.txt',
  'high',
  '反斜杠路径应与正斜杠路径等价'
)

const ruleCount =
  DEFAULT_SEARCH_PRIORITY_RULES.folders.length + DEFAULT_SEARCH_PRIORITY_RULES.extensions.length
if (ruleCount < 30) {
  throw new Error(`默认规则表意外为空或过小：${ruleCount} 条`)
}

const customPriority = resolveSearchPriority(
  { path: 'D:/Scratch/tmp/foo.txt', name: 'foo.txt' },
  { folders: [{ priority: 'ignored', folder: '/scratch/' }], extensions: [] }
)
if (customPriority !== 'ignored') {
  throw new Error(`规则表应可被调用方替换，实际：${customPriority}`)
}

console.log('搜索优先级规则测试通过')
