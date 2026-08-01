import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FolderPlus, Images, RefreshCw, RotateCcw } from 'lucide-react'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { Button } from '@/components/ui/button'
import { SettingCard, SettingGroup } from '@/components/ui/setting-components'
import { useToast } from '@/components/ui/toast'
import { translate } from '@/lib/i18n'
import { getBestMatchIconLibraryCount, getLauncherCatalog } from '@/lib/search/api'
import {
  DEFAULT_CATALOG_DEPTH,
  MAX_CATALOG_FOLDERS,
  hasCatalogFolder,
  normalizeCatalogFolderPath,
  withPresetFolders,
  type BestMatchFolderConfig,
  type CatalogFolder,
} from '@/lib/search/bestMatchFolders'
import { loadPresetCatalogFolders } from '@/lib/search/settings'
import type { LauncherCatalogRoot } from '@/lib/search/types'
import { CatalogFileTypeFilter } from './CatalogFileTypeFilter'
import { CatalogFolderRow } from './CatalogFolderRow'

const TOAST_KEY = 'best-match-folders'

/** 一次扫描的结果。`key` 是当时用的配置，用来判断结果是否已经过期。 */
interface ScanResult {
  key: string
  roots: LauncherCatalogRoot[]
  entryCount: number
  truncated: boolean
}

interface IconLibraryResult {
  scanToken: number
  count: number | null
  failed: boolean
}

interface BestMatchFolderSettingsProps {
  config: BestMatchFolderConfig
  /** 由设置面板负责持久化与提示，这里只负责产出下一份配置。 */
  onChange: (next: BestMatchFolderConfig) => void
}

/**
 * 「最佳匹配」的目录清单。
 *
 * 清单只有一份，开始菜单、桌面、快速启动只是首次写入的预设内容 —— 每一条都能改路径、
 * 改层数、停用或删除。页面上的路径、层数、条目数来自和搜索完全相同的那条命令、
 * 同一份配置，所以显示的就是搜索真正会用的东西，不会出现两套说法。
 */
