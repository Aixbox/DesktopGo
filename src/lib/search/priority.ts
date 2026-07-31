/**
 * 路径优先级规则，对齐 Listary 索引层的 `FolderPriorityRule { priority, folder }`
 * 与 `FileExtensionPriorityRule { extension }`（见 docs/LISTARY_BINARY_ANALYSIS.zh-CN.md
 * 第 4 节）。
 *
 * 与 Listary 的一处关键差别：Listary 在索引侧把低优先级文件直接排除在结果集之外，
 * 而 DesktopGo 只能拿到 Everything 返回的结果之后再处理。虚拟列表的高度和索引都按
 * Everything 的 `totalResults` 撑起，客户端过滤会让计数与索引错位。所以这里的
 * `ignored` 只是「最强降权」，不是排除。
 */
export type SearchPriority = 'high' | 'normal' | 'low' | 'ignored'

export interface FolderPriorityRule {
  priority: SearchPriority
  /** 归一化后（小写、正斜杠、前后带斜杠）在完整路径中出现的目录片段。 */
  folder: string
}

export interface ExtensionPriorityRule {
  priority: SearchPriority
  /** 不含点号的小写扩展名。 */
  extension: string
}

export interface SearchPriorityRules {
  folders: FolderPriorityRule[]
  extensions: ExtensionPriorityRule[]
}

/**
 * 高优先级只由**目录**决定：这些目录里的东西才是用户会去启动的。
 *
 * 刻意不按扩展名给 high —— 「任意位置的 `.exe` 都算高优先级」会把全盘的可执行文件
 * 都拉进「最佳匹配」的候选池（几万条量级），而高优先级目录本身只有几百条。
 */
const HIGH_FOLDERS = ['start menu', 'desktop', 'quick launch']

const LOW_FOLDERS = [
  // 依赖与包管理器缓存
  'node_modules',
  '.pnpm-store',
  '.npm/_cacache',
  '.cargo/registry',
  '.m2/repository',
  '.gradle',
  'wrapper/dists',
  'site-packages',
  '__pycache__',
  '.venv',
  'venv/lib',
  // 版本控制与构建产物
  '.git',
  '.svn',
  'target/debug',
  'target/release',
  '.next',
  '.turbo',
  '.parcel-cache',
  'dist',
  'obj/debug',
  'obj/release',
  // 临时目录
  'appdata/local/temp',
  'appdata/local/package cache',
]

const IGNORED_FOLDERS = [
  '$recycle.bin',
  'system volume information',
  'windows/winsxs',
  'windows/servicing',
  'windows/assembly',
]

/** 扩展名规则只用来降权生成物，不用来给 high（见 `HIGH_FOLDERS` 的注释）。 */
const LOW_EXTENSIONS = [
  'map',
  'class',
  'pyc',
  'pyo',
  'pdb',
  'obj',
  'lib',
  'exp',
  'ilk',
  'tlog',
  'cache',
  'tmp',
  'temp',
  'bak',
]

const toFolderRules = (folders: string[], priority: SearchPriority): FolderPriorityRule[] =>
  folders.map(folder => ({ priority, folder: `/${folder}/` }))

const toExtensionRules = (
  extensions: string[],
  priority: SearchPriority
): ExtensionPriorityRule[] => extensions.map(extension => ({ priority, extension }))

export const DEFAULT_SEARCH_PRIORITY_RULES: SearchPriorityRules = {
  folders: [
    ...toFolderRules(IGNORED_FOLDERS, 'ignored'),
    ...toFolderRules(LOW_FOLDERS, 'low'),
    ...toFolderRules(HIGH_FOLDERS, 'high'),
  ],
  extensions: [...toExtensionRules(LOW_EXTENSIONS, 'low')],
}

/** 越小越应该沉底，用于在多条规则同时命中时取最严厉的那一档。 */
const PRIORITY_SEVERITY: Record<SearchPriority, number> = {
  ignored: 0,
  low: 1,
  normal: 2,
  high: 3,
}

const isMoreSevere = (candidate: SearchPriority, current: SearchPriority | null): boolean =>
  current === null || PRIORITY_SEVERITY[candidate] < PRIORITY_SEVERITY[current]

/**
 * 把路径统一成 `/a/b/c/` 形式，末尾补斜杠让「命中项本身就是该目录」也能匹配上
 * （例如 `C:\Users\me\Desktop` 需要匹配 `/desktop/`）。
 */
const normalizePath = (path: string): string =>
  `${path.trim().replace(/\\/g, '/').toLocaleLowerCase()}/`

const getExtension = (name: string): string => {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return ''
  return name.slice(dot + 1).toLocaleLowerCase()
}

/**
 * 命中多条规则时取最严厉的一档 —— `node_modules` 里的 `.exe` 仍然是噪音；
 * 一条都没命中时是 `normal`。
 */
export function resolveSearchPriority(
  hit: { path: string; name: string },
  rules: SearchPriorityRules = DEFAULT_SEARCH_PRIORITY_RULES
): SearchPriority {
  const normalizedPath = normalizePath(hit.path)
  const extension = getExtension(hit.name)
  let resolved: SearchPriority | null = null

  for (const rule of rules.folders) {
    if (normalizedPath.includes(rule.folder) && isMoreSevere(rule.priority, resolved)) {
      resolved = rule.priority
    }
  }
  if (extension) {
    for (const rule of rules.extensions) {
      if (rule.extension === extension && isMoreSevere(rule.priority, resolved)) {
        resolved = rule.priority
      }
    }
  }

  return resolved ?? 'normal'
}
