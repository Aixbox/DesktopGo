import { collectBestMatches } from './bestMatch.ts'
import { normalizeLauncherPath } from './launcherIdentity.ts'

const icon = (id, name, targetPath = `C:/Apps/${name}.exe`) => ({
  id,
  name,
  path: `C:/Users/me/Desktop/${name}.lnk`,
  target_path: targetPath,
  icon_base64: '',
  item_type: 'shortcut',
})

const hit = (name, path, runCount = 0) => ({
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

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

const names = items => items.map(item => item.name)

const START_MENU = 'C:/Users/me/AppData/Roaming/Microsoft/Windows/Start Menu/Programs'

// 高优先级文件命中应该出现在最佳匹配里
const merged = collectBestMatches({
  icons: [icon('note', 'Notepad')],
  fileHits: [hit('VSCode.exe - 快捷方式.lnk', `${START_MENU}/VSCode.exe - 快捷方式.lnk`)],
  keyword: 'vscode',
  limit: 6,
})
assert(
  names(merged).includes('VSCode.exe - 快捷方式.lnk'),
  '开始菜单里的高优先级文件命中应进入最佳匹配'
)
assert(!names(merged).includes('Notepad'), '不匹配关键词的快捷方式不应出现')
assert(merged[0].kind === 'file', '只有文件命中时首位应为文件条目')

// 低优先级文件命中不应进入最佳匹配
const lowPriority = collectBestMatches({
  icons: [],
  fileHits: [hit('vscode.cmd', 'D:/Project/app/node_modules/.bin/vscode.cmd')],
  keyword: 'vscode',
  limit: 6,
})
assert(lowPriority.length === 0, 'node_modules 里的命中不应进入最佳匹配')

// 普通优先级也不够资格
const normalPriority = collectBestMatches({
  icons: [],
  fileHits: [hit('vscode.md', 'D:/Notes/vscode.md')],
  keyword: 'vscode',
  limit: 6,
})
assert(normalPriority.length === 0, '只有高优先级文件命中才有资格进入最佳匹配')

// 同分时启动台图标占优
const tie = collectBestMatches({
  icons: [icon('code', 'Code')],
  fileHits: [hit('Code', `${START_MENU}/Code`)],
  keyword: 'code',
  limit: 6,
})
assert(tie[0].kind === 'shortcut', '同分时用户亲手摆的启动台图标应靠前')

// 运行次数应该能把文件命中顶到快捷方式之前
const runCountWins = collectBestMatches({
  icons: [icon('editor', 'Editor')],
  fileHits: [hit('Editor.lnk', `${START_MENU}/Editor.lnk`, 40)],
  keyword: 'editor',
  limit: 6,
})
assert(
  runCountWins[0].kind === 'file',
  '运行次数足够高时文件命中应压过同名快捷方式'
)

// 启动次数加权同样生效
const usageWins = collectBestMatches({
  icons: [icon('a', 'Tool Alpha'), icon('b', 'Tool Beta')],
  fileHits: [],
  keyword: 'tool',
  limit: 6,
  usage: {
    version: 1,
    enabled: true,
    entries: { b: { launchCount: 20, lastLaunchedAt: 5 } },
  },
})
assert(usageWins[0].name === 'Tool Beta', '启动次数高的快捷方式应靠前')

// 同一条路径既在启动台又被 Everything 命中时只留一条
const deduped = collectBestMatches({
  icons: [
    {
      id: 'vs',
      name: 'Visual Studio Code',
      path: `${START_MENU}/Visual Studio Code.lnk`,
      target_path: 'C:/Editors/app.exe',
      icon_base64: '',
      item_type: 'shortcut',
    },
  ],
  fileHits: [hit('Visual Studio Code.lnk', `${START_MENU}\\Visual Studio Code.lnk`)],
  keyword: 'vscode',
  limit: 6,
})
assert(deduped.length === 1, `重复路径应去重，实际 ${deduped.length} 条`)
assert(deduped[0].kind === 'shortcut', '去重时应保留分数更高的启动台条目')

// 边界
assert(collectBestMatches({ icons: [], fileHits: [], keyword: '', limit: 6 }).length === 0, '空关键词应返回空')
assert(
  collectBestMatches({
    icons: [icon('a', 'Tool Alpha'), icon('b', 'Tool Beta')],
    fileHits: [],
    keyword: 'tool',
    limit: 1,
  }).length === 1,
  'limit 应生效'
)

// 目录表条目（无运行次数、无 highlighted 字段）应能靠词首缩写命中，
// 这是 Everything 的字面子串匹配做不到的那一类
const catalogHit = (name, path) => ({
  name,
  path,
  parent: path.slice(0, Math.max(0, path.lastIndexOf('/'))),
  isFile: false,
  isFolder: true,
  iconBase64: '',
  highlightedName: '',
  highlightedPath: '',
  runCount: 0,
})

const abbreviation = collectBestMatches({
  icons: [],
  fileHits: [catalogHit('Visual Studio Code', `${START_MENU}/Visual Studio Code`)],
  keyword: 'vscode',
  limit: 6,
})
assert(
  abbreviation.length === 1 && abbreviation[0].name === 'Visual Studio Code',
  'vscode 应通过词首缩写命中开始菜单里的 Visual Studio Code 目录'
)

const ideaCatalog = collectBestMatches({
  icons: [],
  fileHits: [catalogHit('IntelliJ IDEA', `${START_MENU}/JetBrains/IntelliJ IDEA`)],
  keyword: 'idea',
  limit: 6,
})
assert(ideaCatalog.length === 1, 'idea 应命中 IntelliJ IDEA')

// 带运行次数的 Everything 命中与目录表的同一条路径，去重后应保留前者
const dedupedAcrossSources = collectBestMatches({
  icons: [],
  fileHits: [
    hit('Visual Studio Code', `${START_MENU}/Visual Studio Code`, 12),
    catalogHit('Visual Studio Code', `${START_MENU}/Visual Studio Code`),
  ],
  keyword: 'vscode',
  limit: 6,
})
assert(
  dedupedAcrossSources.length === 1 && dedupedAcrossSources[0].hit.runCount === 12,
  '同路径跨来源去重时应保留带运行次数的那条'
)

// 「程序本体 + 指向它的快捷方式」去重 ------------------------------------------

const DESKTOP = 'C:/Users/me/Desktop'

/** 目标表的键必须是归一化后的路径，和最佳匹配内部的查表方式保持一致。 */
const targets = pairs =>
  new Map(pairs.map(([path, target]) => [normalizeLauncherPath(path), target]))

// 启动台图标与开始菜单里指向同一个程序的同名快捷方式只留一条
const curatedVsStartMenu = collectBestMatches({
  icons: [
    {
      id: 'vs',
      name: 'Visual Studio Code',
      path: `${DESKTOP}/Visual Studio Code.lnk`,
      target_path: 'C:/Editors/Code.exe',
      icon_base64: '',
      item_type: 'shortcut',
    },
  ],
  fileHits: [hit('Visual Studio Code.lnk', `${START_MENU}/Visual Studio Code.lnk`)],
  keyword: 'vscode',
  limit: 6,
  shortcutTargets: targets([
    [`${START_MENU}/Visual Studio Code.lnk`, 'C:\\Editors\\Code.exe'],
  ]),
})
assert(
  curatedVsStartMenu.length === 1 && curatedVsStartMenu[0].kind === 'shortcut',
  `指向同一个程序的同名快捷方式应合并成一条，实际 ${curatedVsStartMenu.length} 条`
)

// 程序本体与桌面上指向它的快捷方式只留一条
const exeVsShortcut = collectBestMatches({
  icons: [],
  fileHits: [hit('Foo.exe', `${DESKTOP}/Foo.exe`), hit('Foo.lnk', `${DESKTOP}/Foo.lnk`)],
  keyword: 'foo',
  limit: 6,
  shortcutTargets: targets([[`${DESKTOP}/Foo.lnk`, `${DESKTOP}/Foo.exe`]]),
})
assert(exeVsShortcut.length === 1, `程序本体与它的快捷方式应合并，实际 ${exeVsShortcut.length} 条`)

// Windows 自动加的「- 快捷方式」后缀不应妨碍认亲
const suffixedShortcut = collectBestMatches({
  icons: [],
  fileHits: [
    hit('Bar.exe', `${DESKTOP}/Bar.exe`),
    hit('Bar.exe - 快捷方式.lnk', `${DESKTOP}/Bar.exe - 快捷方式.lnk`),
  ],
  keyword: 'bar',
  limit: 6,
  shortcutTargets: targets([[`${DESKTOP}/Bar.exe - 快捷方式.lnk`, `${DESKTOP}/Bar.exe`]]),
})
assert(
  suffixedShortcut.length === 1,
  `「- 快捷方式」后缀的快捷方式应与本体合并，实际 ${suffixedShortcut.length} 条`
)

// 不同位置的同名文件夹不是一回事，不能合并
const sameNameFolders = collectBestMatches({
  icons: [],
  fileHits: [catalogHit('Tools', `${START_MENU}/Tools`), catalogHit('Tools', `${DESKTOP}/Tools`)],
  keyword: 'tools',
  limit: 6,
})
assert(sameNameFolders.length === 2, `同名文件夹应各留一条，实际 ${sameNameFolders.length} 条`)

// 目标相同但名字不同的两个入口（都指向 cmd.exe）不能合并
const promptEntries = collectBestMatches({
  icons: [],
  fileHits: [
    hit('Command Prompt.lnk', `${START_MENU}/Command Prompt.lnk`),
    hit('Developer Command Prompt.lnk', `${START_MENU}/Developer Command Prompt.lnk`),
  ],
  keyword: 'prompt',
  limit: 6,
  shortcutTargets: targets([
    [`${START_MENU}/Command Prompt.lnk`, 'C:/Windows/System32/cmd.exe'],
    [`${START_MENU}/Developer Command Prompt.lnk`, 'C:/Windows/System32/cmd.exe'],
  ]),
})
assert(
  promptEntries.length === 2,
  `同目标但不同名的入口应各留一条，实际 ${promptEntries.length} 条`
)

// 目标解析不出来时退化成按路径去重，不应误伤
const unresolvedTargets = collectBestMatches({
  icons: [],
  fileHits: [
    hit('Baz.lnk', `${START_MENU}/Baz.lnk`),
    hit('Baz.lnk', `${DESKTOP}/Baz.lnk`),
  ],
  keyword: 'baz',
  limit: 6,
})
assert(
  unresolvedTargets.length === 2,
  `目标未知的同名快捷方式应保守保留，实际 ${unresolvedTargets.length} 条`
)

console.log('最佳匹配合并排序测试通过')
