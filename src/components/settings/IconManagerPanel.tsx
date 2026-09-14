import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
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
import { InvalidIconScanDialog } from '@/components/settings/InvalidIconScanDialog'
import { QuickImportDialog } from '@/components/quick-import/QuickImportDialog'
import { useIconManagerBulkActions } from '@/components/settings/useIconManagerBulkActions'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { SettingCard, OptionButton, SettingGroup, ToggleRow } from '@/components/ui/setting-components'
import { useToast } from '@/components/ui/toast'
import type {
  IconManagerItem,
  IconManagerViewMode,
  IconMutationTarget,
  LaunchpadGridViewMode,
} from '@/types'
import {
  RefreshCw,
  Bot,
  LayoutGrid,
  List,
  Upload,
  Trash2,
  AlertTriangle,
  Eye,
  EyeOff,
  Wand2,
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
  const prefersReducedMotion = useReducedMotion()

  const [pendingMutation, setPendingMutation] = useState<{
    type: 'hide' | 'unhide' | 'delete'
    icon: IconManagerItem
  } | null>(null)
  const [addIconDialogOpen, setAddIconDialogOpen] = useState(false)
  const [quickImportOpen, setQuickImportOpen] = useState(false)
  const [mutating, setMutating] = useState(false)
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [layoutResetting, setLayoutResetting] = useState(false)
  const [allIcons, setAllIcons] = useState<IconManagerItem[]>([])
  const [viewMode, setViewMode] = useState<IconManagerViewMode>('list')
  const [searchInput, setSearchInput] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [visibilityFilter, setVisibilityFilter] = useState<IconVisibilityFilter>('all')
  const [aiOrganizeOpen, setAiOrganizeOpen] = useState(false)
  const [aiOrganizeLayoutViewMode, setAiOrganizeLayoutViewMode] =
    useState<LaunchpadGridViewMode | null>(null)
  const [customNames, setCustomNames] = useState<Record<string, string>>({})
  const [selectedIconIds, setSelectedIconIds] = useState<string[]>([])
  const [deleteSourceFile, setDeleteSourceFile] = useState(false)
  const [deleteNewFileSource, setDeleteNewFileSource] = useState(false)
  const [createFileTargetDir, setCreateFileTargetDir] = useState('')
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
    void getSetting('deleteNewFileSource')
      .then(setDeleteNewFileSource)
      .catch(e => console.error('Failed to load delete new file source setting:', e))
    void getSetting('deleteIconSourceFile')
      .then(setDeleteSourceFile)
      .catch(e => console.error('Failed to load delete source file setting:', e))
    void getSetting('createFileTargetDir')
      .then(setCreateFileTargetDir)
      .catch(e => console.error('Failed to load create file target dir setting:', e))
  }, [toast])

  const pickCreateFileTargetDir = async () => {
    try {
      const selected = await openDialog({
        multiple: false,
        directory: true,
        title: translate('选择目录'),
      })
      if (typeof selected !== 'string') return
      setCreateFileTargetDir(selected)
      void setSetting('createFileTargetDir', selected).catch(e => {
        setCreateFileTargetDir('')
        console.error('Failed to save create file target dir setting:', e)
        toast.error(translate('设置保存失败，请稍后重试。'), {
          key: 'icon-library-create-file-dir',
          title: translate('图标库'),
        })
      })
    } catch (error) {
      console.error('Failed to open directory picker:', error)
    }
  }

  const handleResetCreateFileTargetDir = () => {
    setCreateFileTargetDir('')
    void setSetting('createFileTargetDir', '').catch(e => {
      console.error('Failed to save create file target dir setting:', e)
      toast.error(translate('设置保存失败，请稍后重试。'), {
        key: 'icon-library-create-file-dir',
        title: translate('图标库'),
      })
    })
  }

  const handleDeleteSourceFileChange = (checked: boolean) => {
    setDeleteSourceFile(checked)
    void setSetting('deleteIconSourceFile', checked).catch(e => {
      setDeleteSourceFile(!checked)
      console.error('Failed to save delete source file setting:', e)
      toast.error(translate('设置保存失败，请稍后重试。'), {
        key: 'icon-library-delete-source',
        title: translate('图标库'),
      })
    })
  }

  const handleDeleteNewFileSourceChange = (checked: boolean) => {
    setDeleteNewFileSource(checked)
    void setSetting('deleteNewFileSource', checked).catch(e => {
      setDeleteNewFileSource(!checked)
      console.error('Failed to save delete new file source setting:', e)
      toast.error(translate('设置保存失败，请稍后重试。'), {
        key: 'icon-library-delete-new-source',
        title: translate('图标库'),
      })
    })
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchKeyword(searchInput.trim().toLowerCase())
    }, 200)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const notifyMainWindow = async () => {
    const mainWindow = await WebviewWindow.getByLabel('main')
    if (mainWindow) {
      await mainWindow.emit(LAUNCHPAD_LAYOUT_RESET_EVENT)
    }
  }

  const filteredIcons = useMemo(
    () =>
      filterIconManagerItems(allIcons, {
        visibilityFilter,
        searchKeyword,
      }),
    [allIcons, visibilityFilter, searchKeyword]
  )

  const selectedIconIdSet = useMemo(() => {
    // 派生时剔除已不存在的选择项（图标库刷新后自动失效），不在 effect 里回写状态。
    const idSet = new Set(allIcons.map(icon => icon.id))
    return new Set(selectedIconIds.filter(id => idSet.has(id)))
  }, [selectedIconIds, allIcons])
  const filteredSelectedCount = useMemo(
    () => filteredIcons.filter(icon => selectedIconIdSet.has(icon.id)).length,
    [filteredIcons, selectedIconIdSet]
  )
  const allFilteredSelected =
    filteredIcons.length > 0 && filteredSelectedCount === filteredIcons.length
  const someFilteredSelected = filteredSelectedCount > 0 && !allFilteredSelected

  // 批量删除是否作用于全部勾选项的源文件：全局开启，或勾选项全部为新建创建。
  const bulkSelectedIcons = filteredIcons.filter(icon => selectedIconIdSet.has(icon.id))
  const bulkDeletesSource =
    deleteSourceFile ||
    (deleteNewFileSource && bulkSelectedIcons.length > 0 && bulkSelectedIcons.every(icon => icon.origin === 'new'))

  const controlsDisabled = mutating || listLoading || layoutResetting

  const { handleBulkMutation } = useIconManagerBulkActions({
    filteredIcons,
    selectedIconIdSet,
    busy: controlsDisabled,
    setMutating,
    refreshIconManagerList,
    notifyMainWindow,
  })

  const handleToggleIconSelected = (id: string) => {
    setSelectedIconIds(current =>
      current.includes(id) ? current.filter(item => item !== id) : [...current, id]
    )
  }

  const handleToggleSelectAll = () => {
    setSelectedIconIds(current => {
      const currentSet = new Set(current)
      if (allFilteredSelected) {
        filteredIcons.forEach(icon => currentSet.delete(icon.id))
      } else {
        filteredIcons.forEach(icon => currentSet.add(icon.id))
      }
      return Array.from(currentSet)
    })
  }

  const handleViewModeChange = (nextMode: IconManagerViewMode) => {
    if (nextMode === viewMode) return
    setViewMode(nextMode)
    void setSetting('iconManagerViewMode', nextMode).catch(e =>
      console.error('Failed to save icon manager view mode:', e)
    )
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

  // 该图标删除时是否会连同源文件：全局开关开启，或（仅新建开关开启且图标为新建创建）。
  const iconDeletesSource = (icon: IconManagerItem) =>
    deleteSourceFile || (deleteNewFileSource && icon.origin === 'new')

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
            desc: iconDeletesSource(pendingMutation.icon)
              ? translate('将“{name}”移出图标库，并将其源文件移入回收站。', {
                  name: pendingMutation.icon.name,
                })
              : translate('将“{name}”移出图标库，不会删除原始程序、文件或文件夹。', {
                  name: pendingMutation.icon.name,
                }),
            confirmLabel: translate('删除'),
            confirmVariant: 'destructive' as const,
          }
    : null

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
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => setQuickImportOpen(true)}
              disabled={mutating || layoutResetting}
            >
              <Wand2 className="h-4 w-4" />
              {translate('快捷导入')}
            </Button>
            <Button onClick={() => setAddIconDialogOpen(true)} disabled={mutating || layoutResetting}>
              <Upload className="h-4 w-4" />
              {translate('导入图标')}
            </Button>
          </div>
        </div>

        <div className="min-w-0 space-y-3 rounded-card border border-border/80 bg-card p-4">
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
              <InvalidIconScanDialog
                disabled={controlsDisabled}
                hasIcons={allIcons.length > 0}
                onRemoved={handleIconCreated}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetLaunchpadIcons}
                disabled={controlsDisabled}
              >
                {layoutResetting ? translate('重置中...') : translate('重置布局')}
              </Button>
              <div className="inline-flex h-9 rounded-button border border-border/90 bg-background p-1">
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
                        'inline-flex h-full w-8 items-center justify-center rounded-button transition-colors',
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

          {filteredIcons.length > 0 ? (
            <div className="rounded-card border border-border/60 bg-muted/15 px-3 py-2">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={allFilteredSelected}
                    indeterminate={someFilteredSelected}
                    onToggle={handleToggleSelectAll}
                    disabled={controlsDisabled}
                    ariaLabel={translate('全选')}
                  />
                  <span
                    className="cursor-pointer select-none text-sm"
                    onClick={() => !controlsDisabled && handleToggleSelectAll()}
                  >
                    {translate('全选')}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {translate('已选择：{count}', { count: filteredSelectedCount })}
                </span>
              </div>
              <motion.div
                initial={false}
                animate={{
                  height: filteredSelectedCount > 0 ? 'auto' : 0,
                  opacity: filteredSelectedCount > 0 ? 1 : 0,
                }}
                transition={{
                  duration: prefersReducedMotion ? 0 : 0.2,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="overflow-hidden"
              >
                <div className="flex flex-wrap items-center justify-end gap-2 pt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleBulkMutation('hide')}
                    disabled={controlsDisabled}
                  >
                    <EyeOff className="h-3.5 w-3.5" />
                    {translate('隐藏所选（{count}）', { count: filteredSelectedCount })}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleBulkMutation('unhide')}
                    disabled={controlsDisabled}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    {translate('显示所选（{count}）', { count: filteredSelectedCount })}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => void handleBulkMutation('delete')}
                    disabled={controlsDisabled}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {bulkDeletesSource
                      ? translate('删除所选（同时删除源文件）')
                      : translate('删除所选（{count}）', { count: filteredSelectedCount })}
                  </Button>
                </div>
              </motion.div>
            </div>
          ) : null}

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
                      'border bg-background transition-colors',
                      selectedIconIdSet.has(icon.id)
                        ? 'border-primary/50 bg-primary/5'
                        : 'border-border/80',
                      viewMode === 'grid'
                        ? 'rounded-card p-3'
                        : 'flex flex-wrap items-center gap-3 rounded-card p-3'
                    )}
                  >
                    {viewMode === 'list' ? (
                      <Checkbox
                        checked={selectedIconIdSet.has(icon.id)}
                        onToggle={() => handleToggleIconSelected(icon.id)}
                        disabled={controlsDisabled}
                        ariaLabel={icon.name || translate('未命名')}
                      />
                    ) : null}
                    <div className="flex min-w-0 flex-[1_1_16rem] items-start gap-3">
                      {viewMode === 'grid' ? (
                        <Checkbox
                          checked={selectedIconIdSet.has(icon.id)}
                          onToggle={() => handleToggleIconSelected(icon.id)}
                          disabled={controlsDisabled}
                          ariaLabel={icon.name || translate('未命名')}
                        />
                      ) : null}
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
                        {iconDeletesSource(icon)
                          ? translate('删除（同时删除源文件）')
                          : translate('删除')}
                      </Button>
                    </div>
                  </article>
                )
              })
            )}
          </div>
        </div>

        <SettingGroup title={translate('删除图标时的源文件处理')}>
          <ToggleRow
            title={translate('删除图标时同时删除源文件')}
            description={translate(
              '对所有图标生效：删除图标（包括“新建”创建的和拖入导入的）都会将其指向的源文件移入回收站。'
            )}
            checked={deleteSourceFile}
            onChange={handleDeleteSourceFileChange}
            disabled={mutating}
          />
          <ToggleRow
            title={translate('仅“新建”创建的图标：删除时同时删除源文件')}
            description={
              deleteSourceFile
                ? translate('已由上方选项包含：所有图标的源文件都会被移入回收站。')
                : deleteNewFileSource
                  ? translate(
                      '已开启：删除“新建”创建的图标时，其源文件会被移入回收站；拖入导入的图标不受影响。'
                    )
                  : translate(
                      '已关闭：删除“新建”创建的图标时仅从图标库移除，源文件保留在原位置。'
                    )
            }
            checked={deleteSourceFile || deleteNewFileSource}
            onChange={handleDeleteNewFileSourceChange}
            disabled={mutating || deleteSourceFile}
          />
        </SettingGroup>

        <SettingCard
          label={translate('新建文件保存路径')}
          desc={translate('右键“新建”创建的文件将保存到该目录；未设置时保存到桌面。')}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="min-w-0 max-w-full flex-1 truncate text-sm text-muted-foreground"
              title={createFileTargetDir || translate('桌面（默认）')}
            >
              {createFileTargetDir || translate('桌面（默认）')}
            </span>
            <Button variant="outline" size="sm" onClick={() => void pickCreateFileTargetDir()}>
              {translate('选择目录')}
            </Button>
            {createFileTargetDir ? (
              <Button variant="ghost" size="sm" onClick={handleResetCreateFileTargetDir}>
                {translate('恢复默认')}
              </Button>
            ) : null}
          </div>
        </SettingCard>
      </div>

      <AddIconDialog
        open={addIconDialogOpen}
        onOpenChange={setAddIconDialogOpen}
        onCreated={handleIconCreated}
      />

      <QuickImportDialog
        open={quickImportOpen}
        onOpenChange={setQuickImportOpen}
        onImported={async () => {
          await refreshIconManagerList()
          await notifyMainWindow()
        }}
      />

      {pendingMutation && mutationDialogText ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/22 p-4 backdrop-blur-[1px] dark:bg-black/45">
          <div className="w-full max-w-md rounded-card border border-border bg-background p-5 shadow-xl">
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
