import { AlertTriangle, CheckCircle2, Download, FileIcon, RefreshCw, SearchX, Wand2, X } from 'lucide-react'
import { translate } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { NativeScrollArea } from '@/components/ui/native-scroll-area'
import { groupQuickImportApps, type QuickImportAppDraft, type QuickImportAppStatus } from './quickImportModel'
import { useQuickImport, type QuickImportController } from './useQuickImport'

interface QuickImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 导入成功后的回调：面板负责刷新图标库并通知主窗口。 */
  onImported?: () => void | Promise<void>
}

/** 分组标题与说明：可能重复与一定重复相邻排列，重复项附警示说明。 */
const GROUP_META: Record<QuickImportAppStatus, { title: string; hint?: string }> = {
  new: { title: '新应用' },
  possible_duplicate: {
    title: '可能重复',
    hint: '与图标库中的应用重名但目标不同，请确认后再导入。',
  },
  exact_duplicate: {
    title: '一定重复',
    hint: '已在图标库中，默认不导入。',
  },
}

const STATUS_BADGE_CLASS: Record<QuickImportAppStatus, string> = {
  new: '',
  possible_duplicate:
    'border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300',
  exact_duplicate:
    'border-orange-500/30 bg-orange-500/15 text-orange-700 dark:text-orange-300',
}

const STATUS_LABEL: Record<QuickImportAppStatus, string> = {
  new: '',
  possible_duplicate: '可能重复',
  exact_duplicate: '已导入',
}

function AppPreview({ app }: { app: QuickImportAppDraft }) {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/70 bg-muted/35">
      {app.previewLoading ? (
        <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : app.preview ? (
        <img src={app.preview} alt="" className="h-full w-full object-contain" />
      ) : (
        <FileIcon className="h-4 w-4 text-muted-foreground" />
      )}
    </div>
  )
}

function AppRow({
  app,
  importing,
  onToggle,
}: {
  app: QuickImportAppDraft
  importing: boolean
  onToggle: QuickImportController['toggleApp']
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-card border border-border/80 bg-background p-3 transition-colors hover:bg-muted/20">
      <Checkbox
        checked={app.selected}
        onToggle={() => onToggle(app.key)}
        disabled={importing}
        ariaLabel={app.displayName}
      />
      <AppPreview app={app} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium" title={app.displayName}>
            {app.displayName}
          </p>
          {app.status !== 'new' ? (
            <span
              className={cn(
                'shrink-0 rounded border px-1.5 py-0.5 text-[10px]',
                STATUS_BADGE_CLASS[app.status]
              )}
            >
              {translate(STATUS_LABEL[app.status])}
            </span>
          ) : null}
        </div>
        <p
          className="mt-1 truncate text-xs text-muted-foreground"
          title={app.targetPath || app.sourcePath}
        >
          {app.targetPath || app.sourcePath}
        </p>
      </div>
      <span className="shrink-0 text-[10px] text-muted-foreground">
        {translate(app.sourceLabel)}
      </span>
    </label>
  )
}

/**
 * 「快捷导入」确认弹窗：展示扫描到的已安装应用，按
 * 新应用 → 可能重复 → 一定重复 分组排列；一定重复（已导入）默认取消勾选。
 * 主窗口引导界面与设置页共用。
 */
export function QuickImportDialog({ open, onOpenChange, onImported }: QuickImportDialogProps) {
  const controller = useQuickImport({ open, onImported })
  const { apps, scanning, importing, scanError, selectedCount, toggleApp, setAllSelected, startScan, confirmImport } =
    controller
  const groups = groupQuickImportApps(apps)
  const allSelected = apps.length > 0 && selectedCount === apps.length

  const handleConfirm = async () => {
    const result = await confirmImport()
    if (result) onOpenChange(false)
  }

  if (!open) return null

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
                {groups.map(group => {
                  const meta = GROUP_META[group.status]
                  return (
                    <section key={group.status} className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                        <h3 className="text-sm font-medium text-foreground">
                          {translate(meta.title)}
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                            {group.apps.length}
                          </span>
                        </h3>
                        {meta.hint ? (
                          <p className="text-xs text-muted-foreground">{translate(meta.hint)}</p>
                        ) : null}
                      </div>
                      <div className="space-y-2">
                        {group.apps.map(app => (
                          <AppRow key={app.key} app={app} importing={importing} onToggle={toggleApp} />
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
