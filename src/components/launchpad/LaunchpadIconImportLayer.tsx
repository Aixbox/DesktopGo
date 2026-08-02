import { lazy, Suspense } from 'react'
import { Check, Download, FileIcon, Pencil, RefreshCw, X } from 'lucide-react'
import { translate } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { NativeScrollArea } from '@/components/ui/native-scroll-area'
import type { LaunchpadIconImportController } from './useLaunchpadIconImportController'

const AddIconDialog = lazy(() =>
  import('../icons/AddIconDialog').then(module => ({ default: module.AddIconDialog }))
)

interface LaunchpadIconImportLayerProps {
  controller: LaunchpadIconImportController
}

export function LaunchpadIconImportLayer({ controller }: LaunchpadIconImportLayerProps) {
  const {
    addIconDialogOpen,
    addIconInitialDraft,
    dismissPendingDrop,
    editingDropIndex,
    editingIcon,
    handleAddIconDialogOpenChange,
    handleConfirmDroppedImport,
    handleEditDroppedDraft,
    handleIconCreated,
    handleSaveDroppedDraft,
    handleSaveIconEdit,
    isExternalDragActive,
    isImportingDrop,
    pendingDropDrafts,
    toggleDroppedDraft,
  } = controller
  const showDropLayer =
    isExternalDragActive || (pendingDropDrafts.length > 0 && editingDropIndex === null)
  const selectedCount = pendingDropDrafts.filter(draft => draft.selected).length

  return (
    <>
      {showDropLayer ? (
        <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/25 p-4 backdrop-blur-[2px] dark:bg-black/55">
          <div
            role={isExternalDragActive ? 'status' : 'dialog'}
            aria-modal={isExternalDragActive ? undefined : true}
            aria-labelledby={isExternalDragActive ? undefined : 'drop-import-title'}
            className="w-full max-w-3xl overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
          >
            {isExternalDragActive ? (
              <div className="p-5 sm:p-6">
                <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border-2 border-dashed border-primary/45 bg-primary/[0.04] px-6 py-10 text-center">
                  <div className="accent-foreground flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                    <Download className="h-5 w-5" />
                  </div>
                  <p className="mt-4 text-base font-semibold text-foreground">
                    {translate('拖到这里准备导入')}
                  </p>
                  <p className="mt-1.5 max-w-sm text-sm leading-6 text-muted-foreground">
                    {translate('松开后将打开导入表单，确认前不会添加到图标库。')}
                  </p>
                </div>
              </div>
            ) : (
              <form
                onSubmit={event => {
                  event.preventDefault()
                  void handleConfirmDroppedImport()
                }}
              >
                <div className="flex items-start justify-between gap-4 border-b border-border/80 px-4 py-4 sm:px-5">
                  <div className="min-w-0 space-y-1">
                    <h2 id="drop-import-title" className="text-base font-semibold text-foreground">
                      {translate('确认导入图标')}
                    </h2>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {translate('选择需要导入的图标；可单独编辑名称、启动选项和图标。')}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={translate('关闭')}
                    onClick={dismissPendingDrop}
                    disabled={isImportingDrop}
                    className="shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <NativeScrollArea asChild>
                  <div className="max-h-[min(28rem,56vh)] overflow-y-auto px-4 py-3 sm:px-5">
                    <div className="grid justify-start gap-x-2 gap-y-1 [grid-template-columns:repeat(auto-fill,5rem)]">
                      {pendingDropDrafts.map((draft, index) => (
                        <div key={draft.key} className="group relative min-w-0">
                          <button
                            type="button"
                            aria-pressed={draft.selected}
                            aria-label={
                              draft.selected
                                ? translate('取消选择 {name}', { name: draft.displayName })
                                : translate('选择 {name}', { name: draft.displayName })
                            }
                            onClick={() => toggleDroppedDraft(index)}
                            disabled={isImportingDrop}
                            className={`flex h-[4.75rem] w-full min-w-0 flex-col items-center justify-start gap-1 px-1 py-1 text-center transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${
                              draft.selected ? 'opacity-100' : 'opacity-70 hover:opacity-100'
                            }`}
                          >
                            <span
                              className={`pointer-events-none absolute left-1.5 top-0.5 z-10 flex h-3.5 w-3.5 items-center justify-center rounded-full transition-opacity ${
                                draft.selected
                                  ? 'bg-primary text-primary-foreground opacity-100'
                                  : 'border border-border bg-background opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
                              }`}
                            >
                              {draft.selected ? <Check className="h-2.5 w-2.5" /> : null}
                            </span>
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden">
                              {draft.previewLoading ? (
                                <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                              ) : draft.preview ? (
                                <img
                                  src={draft.preview}
                                  alt=""
                                  className="h-full w-full object-contain"
                                />
                              ) : (
                                <FileIcon className="h-5 w-5 text-muted-foreground" />
                              )}
                            </span>
                            <span
                              className="min-h-6 w-full overflow-hidden text-[11px] font-medium leading-3 text-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]"
                              title={draft.displayName}
                            >
                              {draft.displayName}
                            </span>
                          </button>
                          <button
                            type="button"
                            aria-label={translate('编辑 {name}', { name: draft.displayName })}
                            title={translate('编辑')}
                            onClick={() => handleEditDroppedDraft(index)}
                            disabled={isImportingDrop}
                            className="absolute right-0.5 top-0.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-background/90 text-muted-foreground opacity-100 shadow-sm transition-[opacity,color] hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </NativeScrollArea>

                <div className="flex flex-wrap justify-end gap-2 border-t border-border/80 bg-muted/15 px-4 py-3 sm:px-5">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={dismissPendingDrop}
                    disabled={isImportingDrop}
                    className="min-w-0 flex-1 sm:flex-none"
                  >
                    {translate('取消')}
                  </Button>
                  <Button
                    type="submit"
                    disabled={isImportingDrop || selectedCount === 0}
                    className="min-w-0 flex-1 sm:flex-none"
                  >
                    {isImportingDrop ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    {isImportingDrop
                      ? translate('正在导入...')
                      : translate('确认导入（{count}）', { count: selectedCount })}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}

      <Suspense fallback={null}>
        {addIconDialogOpen ? (
          <AddIconDialog
            open
            onOpenChange={handleAddIconDialogOpenChange}
            onCreated={handleIconCreated}
            initialDraft={addIconInitialDraft}
            onSubmitDraft={
              editingIcon
                ? handleSaveIconEdit
                : editingDropIndex !== null
                  ? handleSaveDroppedDraft
                  : undefined
            }
          />
        ) : null}
      </Suspense>
    </>
  )
}
