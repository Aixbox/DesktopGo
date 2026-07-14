import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { invoke } from '@tauri-apps/api/core'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import {
  ChevronDown,
  FileSearch,
  FolderOpen,
  ImagePlus,
  Images,
  RefreshCw,
  Upload,
  X,
} from 'lucide-react'
import { getPathLeaf } from '@/lib/iconManager'
import { translate, useI18n } from '@/lib/i18n'
import { getSetting } from '@/lib/settingsStore'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'

type ImportIconsResult = {
  imported_count: number
  duplicate_count: number
  invalid_count: number
}

export type AddIconDialogCreatedEntry = {
  displayName: string
  targetPath: string
}

interface AddIconDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (entry: AddIconDialogCreatedEntry) => void | Promise<void>
}

function deriveIconEntryName(path: string) {
  const leaf = getPathLeaf(path)
  if (!leaf) return ''
  return leaf.replace(/\.[^./\\]+$/, '') || leaf
}

export function AddIconDialog({ open, onOpenChange, onCreated }: AddIconDialogProps) {
  useI18n()

  const titleId = useId()
  const descriptionId = useId()
  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const previewRequestRef = useRef(0)
  const [name, setName] = useState('')
  const [targetPath, setTargetPath] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [launchArguments, setLaunchArguments] = useState('')
  const [workingDirectory, setWorkingDirectory] = useState('')
  const [customIconPath, setCustomIconPath] = useState('')
  const [preview, setPreview] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const toast = useToast()

  const resetForm = () => {
    previewRequestRef.current += 1
    setName('')
    setTargetPath('')
    setAdvancedOpen(false)
    setLaunchArguments('')
    setWorkingDirectory('')
    setCustomIconPath('')
    setPreview('')
    setPreviewLoading(false)
  }

  const closeDialog = () => {
    if (!submitting) onOpenChange(false)
  }

  useEffect(() => {
    if (!open) return

    previousFocusRef.current = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusFrame = window.requestAnimationFrame(() => nameInputRef.current?.focus())

    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.body.style.overflow = previousOverflow
      window.requestAnimationFrame(() => previousFocusRef.current?.focus())
    }
  }, [open])

  useEffect(() => {
    if (!open) resetForm()
  }, [open])

  useEffect(() => {
    previewRequestRef.current += 1
    const requestId = previewRequestRef.current
    const previewPath = customIconPath.trim() || targetPath.trim()

    if (!open || !previewPath) {
      setPreview('')
      setPreviewLoading(false)
      return
    }

    const timer = window.setTimeout(() => {
      void invoke<string>('get_drag_preview_icon', {
        path: previewPath,
        iconSize: 48,
      })
        .then(nextPreview => {
          if (previewRequestRef.current === requestId) setPreview(nextPreview)
        })
        .catch(() => {
          if (previewRequestRef.current === requestId) setPreview('')
        })
        .finally(() => {
          if (previewRequestRef.current === requestId) setPreviewLoading(false)
        })
    }, 280)

    return () => window.clearTimeout(timer)
  }, [customIconPath, open, targetPath])

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeDialog()
      return
    }
    if (event.key !== 'Tab' || !panelRef.current) return

    const focusable = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    )
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const updateTargetPath = (nextPath: string, replaceName: boolean) => {
    previewRequestRef.current += 1
    setTargetPath(nextPath)
    setPreview('')
    setPreviewLoading(Boolean(nextPath.trim()))
    if (replaceName || !name.trim()) setName(deriveIconEntryName(nextPath))
  }

  const handlePickTarget = async (directory: boolean) => {
    try {
      const selected = await openDialog({
        multiple: false,
        directory,
        title: directory ? translate('选择文件夹') : translate('选择文件'),
      })
      if (typeof selected === 'string') updateTargetPath(selected, true)
    } catch (error) {
      toast.error(translate('选择目标失败：{error}', { error: String(error) }), {
        key: 'add-icon-dialog-target',
        title: translate('添加图标'),
      })
    }
  }

  const handlePickWorkingDirectory = async () => {
    try {
      const selected = await openDialog({
        multiple: false,
        directory: true,
        title: translate('选择工作目录'),
      })
      if (typeof selected === 'string') setWorkingDirectory(selected)
    } catch (error) {
      toast.error(translate('选择工作目录失败：{error}', { error: String(error) }), {
        key: 'add-icon-dialog-working-directory',
        title: translate('添加图标'),
      })
    }
  }

  const handlePickCustomIcon = async () => {
    try {
      const selected = await openDialog({
        multiple: false,
        directory: false,
        title: translate('选择自定义图标'),
        filters: [
          {
            name: translate('图标文件'),
            extensions: ['ico', 'png', 'jpg', 'jpeg', 'bmp', 'webp', 'exe', 'dll'],
          },
        ],
      })
      if (typeof selected !== 'string') return

      previewRequestRef.current += 1
      setCustomIconPath(selected)
      setPreview('')
      setPreviewLoading(true)
    } catch (error) {
      toast.error(translate('选择自定义图标失败：{error}', { error: String(error) }), {
        key: 'add-icon-dialog-custom-icon',
        title: translate('添加图标'),
      })
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const displayName = name.trim()
    const normalizedTargetPath = targetPath.trim()
    if (!displayName || !normalizedTargetPath || submitting) return

    setSubmitting(true)
    try {
      const legacyCustomAppDir = (await getSetting('customAppDir')).trim()
      const result = await invoke<ImportIconsResult>('create_icon_entry', {
        input: {
          displayName,
          targetPath: normalizedTargetPath,
          launchArguments: launchArguments.trim(),
          workingDirectory: workingDirectory.trim(),
          customIconPath: customIconPath.trim(),
        },
        customAppDir: legacyCustomAppDir || null,
      })

      if (result.duplicate_count > 0) {
        toast.info(translate('图标库中已经存在相同目标。'), {
          key: 'add-icon-dialog-submit',
          title: translate('添加图标'),
        })
        return
      }

      await onCreated?.({ displayName, targetPath: normalizedTargetPath })
      toast.success(translate('“{name}”已添加到图标库。', { name: displayName }), {
        key: 'add-icon-dialog-submit',
        title: translate('添加图标'),
      })
      onOpenChange(false)
    } catch (error) {
      toast.error(translate('图标导入失败：{error}', { error: String(error) }), {
        key: 'add-icon-dialog-submit',
        title: translate('添加图标'),
      })
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/25 p-3 backdrop-blur-[2px] dark:bg-black/55 sm:p-5"
      onMouseDown={event => {
        if (event.target === event.currentTarget) closeDialog()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="flex max-h-[calc(100vh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl sm:max-h-[calc(100vh-2.5rem)]"
        onKeyDown={handleDialogKeyDown}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border/80 px-4 py-3.5 sm:px-5">
          <div className="min-w-0 space-y-1">
            <h2 id={titleId} className="text-base font-semibold text-foreground">
              {translate('添加图标')}
            </h2>
            <p id={descriptionId} className="text-xs leading-5 text-muted-foreground">
              {translate('填写名称和目标路径；需要时可继续配置启动参数、工作目录和自定义图标。')}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={translate('关闭')}
            onClick={closeDialog}
            disabled={submitting}
            className="shrink-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,14rem),1fr))]">
              <label className="min-w-0 space-y-1.5">
                <span className="text-xs font-medium text-foreground">{translate('名称')}</span>
                <Input
                  ref={nameInputRef}
                  value={name}
                  onChange={event => setName(event.target.value)}
                  placeholder={translate('例如：Visual Studio Code')}
                  disabled={submitting}
                />
              </label>

              <div className="min-w-0 space-y-1.5">
                <span className="text-xs font-medium text-foreground">{translate('图标预览')}</span>
                <div className="flex min-h-10 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/80 bg-muted/25">
                    {previewLoading ? (
                      <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : preview ? (
                      <img
                        src={preview}
                        alt={name || translate('图标预览')}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <Images className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <p className="min-w-0 text-xs leading-5 text-muted-foreground">
                    {customIconPath.trim()
                      ? preview
                        ? translate('正在使用自定义图标。')
                        : translate('未能从自定义文件提取图标。')
                      : targetPath.trim()
                        ? preview
                          ? translate('已从目标提取图标。')
                          : translate('暂未提取到图标，将使用系统默认图标。')
                        : translate('填写或选择目标后显示预览。')}
                  </p>
                </div>
              </div>

              <label className="col-span-full min-w-0 space-y-1.5">
                <span className="text-xs font-medium text-foreground">{translate('目标路径')}</span>
                <div className="flex min-w-0 flex-wrap gap-2">
                  <Input
                    value={targetPath}
                    onChange={event => updateTargetPath(event.target.value, false)}
                    onBlur={() => {
                      if (!name.trim()) setName(deriveIconEntryName(targetPath))
                    }}
                    placeholder={translate('输入程序、快捷方式、文件或文件夹路径')}
                    disabled={submitting}
                    className="min-w-0 flex-[1_1_18rem]"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handlePickTarget(false)}
                    disabled={submitting}
                    className="min-w-0 flex-[1_1_8rem] sm:flex-none"
                  >
                    <FileSearch className="h-4 w-4" />
                    {translate('选择文件')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handlePickTarget(true)}
                    disabled={submitting}
                    className="min-w-0 flex-[1_1_8rem] sm:flex-none"
                  >
                    <FolderOpen className="h-4 w-4" />
                    {translate('选择文件夹')}
                  </Button>
                </div>
              </label>

              <div className="col-span-full border-t border-border/70 pt-3">
                <button
                  type="button"
                  aria-expanded={advancedOpen}
                  onClick={() => setAdvancedOpen(current => !current)}
                  disabled={submitting}
                  className="flex w-full min-w-0 items-center justify-between gap-3 rounded-md px-1 py-1.5 text-left disabled:opacity-50"
                >
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-foreground">
                      {translate('高级启动选项')}
                    </span>
                    <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                      {translate('启动参数、工作目录和自定义图标均为可选项。')}
                    </span>
                  </span>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
                      advancedOpen && 'rotate-180'
                    )}
                  />
                </button>

                {advancedOpen ? (
                  <div className="grid gap-4 pt-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,16rem),1fr))]">
                    <label className="col-span-full min-w-0 space-y-1.5">
                      <span className="text-xs font-medium text-foreground">
                        {translate('启动参数')}
                      </span>
                      <Input
                        value={launchArguments}
                        onChange={event => setLaunchArguments(event.target.value)}
                        placeholder={translate('例如：--profile work --new-window')}
                        disabled={submitting}
                      />
                      <span className="block text-xs leading-5 text-muted-foreground">
                        {translate('参数会原样写入快捷方式，不会修改目标路径。')}
                      </span>
                    </label>

                    <label className="min-w-0 space-y-1.5">
                      <span className="text-xs font-medium text-foreground">
                        {translate('工作目录')}
                      </span>
                      <div className="flex min-w-0 flex-wrap gap-2">
                        <Input
                          value={workingDirectory}
                          onChange={event => setWorkingDirectory(event.target.value)}
                          placeholder={translate('留空则使用目标文件所在目录')}
                          disabled={submitting}
                          className="min-w-0 flex-[1_1_14rem]"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void handlePickWorkingDirectory()}
                          disabled={submitting}
                          className="min-w-0 flex-[1_1_8rem] sm:flex-none"
                        >
                          <FolderOpen className="h-4 w-4" />
                          {translate('选择目录')}
                        </Button>
                      </div>
                    </label>

                    <label className="min-w-0 space-y-1.5">
                      <span className="text-xs font-medium text-foreground">
                        {translate('自定义图标')}
                      </span>
                      <div className="flex min-w-0 flex-wrap gap-2">
                        <Input
                          value={customIconPath}
                          onChange={event => {
                            previewRequestRef.current += 1
                            const nextPath = event.target.value
                            setCustomIconPath(nextPath)
                            setPreview('')
                            setPreviewLoading(Boolean(nextPath.trim()))
                          }}
                          placeholder={translate('选择 ICO、PNG 或程序文件')}
                          disabled={submitting}
                          className="min-w-0 flex-[1_1_14rem]"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void handlePickCustomIcon()}
                          disabled={submitting}
                          className="min-w-0 flex-[1_1_8rem] sm:flex-none"
                        >
                          <ImagePlus className="h-4 w-4" />
                          {translate('选择图标')}
                        </Button>
                        {customIconPath ? (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              previewRequestRef.current += 1
                              setCustomIconPath('')
                              setPreview('')
                              setPreviewLoading(Boolean(targetPath.trim()))
                            }}
                            disabled={submitting}
                            className="min-w-0 flex-[1_1_6rem] sm:flex-none"
                          >
                            {translate('清除')}
                          </Button>
                        ) : null}
                      </div>
                    </label>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border/80 bg-muted/20 px-4 py-3 sm:px-5">
            <Button
              type="button"
              variant="outline"
              onClick={closeDialog}
              disabled={submitting}
              className="min-w-0 flex-1 sm:flex-none"
            >
              {translate('取消')}
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || !targetPath.trim() || submitting}
              className="min-w-0 flex-1 sm:flex-none"
            >
              {submitting ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {submitting ? translate('正在添加...') : translate('添加到图标库')}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}
