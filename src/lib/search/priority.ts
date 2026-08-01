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

import { normalizeCatalogFolderPath, type BestMatchFolderConfig } from './bestMatchFolders'

export type SearchPriority = 'high' | 'normal' | 'low' | 'ignored'

export interface FolderPriorityRule {
  priority: SearchPriority
  /** 归一化后（小写、正斜杠、前后带斜杠）在完整路径中出现的目录片段。 */
  folder: string
}

export interface RootPriorityRule {
  priority: SearchPriority
  /**
   * 归一化后（小写、正斜杠、尾部带斜杠）的绝对路径前缀。
   *
   * 高优先级目录用前缀而不是片段：`D:\Green` 归一化后是 `d:/green/`，开头没有斜杠，
   * 套不进 `folder` 那种「前后都带斜杠」的片段规则。用真实路径也比片段准 ——
   * `/desktop/` 会连 `D:\projects\desktop\` 一起误判成高优先级。
   */
  root: string
}

export interface ExtensionPriorityRule {
  priority: SearchPriority
  /** 不含点号的小写扩展名。 */
  extension: string
}

export interface SearchPriorityRules {
  folders: FolderPriorityRule[]
  roots: RootPriorityRule[]
  extensions: ExtensionPriorityRule[]
}

/**
 * 高优先级只由**用户配置的目录清单**决定：那些目录里的东西才是他要启动的。
 *
 * 刻意不按扩展名给 high —— 「任意位置的 `.exe` 都算高优先级」会把全盘的可执行文件
 * 都拉进「最佳匹配」的候选池（几万条量级），而目录清单本身只有几百条。
 *
 * 也刻意不再保留 `/start menu/`、`/desktop/` 这类兜底片段：清单是用户可以删改的，
 * 删掉桌面之后还留一条片段规则，等于「删了但没删」。
 */

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

const toHighRootRules = (config: BestMatchFolderConfig | undefined): RootPriorityRule[] =>
  (config?.folders ?? []).flatMap(folder => {
    if (!folder.enabled) return []
    const root = normalizeCatalogFolderPath(folder.path)
    return root ? [{ priority: 'high' as SearchPriority, root: `${root}/` }] : []
  })

/**
 * 由用户配置生成规则表：清单里启用的每个目录都成为一条高优先级前缀规则，
 * 于是它们既能进「最佳匹配」，也在结果列表里靠前。降权规则与配置无关，恒定生效。
 */
export function buildSearchPriorityRules(config?: BestMatchFolderConfig): SearchPriorityRules {
  return {
    folders: [...toFolderRules(IGNORED_FOLDERS, 'ignored'), ...toFolderRules(LOW_FOLDERS, 'low')],
    roots: toHighRootRules(config),
    extensions: [...toExtensionRules(LOW_EXTENSIONS, 'low')],
  }
}

/**
 * 没有配置时的规则：只有降权规则，没有任何高优先级目录。
 *
 * 这是刻意的 —— 高优先级完全来自用户的目录清单，拿不到清单就不该凭空假设
 * 「开始菜单一定是高优先级」。运行时各处都会把真实配置传进来。
 */
export const DEFAULT_SEARCH_PRIORITY_RULES: SearchPriorityRules = buildSearchPriorityRules()

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
  for (const rule of rules.roots) {
    if (normalizedPath.startsWith(rule.root) && isMoreSevere(rule.priority, resolved)) {
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
