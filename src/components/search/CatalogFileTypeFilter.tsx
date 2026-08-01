import { SwitchButton } from '@/components/ui/setting-components'
import { translate } from '@/lib/i18n'
import {
  CATALOG_FILE_TYPE_GROUPS,
  isCatalogFileTypeGroupSelected,
  toggleCatalogFileTypeGroup,
  type CatalogFileTypeGroup,
} from '@/lib/search/catalogFileTypes'

interface CatalogFileTypeFilterProps {
  extensions: string[]
  includeFolders: boolean
  onExtensionsChange: (next: string[]) => void
  onIncludeFoldersChange: (next: boolean) => void
}

function TypeChip({
  group,
  selected,
  onToggle,
}: {
  group: CatalogFileTypeGroup
  selected: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      // 具体扩展名放在 title 里：分组名负责扫读，鼠标停一下就能看到清单。
      title={group.extensions.join(' ')}
      onClick={onToggle}
      className={`rounded-full border px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${
        selected
          ? 'border-primary/55 bg-primary/15 text-foreground dark:bg-primary/25'
          : 'border-border/80 text-muted-foreground hover:bg-accent/55'
      }`}
    >
      {translate(group.label)}
    </button>
  )
}

/**
 * 收录哪些类型的文件。按分组勾选而不是逐个扩展名勾：一屏几百个复选框没人会用，
 * 而分组正好对应用户心里的分类。选中的扩展名在下方原样列出来，免得只能靠猜。
 */
export function CatalogFileTypeFilter({
  extensions,
  includeFolders,
  onExtensionsChange,
  onIncludeFoldersChange,
}: CatalogFileTypeFilterProps) {
  const selectedExtensions = extensions.filter(extension => extension !== '*')

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {CATALOG_FILE_TYPE_GROUPS.map(group => {
          const selected = isCatalogFileTypeGroupSelected(extensions, group)
          return (
            <TypeChip
              key={group.key}
              group={group}
              selected={selected}
              onToggle={() =>
                onExtensionsChange(toggleCatalogFileTypeGroup(extensions, group, !selected))
              }
            />
          )
        })}
      </div>

      <p className="break-words font-mono text-xs leading-5 text-muted-foreground">
        {selectedExtensions.length === 0
          ? translate('没有勾选任何文件类型，只会收录文件夹。')
          : selectedExtensions.map(extension => `.${extension}`).join('  ')}
      </p>

      <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-foreground">{translate('同时收录文件夹')}</p>
          <p className="text-xs leading-5 text-muted-foreground">
            {translate(
              '开始菜单里的「Visual Studio Code」这类文件夹本身就是可以打开的入口，关掉后只收文件。'
            )}
          </p>
        </div>
        <SwitchButton checked={includeFolders} onChange={onIncludeFoldersChange} />
      </div>
    </div>
  )
}
