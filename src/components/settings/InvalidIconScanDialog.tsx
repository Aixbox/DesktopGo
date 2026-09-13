import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { AlertTriangle, CheckCircle2, RefreshCw, SearchX, Trash2, X } from 'lucide-react'
import { translate } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { NativeScrollArea } from '@/components/ui/native-scroll-area'
import { useToast } from '@/components/ui/toast'
import type { IconMutationTarget, InvalidIconEntry } from '@/types'

interface InvalidIconScanDialogProps {
  /** 主列表处于其它操作流程时禁用扫描与删除。 */
  disabled: boolean
  hasIcons: boolean
  /** 删除完成后回调：面板负责刷新图标库并通知主窗口。 */
  onRemoved: () => Promise<void>
}

/** 「扫描失效图标」触发按钮 + 结果弹窗：多选勾选后批量移出图标库。 */
export function InvalidIconScanDialog({ disabled, hasIcons, onRemoved }: InvalidIconScanDialogProps) {
  const toast = useToast()
  const [scanning, setScanning] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<InvalidIconEntry[]>([])
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])

  const invalidIconKey = (icon: InvalidIconEntry) => icon.id
  const selectedKeySet = new Set(selectedKeys)
  const selectedCount = results.filter(icon => selectedKeySet.has(invalidIconKey(icon))).length
  const allSelected = results.length > 0 && selectedCount === results.length

  const handleScan = async () => {
    if (scanning || deleting) return
    setScanning(true)
    try {
      const scanResults = await invoke<InvalidIconEntry[]>('scan_invalid_icons')
      setResults(scanResults)
      setSelectedKeys(scanResults.map(invalidIconKey))
      setOpen(true)
    } catch (e) {
      toast.error(translate('扫描失效图标失败：{error}', { error: String(e) }), {
        key: 'icon-library-invalid-scan',
        title: translate('图标库'),
      })
    } finally {
      setScanning(false)
    }
  }

  const handleToggle = (key: string) => {
    setSelectedKeys(current =>
      current.includes(key) ? current.filter(item => item !== key) : [...current, key]
    )
  }

  const handleDeleteSelected = async () => {
    const targets: IconMutationTarget[] = results
      .filter(icon => selectedKeySet.has(invalidIconKey(icon)))
      .map(icon => ({ id: icon.id }))
    if (targets.length === 0 || deleting) return

    const confirmed = window.confirm(
      translate('确定将选中的 {count} 个失效图标移出图标库吗？不会删除原始文件。', {
        count: targets.length,
      })
    )
    if (!confirmed) return

    setDeleting(true)
    try {
      const affected = await invoke<number>('delete_icons', { targets })
      toast.success(translate('已移出 {count} 个失效图标。', { count: affected }), {
        key: 'icon-library-invalid-delete',
        title: translate('图标库'),
      })
      const remaining = await invoke<InvalidIconEntry[]>('scan_invalid_icons')
      setResults(remaining)
      setSelectedKeys([])
      await onRemoved()
    } catch (e) {
      toast.error(translate('删除失效图标失败：{error}', { error: String(e) }), {
        key: 'icon-library-invalid-delete',
        title: translate('图标库'),
      })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => void handleScan()}
        disabled={disabled || deleting || !hasIcons}
      >
        {scanning ? (
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <SearchX className="h-3.5 w-3.5" />
        )}
        {scanning ? translate('正在扫描...') : translate('扫描失效图标')}
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/22 p-4 backdrop-blur-[1px] dark:bg-black/45">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="invalid-icon-scan-title"
            className="flex max-h-[min(42rem,calc(100vh-2rem))] w-full max-w-2xl flex-col overflow-hidden rounded-card border border-border bg-card shadow-xl"
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
                onClick={() => setOpen(false)}
                disabled={deleting}
                className="shrink-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {results.length === 0 ? (
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
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={allSelected}
                      indeterminate={selectedCount > 0 && !allSelected}
                      onToggle={() => setSelectedKeys(allSelected ? [] : results.map(invalidIconKey))}
                      disabled={deleting}
                      ariaLabel={translate('全选')}
                    />
                    <span
                      className="cursor-pointer select-none text-sm"
                      onClick={() =>
                        !deleting &&
                        setSelectedKeys(allSelected ? [] : results.map(invalidIconKey))
                      }
                    >
                      {translate('全选')}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {translate('发现 {total} 项，已选择 {selected} 项。', {
                      total: results.length,
                      selected: selectedCount,
                    })}
                  </p>
                </div>

                <NativeScrollArea asChild>
                  <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3 sm:px-5">
                    {results.map(icon => {
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
                          className="flex cursor-pointer items-start gap-3 rounded-card border border-border/80 bg-background p-3 transition-colors hover:bg-muted/20"
                        >
                          <Checkbox
                            checked={selectedKeySet.has(key)}
                            onToggle={() => handleToggle(key)}
                            disabled={deleting}
                            ariaLabel={icon.name || translate('未命名')}
                            className="mt-0.5"
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
                </NativeScrollArea>
              </>
            )}

            <div className="flex flex-wrap justify-end gap-2 border-t border-border/80 bg-muted/15 px-4 py-3 sm:px-5">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={deleting}
                className="min-w-0 flex-1 sm:flex-none"
              >
                {translate('关闭')}
              </Button>
              {results.length > 0 ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => void handleDeleteSelected()}
                  disabled={deleting || selectedCount === 0}
                  className="min-w-0 flex-1 sm:flex-none"
                >
                  {deleting ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  {deleting
                    ? translate('正在删除...')
                    : translate('删除所选（{count}）', { count: selectedCount })}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
