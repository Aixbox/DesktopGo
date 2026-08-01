/**
 * 「最佳匹配」收录哪些类型的文件。
 *
 * 最佳匹配是启动器，默认只收「点了会打开东西」的类型：程序、快捷方式、脚本，
 * 再加上常见文档（桌面上放的 pdf、Word 也常是要打开的目标）。图片、音视频、
 * 压缩包、代码文件默认不收 —— 它们数量大、又几乎不是「启动」的对象，收进来
 * 只会把最佳匹配挤满；需要时在设置里勾上即可，或者直接勾「全部」不再过滤。
 *
 * 按**组**勾选而不是逐个扩展名勾：一屏塞几百个复选框没人会用，而分组正好对应
 * 用户心里的分类。存储仍然是扁平的扩展名清单，这样 Rust 侧只做一次集合判断。
 */

export interface CatalogFileTypeGroup {
  key: string
  /** 中文文案，渲染时过 `translate`。 */
  label: string
  extensions: string[]
}

/** 未列出的扩展名（dll、无扩展名文件……）用这个哨兵表示，勾上等于不过滤。 */
export const CATALOG_ANY_EXTENSION = '*'

export const CATALOG_FILE_TYPE_GROUPS: CatalogFileTypeGroup[] = [
  {
    key: 'launcher',
    label: '程序与快捷方式',
    extensions: ['exe', 'lnk', 'url', 'appref-ms', 'msi'],
  },
  {
    key: 'script',
    label: '脚本与命令',
    extensions: ['bat', 'cmd', 'com', 'ps1', 'vbs', 'msc', 'reg', 'sh'],
  },
  {
    key: 'document',
    label: '文档',
    extensions: ['pdf', 'doc', 'docx', 'txt', 'md', 'rtf', 'epub'],
  },
  {
    key: 'sheet',
    label: '表格与演示',
    extensions: ['xls', 'xlsx', 'csv', 'ppt', 'pptx'],
  },
  {
    key: 'image',
    label: '图片',
    extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico', 'psd'],
  },
  {
    key: 'media',
    label: '音视频',
    extensions: ['mp3', 'flac', 'wav', 'm4a', 'mp4', 'mkv', 'avi', 'mov', 'webm'],
  },
  {
    key: 'archive',
    label: '压缩包与镜像',
    extensions: ['zip', '7z', 'rar', 'tar', 'gz', 'iso', 'apk'],
  },
  {
    key: 'code',
    label: '代码与配置',
    extensions: ['ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'json', 'yaml'],
  },
  {
    key: 'any',
    label: '全部',
    extensions: [CATALOG_ANY_EXTENSION],
  },
]

/** 默认勾选：程序、脚本、文档、表格与演示。 */
const DEFAULT_GROUP_KEYS = ['launcher', 'script', 'document', 'sheet']

const groupByKey = (key: string): CatalogFileTypeGroup | undefined =>
  CATALOG_FILE_TYPE_GROUPS.find(group => group.key === key)

export const DEFAULT_CATALOG_EXTENSIONS: string[] = DEFAULT_GROUP_KEYS.flatMap(
  key => groupByKey(key)?.extensions ?? []
)

/** 全部已知扩展名（含哨兵），用来把存档里不认识的值丢掉。 */
const KNOWN_EXTENSIONS = new Set(CATALOG_FILE_TYPE_GROUPS.flatMap(group => group.extensions))

export const normalizeCatalogExtension = (value: unknown): string =>
  typeof value === 'string' ? value.trim().replace(/^\./, '').toLocaleLowerCase() : ''

/**
 * 存档里的扩展名清单：去点号、小写、去重、丢掉不认识的值。不是数组时退回默认勾选，
 * 而空数组是合法的（用户把所有类型都取消了，只留文件夹）。
 */
export const normalizeCatalogExtensions = (value: unknown): string[] => {
  if (!Array.isArray(value)) return DEFAULT_CATALOG_EXTENSIONS

  const seen = new Set<string>()
  for (const entry of value) {
    const extension = normalizeCatalogExtension(entry)
    if (extension && KNOWN_EXTENSIONS.has(extension)) seen.add(extension)
  }
  return [...seen]
}

/** 组内任意一个扩展名在清单里，就算这一组勾上了。 */
export const isCatalogFileTypeGroupSelected = (
  extensions: readonly string[],
  group: CatalogFileTypeGroup
): boolean => group.extensions.some(extension => extensions.includes(extension))

/** 整组加入或整组移除，返回新的扩展名清单（顺序按分组定义，方便阅读存档）。 */
export const toggleCatalogFileTypeGroup = (
  extensions: readonly string[],
  group: CatalogFileTypeGroup,
  selected: boolean
): string[] => {
  const next = new Set(extensions)
  group.extensions.forEach(extension => {
    if (selected) next.add(extension)
    else next.delete(extension)
  })

  return CATALOG_FILE_TYPE_GROUPS.flatMap(candidate =>
    candidate.extensions.filter(extension => next.has(extension))
  )
}

/** 勾了「全部」就等于不过滤，Rust 侧据此跳过扩展名判断。 */
export const allowsAnyCatalogExtension = (extensions: readonly string[]): boolean =>
  extensions.includes(CATALOG_ANY_EXTENSION)
