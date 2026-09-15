import { lazy, Suspense } from 'react'
import { AlertTriangle, Check, CheckCircle2, Download, FileIcon, Pencil, RefreshCw, SearchX, Wand2, X } from 'lucide-react'
import { translate } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { NativeScrollArea } from '@/components/ui/native-scroll-area'
import {
  countSelectedQuickImportApps,
  groupQuickImportAppsBySource,
  summarizeQuickImportMerges,
  type QuickImportAppDraft,
  type QuickImportAppStatus,
} from './quickImportModel'
import { useQuickImport, type QuickImportController } from './useQuickImport'

const AddIconDialog = lazy(() =>
  import('../icons/AddIconDialog').then(module => ({ default: module.AddIconDialog }))
)

interface QuickImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 导入成功后的回调：面板负责刷新图标库并通知主窗口。 */
  onImported?: () => void | Promise<void>
}

/** 重复状态的角标圆点配色：与列表时期的徽章色系一致。 */
const STATUS_DOT_CLASS: Record<QuickImportAppStatus, string> = {
  new: '',
  possible_duplicate: 'bg-sky-500',
  exact_duplicate: 'bg-orange-500',
}

const STATUS_LABEL: Record<QuickImportAppStatus, string> = {
  new: '',
  possible_duplicate: '可能重复',
  exact_duplicate: '已导入',
}

