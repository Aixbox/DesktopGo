import { useState } from 'react'
import { FolderOpen, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, type SelectOption } from '@/components/ui/select'
import { SwitchButton } from '@/components/ui/setting-components'
import { translate } from '@/lib/i18n'
import {
  MAX_CATALOG_DEPTH,
  MIN_CATALOG_DEPTH,
  UNLIMITED_CATALOG_DEPTH,
  type CatalogFolder,
} from '@/lib/search/bestMatchFolders'
import type { LauncherCatalogRoot } from '@/lib/search/types'

const depthOptions = (): SelectOption[] => [
  ...Array.from({ length: MAX_CATALOG_DEPTH - MIN_CATALOG_DEPTH + 1 }, (_, index) => {
    const depth = MIN_CATALOG_DEPTH + index
    return { value: String(depth), label: translate('{depth} 层', { depth }) }
  }),
  { value: String(UNLIMITED_CATALOG_DEPTH), label: translate('不限层数') },
]

/** 这个目录这次扫出了什么：不存在、与前面某条重复、已停用，否则报条目数。 */
function FolderStatus({ root }: { root: LauncherCatalogRoot | undefined }) {
  if (!root) {
    return <span className="text-xs text-muted-foreground">{translate('尚未扫描')}</span>
  }

  const detail = !root.exists
    ? translate('未找到')
    : root.duplicate
      ? translate('与清单里其它目录重复')
      : !root.enabled
        ? translate('已停用')
        : translate('{count} 项', { count: root.entryCount })

  return <span className="text-xs tabular-nums text-muted-foreground">{detail}</span>
}

interface CatalogFolderRowProps {
  folder: CatalogFolder
  root: LauncherCatalogRoot | undefined
  onChange: (patch: Partial<CatalogFolder>) => void
  onRemove: () => void
  onBrowse: () => void
}

/**
 * 目录清单里的一行：路径输入框 + 浏览 + 层数 + 开关 + 删除。
 *
 * 路径用本地草稿状态，失焦或按 Enter 才提交 —— 每敲一个字符就写回配置的话，
 * 每次按键都要重新枚举一遍目录、还会弹一次保存提示。调用方按提交后的路径做 key，
 * 所以提交（或「恢复预设目录」这类外部改动）会让这一行带着新值重新挂载。
 */
export function CatalogFolderRow({
  folder,
  root,
  onChange,
  onRemove,
  onBrowse,
}: CatalogFolderRowProps) {
  const [draft, setDraft] = useState(folder.path)

  const commit = () => {
    const trimmed = draft.trim()
    // 空路径没有意义，直接退回原值，而不是把这一行变成一条废记录。
    if (!trimmed || trimmed === folder.path) {
      setDraft(folder.path)
      return
    }
    onChange({ path: trimmed })
  }

  return (
    <div className="space-y-2 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-nowrap items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-2">
          <Input
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={event => {
              if (event.key === 'Enter') commit()
              if (event.key === 'Escape') setDraft(folder.path)
            }}
            spellCheck={false}
            aria-label={translate('目录路径')}
            className="min-w-0 flex-1 font-mono text-xs"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={translate('选择目录')}
            onClick={onBrowse}
            className="shrink-0"
          >
            <FolderOpen />
          </Button>
          <Select
            value={String(folder.maxDepth)}
            onValueChange={value => onChange({ maxDepth: Number(value) })}
            options={depthOptions()}
            aria-label={translate('扫描层数')}
            className="w-32 shrink-0"
          />
        </div>
        <div className="flex shrink-0 flex-nowrap items-center gap-2">
          <div className="shrink-0">
            <SwitchButton checked={folder.enabled} onChange={enabled => onChange({ enabled })} />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={translate('移除目录')}
            onClick={onRemove}
            className="shrink-0"
          >
            <Trash2 />
          </Button>
        </div>
      </div>
      <FolderStatus root={root} />
    </div>
  )
}