export function BestMatchFolderSettings({ config, onChange }: BestMatchFolderSettingsProps) {
  const toast = useToast()
  const [result, setResult] = useState<ScanResult | null>(null)
  const [scanToken, setScanToken] = useState(0)
  const [restoring, setRestoring] = useState(false)
  const [iconLibraryResult, setIconLibraryResult] = useState<IconLibraryResult | null>(null)
  // 配置（或「重新扫描」）变了就意味着手上这份结果过期了，扫描态由此推导，
  // 不必在 effect 里同步 setState。
  const scanKey = useMemo(() => `${scanToken}:${JSON.stringify(config)}`, [config, scanToken])
  const scanning = result?.key !== scanKey
  const roots = useMemo(() => result?.roots ?? [], [result])
  // 依赖只认 scanKey，但请求要用最新的配置对象，所以留一个 ref，并且只在提交后更新它。
  const configRef = useRef(config)
  useEffect(() => {
    configRef.current = config
  }, [config])

  useEffect(() => {
    let cancelled = false
    void getLauncherCatalog(configRef.current)
      .then(snapshot => {
        if (cancelled) return
        setResult({
          key: scanKey,
          roots: snapshot.roots,
          entryCount: snapshot.entries.length,
          truncated: snapshot.truncated,
        })
      })
      .catch(error => {
        console.error('Failed to scan best match folders:', error)
        if (cancelled) return
        // 失败也要落一份结果，否则扫描态会一直转。
        setResult({ key: scanKey, roots: [], entryCount: 0, truncated: false })
        toast.error(translate('扫描最佳匹配目录失败，请重试。'), {
          key: TOAST_KEY,
          title: translate('最佳匹配目录'),
        })
      })

    return () => {
      cancelled = true
    }
  }, [scanKey, toast])

  useEffect(() => {
    let cancelled = false
    void getBestMatchIconLibraryCount()
      .then(count => {
        if (!cancelled) {
          setIconLibraryResult({ scanToken, count, failed: false })
        }
      })
      .catch(error => {
        console.error('Failed to load icon library for best match settings:', error)
        if (!cancelled) setIconLibraryResult({ scanToken, count: null, failed: true })
      })

    return () => {
      cancelled = true
    }
  }, [scanToken])

  const iconLibraryLoading = iconLibraryResult?.scanToken !== scanToken

  const rootFor = useCallback(
    (path: string) => {
      const key = normalizeCatalogFolderPath(path)
      return roots.find(root => root.key === key)
    },
    [roots]
  )

  const updateFolder = (index: number, patch: Partial<CatalogFolder>) => {
    onChange({
      ...config,
      folders: config.folders.map((folder, current) =>
        current === index ? { ...folder, ...patch } : folder
      ),
    })
  }

  const removeFolder = (index: number) => {
    onChange({ ...config, folders: config.folders.filter((_, current) => current !== index) })
  }

  /** 选目录。`index` 为空表示追加一条，否则是给某一行换路径。 */
  const pickFolder = async (index?: number) => {
    try {
      const selected = await openDialog({
        multiple: false,
        directory: true,
        title: translate('选择目录'),
      })
      if (typeof selected !== 'string') return
      if (hasCatalogFolder(config, selected)) {
        toast.info(translate('该目录已在清单里。'), {
          key: TOAST_KEY,
          title: translate('最佳匹配目录'),
        })
        return
      }
      if (index === undefined) {
        onChange({
          ...config,
          folders: [
            ...config.folders,
            { path: selected, maxDepth: DEFAULT_CATALOG_DEPTH, enabled: true },
          ],
        })
        return
      }
      updateFolder(index, { path: selected })
    } catch (error) {
      console.error('Failed to pick a catalog folder:', error)
      toast.error(translate('选择目录失败，请重试。'), {
        key: TOAST_KEY,
        title: translate('最佳匹配目录'),
      })
    }
  }

  const restorePresets = async () => {
    setRestoring(true)
    try {
      const presets = await loadPresetCatalogFolders()
      if (presets.length === 0) {
        toast.error(translate('没有找到可恢复的预设目录。'), {
          key: TOAST_KEY,
          title: translate('最佳匹配目录'),
        })
        return
      }
      onChange(withPresetFolders(config, presets))
    } finally {
      setRestoring(false)
    }
  }

  const reachedCap = config.folders.length >= MAX_CATALOG_FOLDERS

  return (
    <SettingGroup title={translate('最佳匹配目录')}>
      <SettingCard
        label={translate('目录清单')}
        desc={translate(
          '「最佳匹配」会整体读取这些目录，因此 vscode 这类词首缩写也能命中 Visual Studio Code；它们里的内容在下方结果列表里也会靠前。开始菜单、桌面、快速启动只是预设，可以改路径、改层数、停用或删除。'
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 py-3 first:pt-0">
          <div className="flex min-w-0 items-center gap-2">
            <Images className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{translate('图标库')}</p>
              <p className="text-xs leading-5 text-muted-foreground">
                {translate('图标库中的入口会始终参与最佳匹配，不受目录或文件类型筛选影响。')}
              </p>
            </div>
          </div>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {iconLibraryLoading
              ? translate('正在读取图标库...')
              : iconLibraryResult?.failed
                ? translate('读取图标库失败')
                : translate('图标库共 {count} 项。', { count: iconLibraryResult?.count ?? 0 })}
          </span>
        </div>

        {config.folders.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {translate('清单是空的，最佳匹配现在只会用启动台里的图标。')}
          </p>
        ) : (
          <div className="divide-y divide-border/60">
            {config.folders.map((folder, index) => (
              <CatalogFolderRow
                // 按提交后的路径做 key：路径变了这一行重新挂载，输入框里的草稿不会串行。
                key={`${folder.path}-${index}`}
                folder={folder}
                root={rootFor(folder.path)}
                onChange={patch => updateFolder(index, patch)}
                onRemove={() => removeFolder(index)}
                onBrowse={() => void pickFolder(index)}
              />
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={reachedCap}
            onClick={() => void pickFolder()}
          >
            <FolderPlus />
            {reachedCap ? translate('已达目录数量上限') : translate('添加目录')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={restoring || reachedCap}
            onClick={() => void restorePresets()}
          >
            <RotateCcw />
            {translate('恢复预设目录')}
          </Button>
        </div>
      </SettingCard>

      <SettingCard
        label={translate('收录的文件类型')}
        desc={translate(
          '只有勾上的类型才会进最佳匹配。默认是「点了会打开东西」的那些；勾上「全部」就会收录所有文件类型。'
        )}
      >
        <CatalogFileTypeFilter
          extensions={config.extensions}
          includeFolders={config.includeFolders}
          onExtensionsChange={extensions => onChange({ ...config, extensions })}
          onIncludeFoldersChange={includeFolders => onChange({ ...config, includeFolders })}
        />
      </SettingCard>

      <SettingCard label={translate('收录情况')}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {scanning
              ? translate('正在扫描目录...')
              : translate('共收录 {count} 项。', { count: result?.entryCount ?? 0 })}
            {result?.truncated
              ? ` ${translate('已达条目上限，部分内容未被收录，建议减少层数或移除过大的目录。')}`
              : ''}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={scanning}
            onClick={() => setScanToken(token => token + 1)}
          >
            <RefreshCw />
            {scanning ? translate('扫描中...') : translate('重新扫描')}
          </Button>
        </div>
      </SettingCard>
    </SettingGroup>
  )
}