/** 单个应用的网格瓦片：与「确认导入图标」弹窗同款的图标展示形式（含右上角编辑按钮）。 */
function AppTile({
  app,
  importing,
  onToggle,
  onEdit,
}: {
  app: QuickImportAppDraft
  importing: boolean
  onToggle: QuickImportController['toggleApp']
  onEdit: QuickImportController['handleEditApp']
}) {
  const statusLabel = app.status !== 'new' ? translate(STATUS_LABEL[app.status]) : ''
  const mergedHint = Object.entries(app.mergedSources ?? {})
    .map(([source, count]) => `${translate(source)}×${count}`)
    .join('、')
  return (
    <div className="group relative min-w-0">
      <button
        type="button"
        aria-pressed={app.selected}
        aria-label={
          app.selected
            ? translate('取消选择 {name}', { name: app.displayName })
            : translate('选择 {name}', { name: app.displayName })
        }
        title={[
          app.displayName,
          app.targetPath || app.sourcePath,
          translate(app.sourceLabel),
          statusLabel,
          mergedHint ? translate('其他来源同款：{detail}', { detail: mergedHint }) : '',
        ]
          .filter(Boolean)
          .join('\n')}
        onClick={() => onToggle(app.key)}
        disabled={importing}
        className={`flex h-[4.75rem] w-full min-w-0 flex-col items-center justify-start gap-1 px-1 py-1 text-center transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${
          app.selected ? 'opacity-100' : 'opacity-70 hover:opacity-100'
        }`}
      >
        <span
          className={`pointer-events-none absolute left-1.5 top-0.5 z-10 flex h-3.5 w-3.5 items-center justify-center rounded-full transition-opacity ${
            app.selected
              ? 'bg-primary text-primary-foreground opacity-100'
              : 'border border-border bg-background opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
          }`}
        >
          {app.selected ? <Check className="h-2.5 w-2.5" /> : null}
        </span>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden">
          {app.previewLoading ? (
            <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : app.preview ? (
            <img src={app.preview} alt="" className="h-full w-full object-contain" />
          ) : (
            <FileIcon className="h-5 w-5 text-muted-foreground" />
          )}
        </span>
        <span
          className="min-h-6 w-full overflow-hidden text-[11px] font-medium leading-3 text-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]"
        >
          {app.displayName}
        </span>
      </button>
      {app.status !== 'new' ? (
        <span
          className={cn(
            'pointer-events-none absolute right-7 top-2 z-10 h-2.5 w-2.5 rounded-full',
            STATUS_DOT_CLASS[app.status]
          )}
        />
      ) : null}
      <button
        type="button"
        aria-label={translate('编辑 {name}', { name: app.displayName })}
        title={translate('编辑')}
        onClick={() => onEdit(app.key)}
        disabled={importing}
        className="absolute right-0.5 top-0.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-background/90 text-muted-foreground opacity-100 shadow-sm transition-[opacity,color] hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
      >
        <Pencil className="h-3 w-3" />
      </button>
    </div>
  )
}

/**
 * 「快捷导入」确认弹窗：以网格瓦片展示扫描到的已安装应用，按来源位置
 * （开始菜单 / 桌面 / 快速启动 / 注册表等）分组，组内新应用在前、重复项靠后；
 * 一定重复（已导入）默认取消勾选，瓦片右上角圆点标记重复状态。
 * 顶部与各分组标题均有全选，可整批或按来源批量勾选。
 * 展示形式与「确认导入图标」弹窗保持一致，支持逐项编辑名称与图标。
 * 主窗口引导界面与设置页共用。
 */
export function QuickImportDialog({ open, onOpenChange, onImported }: QuickImportDialogProps) {
  const controller = useQuickImport({ open, onImported })
  const {
    apps,
    scanning,
    importing,
    scanError,
    selectedCount,
    editingApp,
    toggleApp,
    setAllSelected,
    setSourceSelected,
    startScan,
    handleEditApp,
    handleEditDialogOpenChange,
    handleSaveAppEdit,
    confirmImport,
  } = controller
  const groups = groupQuickImportAppsBySource(apps)
  const allSelected = apps.length > 0 && selectedCount === apps.length
  const hasImportedApps = apps.some(app => app.status === 'exact_duplicate')

  const handleConfirm = async () => {
    const result = await confirmImport()
    if (result) onOpenChange(false)
  }

  if (!open) return null

  // 编辑中：隐藏本弹窗面板，展示「编辑图标信息」弹窗（与拖拽导入的编辑流程一致）。
  if (editingApp) {
    return (
      <Suspense fallback={null}>
        <AddIconDialog
          open
          initialDraft={editingApp.draft}
          onOpenChange={handleEditDialogOpenChange}
          onSubmitDraft={handleSaveAppEdit}
        />
      </Suspense>
    )
  }

  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/25 p-4 backdrop-blur-[2px] dark:bg-black/55">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-import-title"
        className="flex max-h-[min(42rem,calc(100vh-2rem))] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border/80 px-4 py-4 sm:px-5">
          <div className="min-w-0 space-y-1">
            <h2 id="quick-import-title" className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Wand2 className="h-4 w-4" />
              {translate('快捷导入应用')}
            </h2>
            <p className="text-xs leading-5 text-muted-foreground">
              {translate('扫描桌面、开始菜单等位置的已安装应用，勾选后批量导入图标库。')}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={translate('关闭')}
            onClick={() => onOpenChange(false)}
            disabled={importing}
            className="shrink-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {scanning ? (
          <div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-3 px-5 py-10 text-center">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-sm font-medium">{translate('正在扫描已安装的应用...')}</p>
              <p className="text-xs leading-5 text-muted-foreground">
                {translate('扫描范围：桌面、开始菜单、快速启动和注册表。')}
              </p>
            </div>
          </div>
        ) : scanError ? (
          <div
            role="alert"
            className="flex min-h-64 flex-1 flex-col items-center justify-center gap-3 px-5 py-10 text-center"
          >
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-300" />
            <div className="max-w-md space-y-1">
              <p className="text-sm font-medium">{translate('扫描失败，请重试。')}</p>
              <p className="break-words text-xs text-muted-foreground" title={scanError}>
                {scanError}
              </p>
            </div>
            <Button size="sm" onClick={() => void startScan()} disabled={importing}>
              <RefreshCw className="h-4 w-4" />
              {translate('重试')}
            </Button>
          </div>
        ) : apps.length === 0 ? (
          <div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-3 px-5 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">{translate('未发现可导入的应用')}</p>
              <p className="text-xs leading-5 text-muted-foreground">
                {translate('没有找到可用的应用快捷方式，可以手动添加图标。')}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void startScan()} disabled={importing}>
              <SearchX className="h-4 w-4" />
              {translate('重新扫描')}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-muted/15 px-4 py-3 sm:px-5">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={allSelected}
                  indeterminate={selectedCount > 0 && !allSelected}
                  onToggle={() => setAllSelected(!allSelected)}
                  disabled={importing}
                  ariaLabel={translate('全选')}
                />
                <span
                  className="cursor-pointer select-none text-sm"
                  onClick={() => !importing && setAllSelected(!allSelected)}
                >
                  {translate('全选')}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs text-muted-foreground">
                  {translate('共发现 {total} 个应用，已选择 {selected} 个。', {
                    total: apps.length,
                    selected: selectedCount,
                  })}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void startScan()}
                  disabled={importing}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {translate('重新扫描')}
                </Button>
              </div>
            </div>

            <NativeScrollArea asChild>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3 sm:px-5">
                {hasImportedApps ? (
                  <p className="px-1 text-xs leading-5 text-muted-foreground">
                    {translate('橙色圆点为已在图标库中的应用，默认不勾选；如需重新导入请手动勾选。')}
                  </p>
                ) : null}
                {groups.map(group => {
                  const possibleCount = group.apps.filter(
                    app => app.status === 'possible_duplicate'
                  ).length
                  const importedCount = group.apps.filter(
                    app => app.status === 'exact_duplicate'
                  ).length
                  const groupSelectedCount = countSelectedQuickImportApps(group.apps)
                  const groupAllSelected =
                    group.apps.length > 0 && groupSelectedCount === group.apps.length
                  const toggleGroup = () =>
                    !importing && setSourceSelected(group.source, !groupAllSelected)
                  const sourceMerges = summarizeQuickImportMerges(apps, group.source)
                  const mergedTotal = sourceMerges.reduce((sum, item) => sum + item.count, 0)
                  return (
                    <section key={group.source} className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={groupAllSelected}
                            indeterminate={groupSelectedCount > 0 && !groupAllSelected}
                            onToggle={toggleGroup}
                            disabled={importing}
                            ariaLabel={translate('全选 {source}', {
                              source: translate(group.source),
                            })}
                          />
                          <h3
                            className="cursor-pointer select-none text-sm font-medium text-foreground"
                            onClick={toggleGroup}
                          >
                            {translate(group.source)}
                            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                              {group.apps.length}
                            </span>
                          </h3>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          {mergedTotal > 0 ? (
                            <span className="text-xs text-muted-foreground">
                              {translate('另有 {count} 个与{sources}重复', {
                                count: mergedTotal,
                                sources: sourceMerges
                                  .map(item => translate(item.target))
                                  .join('/'),
                              })}
                            </span>
                          ) : null}
                          {possibleCount > 0 ? (
                            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <span
                                className={cn(
                                  'h-2 w-2 rounded-full',
                                  STATUS_DOT_CLASS.possible_duplicate
                                )}
                              />
                              {translate('可能重复 {count}', { count: possibleCount })}
                            </span>
                          ) : null}
                          {importedCount > 0 ? (
                            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <span
                                className={cn(
                                  'h-2 w-2 rounded-full',
                                  STATUS_DOT_CLASS.exact_duplicate
                                )}
                              />
                              {translate('已导入 {count}', { count: importedCount })}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="grid justify-start gap-x-2 gap-y-1 [grid-template-columns:repeat(auto-fill,5rem)]">
                        {group.apps.map(app => (
                          <AppTile
                            key={app.key}
                            app={app}
                            importing={importing}
                            onToggle={toggleApp}
                            onEdit={handleEditApp}
                          />
                        ))}
                      </div>
                    </section>
                  )
                })}
              </div>
            </NativeScrollArea>

            <div className="flex flex-wrap justify-end gap-2 border-t border-border/80 bg-muted/15 px-4 py-3 sm:px-5">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={importing}
                className="min-w-0 flex-1 sm:flex-none"
              >
                {translate('取消')}
              </Button>
              <Button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={importing || selectedCount === 0}
                className="min-w-0 flex-1 sm:flex-none"
              >
                {importing ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {importing
                  ? translate('正在导入...')
                  : translate('确认导入（{count}）', { count: selectedCount })}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
