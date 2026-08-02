import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { filterIconManagerItems, getPathLeaf, type IconVisibilityFilter } from '@/lib/iconManager'
import { cn } from '@/lib/utils'
import { loadCustomNames } from '@/lib/customNamesStore'
import { translate, useI18n } from '@/lib/i18n'
import { getSetting, setSetting } from '@/lib/settingsStore'
import {
  LAUNCHPAD_LAYOUT_RESET_EVENT,
  resetLaunchpadLayout,
} from '@/components/icon-grid/services/layoutStore'
import { AiOrganizePanel } from '@/components/ai/AiOrganizePanel'
import { AddIconDialog } from '@/components/icons/AddIconDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { OptionButton } from '@/components/ui/setting-components'
import { useToast } from '@/components/ui/toast'
import type {
  IconManagerItem,
  IconManagerViewMode,
  IconMutationTarget,
  InvalidIconEntry,
  LaunchpadGridViewMode,
} from '@/types'
import {
  RefreshCw,
  Bot,
  X,
  LayoutGrid,
  List,
  Upload,
  SearchX,
  Trash2,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react'

const ICON_VISIBILITY_FILTER_OPTIONS: { label: string; value: IconVisibilityFilter }[] = [
  { label: '全部', value: 'all' },
  { label: '未隐藏', value: 'visible' },
  { label: '隐藏', value: 'hidden' },
]

const ICON_MANAGER_VIEW_MODE_OPTIONS: {
  label: string
  value: IconManagerViewMode
  icon: ReactNode
}[] = [
  { label: '列表', value: 'list', icon: <List className="h-3.5 w-3.5" /> },
  { label: '宫格', value: 'grid', icon: <LayoutGrid className="h-3.5 w-3.5" /> },
]

export function IconManagerPanel() {
  useI18n()

  const [pendingMutation, setPendingMutation] = useState<{
    type: 'hide' | 'unhide' | 'delete'
    icon: IconManagerItem
  } | null>(null)
  const [addIconDialogOpen, setAddIconDialogOpen] = useState(false)
  const [mutating, setMutating] = useState(false)
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [layoutResetting, setLayoutResetting] = useState(false)
  const [scanningInvalidIcons, setScanningInvalidIcons] = useState(false)
  const [deletingInvalidIcons, setDeletingInvalidIcons] = useState(false)
  const [invalidIconScanOpen, setInvalidIconScanOpen] = useState(false)
  const [invalidIconResults, setInvalidIconResults] = useState<InvalidIconEntry[]>([])
  const [selectedInvalidIconKeys, setSelectedInvalidIconKeys] = useState<string[]>([])
  const [allIcons, setAllIcons] = useState<IconManagerItem[]>([])
  const [viewMode, setViewMode] = useState<IconManagerViewMode>('list')
  const [searchInput, setSearchInput] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [visibilityFilter, setVisibilityFilter] = useState<IconVisibilityFilter>('all')
  const [aiOrganizeOpen, setAiOrganizeOpen] = useState(false)
  const [aiOrganizeLayoutViewMode, setAiOrganizeLayoutViewMode] =
    useState<LaunchpadGridViewMode | null>(null)
  const [customNames, setCustomNames] = useState<Record<string, string>>({})
  const toast = useToast()

  const refreshIconManagerList = useCallback(async () => {
    setListLoading(true)
    setListError(null)
    try {
      const icons = await invoke<IconManagerItem[]>('get_icon_manager_items', { iconSize: 48 })
      setAllIcons(icons)
    } catch (e) {
      setListError(String(e))
      toast.error(translate('加载图标库失败：{error}', { error: String(e) }), {
        key: 'icon-library-list',
        title: translate('图标库'),
      })
    } finally {
      setListLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void getSetting('iconManagerViewMode')
      .then(setViewMode)
      .catch(e => console.error('Failed to load icon manager view mode:', e))
    void getSetting('launchpadGridViewMode')
      .then(setAiOrganizeLayoutViewMode)
      .catch(e => console.error('Failed to load launchpad grid view mode:', e))
    void invoke<IconManagerItem[]>('get_icon_manager_items', { iconSize: 48 })
      .then(setAllIcons)
      .catch(e => {
        setListError(String(e))
        toast.error(translate('加载图标库失败：{error}', { error: String(e) }), {
          key: 'icon-library-list',
          title: translate('图标库'),
        })
      })
      .finally(() => setListLoading(false))
    void loadCustomNames()
      .then(setCustomNames)
      .catch(e => console.error('Failed to load custom names:', e))
  }, [toast])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchKeyword(searchInput.trim().toLowerCase())
    }, 200)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const filteredIcons = useMemo(
    () =>
      filterIconManagerItems(allIcons, {
        visibilityFilter,
        searchKeyword,
      }),
    [allIcons, visibilityFilter, searchKeyword]
  )

  const handleViewModeChange = (nextMode: IconManagerViewMode) => {
    if (nextMode === viewMode) return
    setViewMode(nextMode)
    void setSetting('iconManagerViewMode', nextMode).catch(e =>
      console.error('Failed to save icon manager view mode:', e)
    )
  }

  const notifyMainWindow = async () => {
    const mainWindow = await WebviewWindow.getByLabel('main')
    if (mainWindow) {
      await mainWindow.emit(LAUNCHPAD_LAYOUT_RESET_EVENT)
    }
  }

  const handleIconCreated = async () => {
    await refreshIconManagerList()
    await notifyMainWindow()
  }

  const handleOpenAiOrganize = () => {
    void getSetting('launchpadGridViewMode')
      .then(layoutViewMode => {
        setAiOrganizeLayoutViewMode(layoutViewMode)
        setAiOrganizeOpen(true)
      })
      .catch(error => {
        console.error('Failed to load launchpad grid view mode:', error)
        toast.error(translate('无法读取启动台布局模式，请稍后重试。'), {
          key: 'ai-organize-layout-mode',
          title: translate('AI 智能整理'),
        })
      })
  }

  const undoVisibilityMutation = async (
    mutation: NonNullable<typeof pendingMutation> & { type: 'hide' | 'unhide' }
  ) => {
    setMutating(true)
    try {
      const command = mutation.type === 'hide' ? 'unhide_icons' : 'hide_icons'
      await invoke<number>(command, { targets: [{ id: mutation.icon.id }] })
      await refreshIconManagerList()
      await notifyMainWindow()
      toast.success(translate('操作已撤销。'), {
        key: 'icon-library-action',
        title: translate('图标库'),
      })
    } catch (error) {
      console.error('Failed to undo icon visibility change:', error)
      toast.error(translate('撤销失败，请刷新图标库后重试。'), {
        key: 'icon-library-action',
        title: translate('图标库'),
      })
    } finally {
      setMutating(false)
    }
  }

  const handleConfirmMutation = async () => {
    if (!pendingMutation) return
    const mutation = pendingMutation
    setMutating(true)
    try {
      const targets: IconMutationTarget[] = [{ id: mutation.icon.id }]
      const command =
        mutation.type === 'unhide'
          ? 'unhide_icons'
          : mutation.type === 'delete'
            ? 'delete_icons'
            : 'hide_icons'
      const actionLabel =
        mutation.type === 'unhide' ? '显示' : mutation.type === 'delete' ? '删除' : '隐藏'
      const affected = await invoke<number>(command, { targets })
      const visibilityMutation =
        mutation.type === 'delete' ? null : { type: mutation.type, icon: mutation.icon }
      await refreshIconManagerList()
      await notifyMainWindow()
      toast.success(
        translate('{action}完成，影响 {count} 项。', {
          action: translate(actionLabel),
          count: affected,
        }),
        {
          key: 'icon-library-action',
          title: translate('图标库'),
          duration: visibilityMutation ? 8000 : undefined,
          action: visibilityMutation
            ? {
                label: translate('撤销'),
                onClick: () => void undoVisibilityMutation(visibilityMutation),
              }
            : undefined,
        }
      )
    } catch (e) {
      console.error('Failed to update icon library item:', e)
      toast.error(translate('操作失败，请稍后重试。'), {
        key: 'icon-library-action',
        title: translate('图标库'),
      })
    } finally {
      setMutating(false)
      setPendingMutation(null)
    }
  }

  const handleResetLaunchpadIcons = async () => {
    if (layoutResetting) return
    const confirmed = window.confirm(
      translate('确定要重置图标布局吗？这会清空当前宫格排序、文件夹和 Dock 排布。')
    )
    if (!confirmed) return

    setLayoutResetting(true)
    try {
      await resetLaunchpadLayout()
      await notifyMainWindow()
      toast.success(translate('图标布局已重置。'), {
        key: 'icon-library-layout',
        title: translate('图标库'),
      })
    } catch (e) {
      toast.error(translate('重置图标布局失败：{error}', { error: String(e) }), {
        key: 'icon-library-layout',
        title: translate('图标库'),
      })
    } finally {
      setLayoutResetting(false)
    }
  }

  const invalidIconKey = (icon: InvalidIconEntry) => icon.id

  const handleScanInvalidIcons = async () => {
    if (scanningInvalidIcons || deletingInvalidIcons) return
    setScanningInvalidIcons(true)
    try {
      const results = await invoke<InvalidIconEntry[]>('scan_invalid_icons')
      setInvalidIconResults(results)
      setSelectedInvalidIconKeys(results.map(invalidIconKey))
      setInvalidIconScanOpen(true)
    } catch (e) {
      toast.error(translate('扫描失效图标失败：{error}', { error: String(e) }), {
        key: 'icon-library-invalid-scan',
        title: translate('图标库'),
      })
    } finally {
      setScanningInvalidIcons(false)
    }
  }

  const handleToggleInvalidIcon = (key: string) => {
    setSelectedInvalidIconKeys(current =>
      current.includes(key) ? current.filter(item => item !== key) : [...current, key]
    )
  }

  const handleDeleteInvalidIcons = async () => {
    const selectedKeySet = new Set(selectedInvalidIconKeys)
    const targets: IconMutationTarget[] = invalidIconResults
      .filter(icon => selectedKeySet.has(invalidIconKey(icon)))
      .map(icon => ({ id: icon.id }))
    if (targets.length === 0 || deletingInvalidIcons) return

    const confirmed = window.confirm(
      translate('确定将选中的 {count} 个失效图标移出图标库吗？不会删除原始文件。', {
        count: targets.length,
      })
    )
    if (!confirmed) return

    setDeletingInvalidIcons(true)
    try {
      const affected = await invoke<number>('delete_icons', { targets })
      toast.success(translate('已移出 {count} 个失效图标。', { count: affected }), {
        key: 'icon-library-invalid-delete',
        title: translate('图标库'),
      })
      const remaining = await invoke<InvalidIconEntry[]>('scan_invalid_icons')
      setInvalidIconResults(remaining)
      setSelectedInvalidIconKeys([])
      await refreshIconManagerList()
      await notifyMainWindow()
    } catch (e) {
      toast.error(translate('删除失效图标失败：{error}', { error: String(e) }), {
        key: 'icon-library-invalid-delete',
        title: translate('图标库'),
      })
    } finally {
      setDeletingInvalidIcons(false)
    }
  }

  const mutationDialogText = pendingMutation
    ? pendingMutation.type === 'hide'
      ? {
          title: translate('确认隐藏图标'),
          desc: translate('将隐藏图标“{name}”。隐藏后不会在启动台显示。', {
            name: pendingMutation.icon.name,
          }),
          confirmLabel: translate('确认隐藏'),
          confirmVariant: 'default' as const,
        }
      : pendingMutation.type === 'unhide'
        ? {
            title: translate('确认显示图标'),
            desc: translate('图标“{name}”将重新显示在启动台。', {
              name: pendingMutation.icon.name,
            }),
            confirmLabel: translate('确认显示'),
            confirmVariant: 'default' as const,
          }
        : {
            title: translate('确认删除'),
            desc: translate('将“{name}”移出图标库，不会删除原始程序、文件或文件夹。', {
              name: pendingMutation.icon.name,
            }),
            confirmLabel: translate('删除'),
            confirmVariant: 'destructive' as const,
          }
    : null

  const controlsDisabled =
    mutating || listLoading || layoutResetting || scanningInvalidIcons || deletingInvalidIcons
  const selectedInvalidIconKeySet = new Set(selectedInvalidIconKeys)
  const selectedInvalidIconCount = invalidIconResults.filter(icon =>
    selectedInvalidIconKeySet.has(invalidIconKey(icon))
  ).length
  const allInvalidIconsSelected =
    invalidIconResults.length > 0 && selectedInvalidIconCount === invalidIconResults.length

  return (
    <>
      <div className="min-w-0 space-y-5">
        <div className="flex flex-col gap-4 border-b border-border/80 pb-5 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl space-y-1.5">
            <h2 className="text-lg font-semibold">{translate('图标库')}</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              {translate('导入常用应用、快捷方式和文件；文件夹可以直接拖入启动台。')}
            </p>
          </div>
          <Button onClick={() => setAddIconDialogOpen(true)} disabled={mutating || layoutResetting}>
            <Upload className="h-4 w-4" />
            {translate('导入图标')}
          </Button>
        </div>

        <div className="min-w-0 space-y-3 rounded-md border border-border/80 bg-card p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-0 flex-[1_1_24rem] flex-wrap items-center gap-2">
              <Input
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder={translate('搜索图标名称或路径')}
                className="min-w-0 flex-[1_1_15rem]"
              />
              <div className="flex flex-wrap items-center gap-2">
                {ICON_VISIBILITY_FILTER_OPTIONS.map(opt => (
                  <OptionButton
                    key={opt.value}
                    label={translate(opt.label)}
                    selected={visibilityFilter === opt.value}
                    onClick={() => setVisibilityFilter(opt.value)}
                  />
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenAiOrganize}
                disabled={controlsDisabled || allIcons.length === 0}
              >
                <Bot className="h-3.5 w-3.5" />
                {translate('AI 整理')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleScanInvalidIcons()}
                disabled={controlsDisabled || allIcons.length === 0}
              >
                {scanningInvalidIcons ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <SearchX className="h-3.5 w-3.5" />
                )}
                {scanningInvalidIcons ? translate('正在扫描...') : translate('扫描失效图标')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetLaunchpadIcons}
                disabled={controlsDisabled}
              >
                {layoutResetting ? translate('重置中...') : translate('重置布局')}
              </Button>
              <div className="inline-flex h-9 rounded-lg border border-border/90 bg-background p-1">
                {ICON_MANAGER_VIEW_MODE_OPTIONS.map(option => {
                  const selected = viewMode === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-label={translate(option.label)}
                      title={translate(option.label)}
                      aria-pressed={selected}
                      onClick={() => handleViewModeChange(option.value)}
                      className={cn(
                        'inline-flex h-full w-8 items-center justify-center rounded-md transition-colors',
                        selected
                          ? 'bg-accent text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {option.icon}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {translate('图标库共 {total} 项，当前显示 {filtered} 项。', {
              total: allIcons.length,
              filtered: filteredIcons.length,
            })}
          </p>

          <div
            className={cn(
              'min-h-52',
              viewMode === 'grid'
                ? 'grid content-start gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,10rem),1fr))]'
                : 'space-y-2'
            )}
          >
            {listLoading ? (
              <div className="col-span-full flex min-h-44 items-center justify-center text-sm text-muted-foreground">
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                {translate('图标库加载中...')}
              </div>
            ) : listError && allIcons.length === 0 ? (
              <div
                role="alert"
                className="col-span-full flex min-h-44 flex-col items-center justify-center gap-3 px-4 text-center"
              >
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-300" />
                <div className="max-w-md space-y-1">
                  <p className="text-sm font-medium">{translate('图标库加载失败，请重试。')}</p>
                  <p className="break-words text-xs text-muted-foreground" title={listError}>
                    {translate('现有布局不会被修改。')}
                  </p>
                </div>
                <Button size="sm" onClick={() => void refreshIconManagerList()}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  {translate('重试')}
                </Button>
              </div>
            ) : filteredIcons.length === 0 ? (
              <div className="col-span-full flex min-h-44 flex-col items-center justify-center gap-3 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <Upload className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {allIcons.length === 0
                      ? translate('图标库还是空的')
                      : translate('没有符合当前条件的图标')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {allIcons.length === 0
                      ? translate('导入应用、快捷方式或文件，开始创建你的启动台。')
                      : translate('尝试调整搜索词或显示状态。')}
                  </p>
                </div>
                {allIcons.length === 0 ? (
                  <Button
                    size="sm"
                    onClick={() => setAddIconDialogOpen(true)}
                    disabled={controlsDisabled}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {translate('导入图标')}
                  </Button>
                ) : null}
              </div>
            ) : (
              filteredIcons.map(icon => {
                const compactPathLabel = getPathLeaf(icon.target_path || icon.path) || '-'
                const visibilityBadgeClass = icon.hidden
                  ? 'border-orange-500/30 bg-orange-500/15 text-orange-700 dark:text-orange-300'
                  : 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'

                return (
                  <article
                    key={icon.id}
                    className={cn(
                      'border border-border/80 bg-background',
                      viewMode === 'grid'
                        ? 'rounded-lg p-3'
                        : 'flex flex-wrap items-center gap-3 rounded-lg p-3'
                    )}
                  >
                    <div className="flex min-w-0 flex-[1_1_16rem] items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/70 bg-muted/35">
                        {icon.icon_base64 ? (
                          <img
                            src={icon.icon_base64}
                            alt={icon.name}
                            className="h-full w-full object-contain"
                            loading="lazy"
                          />
                        ) : (
                          <span className="text-[10px] text-muted-foreground">
                            {translate('无图标')}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p
                            className={cn(
                              'font-medium',
                              viewMode === 'grid'
                                ? 'overflow-hidden text-sm leading-4 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]'
                                : 'truncate text-sm'
                            )}
                            title={icon.name || translate('未命名')}
                          >
                            {icon.name || translate('未命名')}
                          </p>
                          <span
                            className={cn(
                              'rounded border px-1.5 py-0.5 text-[10px]',
                              visibilityBadgeClass
                            )}
                          >
                            {icon.hidden ? translate('隐藏') : translate('显示中')}
                          </span>
                        </div>
                        <p
                          className="mt-1 truncate text-xs text-muted-foreground"
                          title={icon.target_path || icon.path}
                        >
                          {viewMode === 'grid' ? compactPathLabel : icon.target_path || icon.path}
                        </p>
                      </div>
                    </div>

                    <div
                      className={cn(
                        'flex min-w-0 flex-wrap gap-2',
                        viewMode === 'grid' ? 'mt-3' : 'ml-auto max-w-full flex-none justify-end'
                      )}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setPendingMutation({ type: icon.hidden ? 'unhide' : 'hide', icon })
                        }
                        disabled={mutating}
                        className={viewMode === 'grid' ? 'min-w-0 flex-1' : 'shrink-0'}
                      >
                        {icon.hidden ? translate('显示') : translate('隐藏')}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setPendingMutation({ type: 'delete', icon })}
                        disabled={mutating}
                        className={viewMode === 'grid' ? 'min-w-0 flex-1' : 'shrink-0'}
                      >
                        {translate('删除')}
                      </Button>
                    </div>
                  </article>
                )
              })
            )}
          </div>
        </div>
      </div>

      <AddIconDialog
        open={addIconDialogOpen}
        onOpenChange={setAddIconDialogOpen}
        onCreated={handleIconCreated}
      />

      {pendingMutation && mutationDialogText ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/22 p-4 backdrop-blur-[1px] dark:bg-black/45">
          <div className="w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-xl">
            <h3 className="text-base font-semibold">{mutationDialogText.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{mutationDialogText.desc}</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPendingMutation(null)}
                disabled={mutating}
              >
                {translate('取消')}
              </Button>
              <Button
                variant={mutationDialogText.confirmVariant}
                size="sm"
                onClick={handleConfirmMutation}
                disabled={mutating}
              >
                {mutating ? translate('处理中...') : mutationDialogText.confirmLabel}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {invalidIconScanOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/22 p-4 backdrop-blur-[1px] dark:bg-black/45">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="invalid-icon-scan-title"
            className="flex max-h-[min(42rem,calc(100vh-2rem))] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-border/80 px-4 py-4 sm:px-5">
              <div className="min-w-0 space-y-1">
                <h3 id="invalid-icon-scan-title" className="text-base font-semibold">
                  {translate('失效图标扫描')}
                </h3>
                <p className="text-xs leading-5 text-muted-foreground">
                  {translate('仅检查入口和目标是否存在；请确认网络盘或移动设备已连接。')}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={translate('关闭')}
                onClick={() => setInvalidIconScanOpen(false)}
                disabled={deletingInvalidIcons}
                className="shrink-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {invalidIconResults.length === 0 ? (
              <div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-3 px-5 py-10 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">{translate('未发现失效图标')}</p>
                  <p className="text-xs leading-5 text-muted-foreground">
                    {translate('当前图标库中的入口和目标均可访问。')}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-muted/15 px-4 py-3 sm:px-5">
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={allInvalidIconsSelected}
                      onChange={() =>
                        setSelectedInvalidIconKeys(
                          allInvalidIconsSelected ? [] : invalidIconResults.map(invalidIconKey)
                        )
                      }
                      disabled={deletingInvalidIcons}
                      className="h-4 w-4 rounded border-border accent-primary"
                    />
                    {translate('全选')}
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {translate('发现 {total} 项，已选择 {selected} 项。', {
                      total: invalidIconResults.length,
                      selected: selectedInvalidIconCount,
                    })}
                  </p>
                </div>

                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3 sm:px-5">
                  {invalidIconResults.map(icon => {
                    const key = invalidIconKey(icon)
                    const reasonLabel =
                      icon.reason === 'entry_missing'
                        ? translate('入口文件不存在')
                        : icon.reason === 'target_unresolved'
                          ? translate('无法解析快捷方式目标')
                          : translate('目标文件不存在')
                    return (
                      <label
                        key={key}
                        className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/80 bg-background p-3 transition-colors hover:bg-muted/20"
                      >
                        <input
                          type="checkbox"
                          checked={selectedInvalidIconKeySet.has(key)}
                          onChange={() => handleToggleInvalidIcon(key)}
                          disabled={deletingInvalidIcons}
                          className="mt-1 h-4 w-4 shrink-0 rounded border-border accent-primary"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-medium" title={icon.name}>
                              {icon.name || translate('未命名')}
                            </p>
                            <span className="rounded border border-destructive/25 bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive">
                              {reasonLabel}
                            </span>
                          </div>
                          <p
                            className="mt-1 truncate text-xs text-muted-foreground"
                            title={icon.target_path || icon.path}
                          >
                            {icon.target_path || icon.path}
                          </p>
                        </div>
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                      </label>
                    )
                  })}
                </div>
              </>
            )}

            <div className="flex flex-wrap justify-end gap-2 border-t border-border/80 bg-muted/15 px-4 py-3 sm:px-5">
              <Button
                type="button"
                variant="outline"
                onClick={() => setInvalidIconScanOpen(false)}
                disabled={deletingInvalidIcons}
                className="min-w-0 flex-1 sm:flex-none"
              >
                {translate('关闭')}
              </Button>
              {invalidIconResults.length > 0 ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => void handleDeleteInvalidIcons()}
                  disabled={deletingInvalidIcons || selectedInvalidIconCount === 0}
                  className="min-w-0 flex-1 sm:flex-none"
                >
                  {deletingInvalidIcons ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  {deletingInvalidIcons
                    ? translate('正在删除...')
                    : translate('删除所选（{count}）', { count: selectedInvalidIconCount })}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {aiOrganizeLayoutViewMode ? (
        <AiOrganizePanel
          open={aiOrganizeOpen}
          layoutViewMode={aiOrganizeLayoutViewMode}
          icons={allIcons.filter(icon => !icon.hidden)}
          customNames={customNames}
          onClose={() => setAiOrganizeOpen(false)}
          onPreviewed={notifyMainWindow}
          onApplied={notifyMainWindow}
        />
      ) : null}
    </>
  )
}
