import {
  collectLauncherIdentities,
  normalizeLauncherName,
  normalizeLauncherPath,
} from './launcherIdentity.ts'

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

// 路径归一化：反斜杠、大小写、尾部斜杠都不应造成差异
assert(
  normalizeLauncherPath('C:\\Apps\\Foo\\') === 'c:/apps/foo',
  '路径应统一成小写正斜杠且去掉尾部斜杠'
)
assert(normalizeLauncherPath('  ') === '', '空白路径归一化为空串')

// 名字归一化：启动入口类扩展名、快捷方式后缀、重名计数都要剥掉
assert(normalizeLauncherName('Foo.lnk') === 'foo', '.lnk 应被剥掉')
assert(normalizeLauncherName('Foo.exe') === 'foo', '.exe 应被剥掉')
assert(
  normalizeLauncherName('Foo.exe - 快捷方式.lnk') === 'foo',
  '多层后缀应反复剥到干净'
)
assert(normalizeLauncherName('Foo - Shortcut.lnk') === 'foo', '英文快捷方式后缀应被剥掉')
assert(normalizeLauncherName('Foo (2).lnk') === 'foo', '重名计数应被剥掉')
assert(
  normalizeLauncherName('Photoshop (2024).lnk') === 'photoshop (2024)',
  '四位数字是版本号，不是重名计数，不能剥'
)
assert(normalizeLauncherName('Notes.txt') === 'notes.txt', '文档扩展名不属于启动入口，应保留')
assert(normalizeLauncherName('.lnk') === '.lnk', '只有扩展名时不应剥成空串')

// 同一性键：本体与指向它的同名快捷方式应落在同一个 target 键上
const exe = collectLauncherIdentities({ path: 'C:/Apps/Foo/Foo.exe', name: 'Foo.exe' })
const lnk = collectLauncherIdentities({
  path: 'C:/Users/me/Desktop/Foo.lnk',
  name: 'Foo.lnk',
  targetPath: 'C:\\Apps\\Foo\\Foo.exe',
})
assert(
  exe.some(identity => lnk.includes(identity)),
  '程序本体与指向它的同名快捷方式应共用同一性键'
)

// 目标相同但名字不同（命令提示符 vs 开发人员命令提示符）不能合并
const plainPrompt = collectLauncherIdentities({
  path: 'C:/Start Menu/命令提示符.lnk',
  name: '命令提示符.lnk',
  targetPath: 'C:/Windows/System32/cmd.exe',
})
const devPrompt = collectLauncherIdentities({
  path: 'C:/Start Menu/开发人员命令提示符.lnk',
  name: '开发人员命令提示符.lnk',
  targetPath: 'C:/Windows/System32/cmd.exe',
})
assert(
  !plainPrompt.some(identity => devPrompt.includes(identity)),
  '同目标但不同名的两个入口不应共用同一性键'
)

// 不同位置的同名文件夹是两个不同的东西
const folderA = collectLauncherIdentities({ path: 'C:/Work/Tools', name: 'Tools' })
const folderB = collectLauncherIdentities({ path: 'D:/Backup/Tools', name: 'Tools' })
assert(
  !folderA.some(identity => folderB.includes(identity)),
  '同名文件夹在不同位置时不应共用同一性键'
)

// 路径为空时不应产出无意义的键
assert(
  collectLauncherIdentities({ path: '', name: '' }).length === 0,
  '路径与目标都为空时不应产出同一性键'
)

console.log('启动入口同一性判定测试通过')
