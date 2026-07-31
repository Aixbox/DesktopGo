/**
 * 「最佳匹配」的同一性判定。
 *
 * 同一个程序常常同时以好几种身份出现在候选池里：程序本体（`Foo.exe`）、开始菜单里
 * 指向它的 `Foo.lnk`、桌面上的 `Foo.lnk`、以及用户摆到启动台里的图标。它们路径各不
 * 相同，按路径去重挡不住，结果最佳匹配的前几行被同一个东西占满。
 *
 * 判定要求两件事同时成立才算「同一个」：
 *
 * 1. 归一化后的**目标路径**相同 —— 快捷方式用解析出来的目标，其它条目用自身路径；
 * 2. 归一化后的**显示名**相同 —— 去掉 `.lnk`/`.exe` 这类后缀、Windows 自动加的
 *    「- 快捷方式」/「- Shortcut」，以及 `(2)` 这种重名计数。
 *
 * 「同名」这道闸是刻意留的：`命令提示符.lnk` 和 `开发人员命令提示符.lnk` 都指向
 * `cmd.exe`（只差启动参数），是两个不同的入口，不能合并。
 *
 * 同名文件夹天然不会被误合并 —— 文件夹的「目标」就是它自己的路径，两个不同位置的
 * 同名文件夹目标不同，各留一条。
 */

/** 归一化路径：反斜杠转正斜杠、去掉尾部斜杠、小写。 */
export const normalizeLauncherPath = (path: string): string =>
  path.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLocaleLowerCase()

/**
 * 名字里可以安全剥掉的扩展名：都是「启动入口」类的容器，`Foo.lnk` 和 `Foo.exe`
 * 说的是同一个东西。文档、图片之类的扩展名不在其中，避免把 `Foo.txt` 和 `Foo` 混为一谈。
 */
const STRIPPED_NAME_EXTENSIONS = new Set(['lnk', 'exe', 'url', 'appref-ms'])

/** Windows 建快捷方式时自动追加的后缀，按系统语言不同。 */
const SHORTCUT_NAME_SUFFIXES = [
  ' - 快捷方式',
  ' - 捷徑',
  ' - shortcut',
  ' - verknüpfung',
  ' - raccourci',
  ' - collegamento',
  ' - acceso directo',
  ' - ショートカット',
  ' - 바로 가기',
]

/** `Foo (2).lnk` 这种重名计数。限制 1~2 位，`Photoshop (2024)` 不会被误伤。 */
const DUPLICATE_COUNTER = /\s*\(\d{1,2}\)$/

/** 「Foo.exe - 快捷方式.lnk」要剥好几层，留够轮数即可，避免死循环。 */
const MAX_NAME_STRIP_ROUNDS = 4

const stripExtension = (name: string): string => {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return name
  return STRIPPED_NAME_EXTENSIONS.has(name.slice(dot + 1)) ? name.slice(0, dot) : name
}

const stripShortcutSuffix = (name: string): string => {
  for (const suffix of SHORTCUT_NAME_SUFFIXES) {
    if (name.length > suffix.length && name.endsWith(suffix)) {
      return name.slice(0, name.length - suffix.length)
    }
  }
  return name
}

/**
 * 归一化显示名：小写、剥掉启动入口类扩展名、剥掉快捷方式后缀与重名计数，
 * 反复剥到不再变化为止。
 */
export const normalizeLauncherName = (name: string): string => {
  let current = name.trim().toLocaleLowerCase()
  for (let round = 0; round < MAX_NAME_STRIP_ROUNDS; round += 1) {
    const next = stripShortcutSuffix(stripExtension(current)).replace(DUPLICATE_COUNTER, '').trim()
    if (next === current || !next) break
    current = next
  }
  return current
}

export interface LauncherIdentityInput {
  path: string
  name: string
  /** 快捷方式解析出的目标路径。为空表示「就是自己」，按自身路径算。 */
  targetPath?: string
}

/**
 * 一条候选占用的所有同一性键。任意一个键已经被前面（分数更高）的条目占掉，
 * 就说明这一条是重复的。
 *
 * 两个键各管一件事：`path:` 挡住同一条路径被两个来源各报一次，
 * `target:` 挡住本体与指向它的快捷方式同时出现。
 */
export function collectLauncherIdentities({
  path,
  name,
  targetPath,
}: LauncherIdentityInput): string[] {
  const ownPath = normalizeLauncherPath(path)
  const target = normalizeLauncherPath(targetPath ?? '') || ownPath
  const identities: string[] = []
  if (ownPath) identities.push(`path:${ownPath}`)
  if (target) identities.push(`target:${target}|${normalizeLauncherName(name)}`)
  return identities
}
