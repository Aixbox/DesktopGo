import { useCallback, useEffect, useState } from 'react'
import { History, Pencil, Save, Trash2 } from 'lucide-react'
import { translate } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { readLayoutPayload } from '@/components/icon-grid/services/layoutStore'
import { LayoutNameDialog } from '@/components/layout-library/LayoutNameDialog'
import { LayoutThumbnailView } from '@/components/layout-library/LayoutThumbnailView'
import {
  deleteLayoutVersion,
  formatLayoutVersionTime,
  listLayoutVersions,
  renameLayoutVersion,
  saveLayoutVersion,
  type LayoutVersionMeta,
} from '@/components/layout-library/layoutLibrary'

type DialogState = { mode: 'save' } | { mode: 'rename'; version: LayoutVersionMeta } | null

/** 设置页的布局库：保存当前布局、重命名、删除。应用布局在启动台侧栏里做。 */
export function LayoutLibraryPanel() {
  const toast = useToast()
  const [versions, setVersions] = useState<LayoutVersionMeta[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState<DialogState>(null)
  const loading = versions === null

  const reportError = useCallback(
    (message: string, error: unknown) => {
      console.error(message, error)
      toast.error(`${message}：${String(error)}`, {
        key: 'settings-layout-library',
        title: translate('布局库'),
      })
    },
    [toast]
  )

  const reload = useCallback(() => {
    void listLayoutVersions('paged')
      .then(setVersions)
      .catch(error => reportError(translate('加载布局库失败，请重试。'), error))
  }, [reportError])

  useEffect(() => {
    reload()
  }, [reload])

  const allVersions = versions ?? []
  const savedVersions = allVersions.filter(version => version.kind === 'saved')
  const historyVersions = allVersions.filter(version => version.kind === 'auto')

  const handleSaveCurrent = async (name: string) => {
    try {
      const payload = await readLayoutPayload('paged')
      if (!payload) throw new Error(translate('当前布局为空'))
      await saveLayoutVersion({ kind: 'saved', name, payload })
      setDialog(null)
      reload()
      toast.success(translate('已保存布局「{name}」。', { name }), {
        key: 'settings-layout-library',
        title: translate('布局库'),
      })
    } catch (error) {
      reportError(translate('保存布局失败'), error)
    }
  }

  const handleRename = async (name: string) => {
    if (dialog?.mode !== 'rename') return
    try {
      await renameLayoutVersion(dialog.version.id, name)
      setDialog(null)
      reload()
    } catch (error) {
      reportError(translate('重命名失败'), error)
    }
  }

  const handleDelete = async (version: LayoutVersionMeta) => {
    if (busy) return
    const label = version.name?.trim() || formatLayoutVersionTime(version.createdAt)
    const confirmed = window.confirm(translate('确定删除布局「{name}」吗？', { name: label }))
    if (!confirmed) return
    setBusy(true)
    try {
      await deleteLayoutVersion(version.id)
      reload()
    } catch (error) {
      reportError(translate('删除布局失败'), error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="settings-layout-library-heading">
        <div className="mb-4 border-b border-border/70 pb-3">
          <h2 id="settings-layout-library-heading" className="text-base font-semibold">
            {translate('布局库')}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {translate('保存当前的分页布局，随时在启动台里预览并应用。')}
          </p>
        </div>

        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground">{translate('已保存布局')}</h3>
            <Button size="sm" variant="outline" onClick={() => setDialog({ mode: 'save' })}>
              <Save className="h-3.5 w-3.5" />
              {translate('保存当前布局')}
            </Button>
          </div>

          <div className="divide-y divide-border/70 overflow-hidden rounded-card border border-border/80 bg-card">
            {loading ? (
              <p className="px-4 py-4 text-xs text-muted-foreground">{translate('正在加载...')}</p>
            ) : savedVersions.length === 0 ? (
              <p className="px-4 py-4 text-xs text-muted-foreground">
                {translate('还没有保存的布局。点右上角把现在的摆放存下来。')}
              </p>
            ) : (
              savedVersions.map(version => (
                <div key={version.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <LayoutThumbnailView
                      thumbnail={version.thumbnail}
                      className="h-9 w-16 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {version.name?.trim() || translate('未命名布局')}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {translate('{count} 个图标', { count: version.iconCount })} ·{' '}
                        {formatLayoutVersionTime(version.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={() => setDialog({ mode: 'rename', version })}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      {translate('重命名')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-muted-foreground hover:text-red-500"
                      disabled={busy}
                      onClick={() => void handleDelete(version)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {translate('删除')}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="settings-layout-history-heading">
        <div className="mb-3 flex items-center gap-2 border-b border-border/70 pb-3">
          <History className="h-4 w-4 text-muted-foreground" />
          <h2 id="settings-layout-history-heading" className="text-base font-semibold">
            {translate('历史布局')}
          </h2>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          {translate('每次改动布局都会自动留一份快照，只保留最近 {count} 份。', { count: 50 })}
        </p>
        <div className="divide-y divide-border/70 overflow-hidden rounded-card border border-border/80 bg-card">
          {loading ? (
            <p className="px-4 py-4 text-xs text-muted-foreground">{translate('正在加载...')}</p>
          ) : historyVersions.length === 0 ? (
            <p className="px-4 py-4 text-xs text-muted-foreground">
              {translate('还没有历史快照，改动布局后会自动记录。')}
            </p>
          ) : (
            historyVersions.slice(0, 10).map(version => (
              <div key={version.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="flex min-w-0 items-center gap-3">
                  <LayoutThumbnailView
                    thumbnail={version.thumbnail}
                    className="h-7 w-12 shrink-0"
                  />
                  <span className="truncate text-sm">
                    {version.name?.trim() || formatLayoutVersionTime(version.createdAt)}
                  </span>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {translate('{count} 个图标', { count: version.iconCount })}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      {dialog ? (
        <LayoutNameDialog
          title={dialog.mode === 'rename' ? translate('重命名布局') : translate('保存当前布局')}
          description={
            dialog.mode === 'rename'
              ? translate('换个好记的名字，启动台的布局库里会同步显示。')
              : translate('给当前的分页布局起个名字，之后可以在布局库里一键应用。')
          }
          initialName={dialog.mode === 'rename' ? (dialog.version.name ?? '') : ''}
          confirmLabel={translate('保存')}
          onCancel={() => setDialog(null)}
          onConfirm={dialog.mode === 'rename' ? handleRename : handleSaveCurrent}
        />
      ) : null}
    </div>
  )
}
