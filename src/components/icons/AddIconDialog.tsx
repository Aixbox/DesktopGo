import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { invoke } from '@tauri-apps/api/core'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import {
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  FileSearch,
  FolderOpen,
  Globe2,
  Link2,
  Monitor,
  RefreshCw,
  X,
} from 'lucide-react'
import { deriveIconEntryName } from '@/lib/iconManager'
import { ICON_CROP_OUTPUT_SIZE, type CropCornerRadii } from '@/lib/imageCrop'
import { deriveWebsiteName, normalizeWebsiteUrl } from '@/lib/websiteIcon'
import {
  createColoredIconDataUri,
  createTextIconDataUri,
  normalizeTextIconText,
  pickRandomIconColor,
  type IconColorId,
} from '@/lib/textIcon'
import { translate, useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { IconCropDialog, type IconCropResult } from './IconCropDialog'
import {
  AddIconAppearanceFields,
  AddIconFormRow,
  AddIconFormActions,
  AddIconMetadataFields,
  type IconCropEditorTarget,
} from './AddIconFormSections'
import {
  createAddIconDialogInitialState,
  DEFAULT_TEXT_ICON_COLOR,
  DEFAULT_TEXT_ICON_TEXT,
  type AddIconDialogDraft,
  type AddIconKind,
  type IconSource,
} from './addIconDialogState'

export type { AddIconDialogDraft, AddIconKind } from './addIconDialogState'

type ImportIconsResult = {
  imported_count: number
  duplicate_count: number
  invalid_count: number
}
const ICON_EDITOR_SOURCE_SIZE = 256

type WebsiteIconResult = {
  url: string
  title: string
  icon_base64: string
  icons?: string[]
}

export type AddIconDialogCreatedEntry = {
  displayName: string
  targetPath: string
}

interface AddIconDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (entry: AddIconDialogCreatedEntry) => void | Promise<void>
  initialDraft?: AddIconDialogDraft | null
  onSubmitDraft?: (draft: AddIconDialogDraft) => void | Promise<void>
}

export function AddIconDialog(props: AddIconDialogProps) {
  if (!props.open) return null
  return <AddIconDialogSession {...props} />
}

function AddIconDialogSession({
  onOpenChange,
  onCreated,
  initialDraft = null,
  onSubmitDraft,
}: AddIconDialogProps) {
  useI18n()
  const initialState = createAddIconDialogInitialState(initialDraft)

  const titleId = useId()
  const descriptionId = useId()
  const targetInputId = useId()
  const nameInputId = useId()
  const iconTextInputId = useId()
  const targetInputRef = useRef<HTMLInputElement | null>(null)
  const targetPickerRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const targetPreviewRequestRef = useRef(0)
  const customPreviewRequestRef = useRef(0)
  const [name, setName] = useState(initialState.name)
  const [targetPath, setTargetPath] = useState(initialState.targetPath)
  const websitePreviewRequestRef = useRef(0)
  const [entryKind, setEntryKind] = useState<AddIconKind>(initialState.entryKind)
  const [targetPickerOpen, setTargetPickerOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [launchArguments, setLaunchArguments] = useState(initialState.launchArguments)
  const [workingDirectory, setWorkingDirectory] = useState(initialState.workingDirectory)
  const [customIconPath, setCustomIconPath] = useState(initialState.customIconPath)
  const [selectedIconSource, setSelectedIconSource] = useState<IconSource>(
    initialState.selectedIconSource
  )
  const [iconColor, setIconColor] = useState<IconColorId>(initialState.iconColor)
  const [iconText, setIconText] = useState(initialState.iconText)
  const [editedTextIconPreview, setEditedTextIconPreview] = useState(
    initialState.editedTextIconPreview
  )
  const [targetPreview, setTargetPreview] = useState(initialState.targetPreview)
  const [targetPreviewLoading, setTargetPreviewLoading] = useState(
    initialState.targetPreviewLoading
  )
  const [customPreview, setCustomPreview] = useState(initialState.customPreview)
  const [customPreviewLoading, setCustomPreviewLoading] = useState(
    initialState.customPreviewLoading
  )
  const [customPreviewRevision, setCustomPreviewRevision] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const toast = useToast()
  const [websitePreview, setWebsitePreview] = useState(initialState.websitePreview)
  const [websitePreviews, setWebsitePreviews] = useState<string[]>(initialState.websitePreviews)
  const [websitePreviewLoading, setWebsitePreviewLoading] = useState(false)
  const [websitePreviewError, setWebsitePreviewError] = useState('')
  const [websitePreviewResolved, setWebsitePreviewResolved] = useState(
    initialState.websitePreviewResolved
  )
  const [cropEditorTarget, setCropEditorTarget] = useState<IconCropEditorTarget | null>(null)
  const [editedRasterPreviews, setEditedRasterPreviews] = useState<string[]>([])
  const [editedRasterCornerRadii, setEditedRasterCornerRadii] = useState<
    Array<{ dataUri: string; cornerRadii: CropCornerRadii }>
  >([])
  const textIconPreview = useMemo(
    () => editedTextIconPreview || createTextIconDataUri(iconText, iconColor),
    [editedTextIconPreview, iconColor, iconText]
  )

  const closeDialog = () => {
    if (!submitting) onOpenChange(false)
  }

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusFrame = window.requestAnimationFrame(() => targetInputRef.current?.focus())

    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.body.style.overflow = previousOverflow
      window.requestAnimationFrame(() => previousFocusRef.current?.focus())
    }
  }, [])

  useEffect(() => {
    if (!targetPickerOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!targetPickerRef.current?.contains(event.target as Node)) setTargetPickerOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [targetPickerOpen])

  useEffect(() => {
    targetPreviewRequestRef.current += 1
    const requestId = targetPreviewRequestRef.current
    const previewPath = targetPath.trim()

    if (!previewPath && initialDraft?.targetPath.trim()) {
      return
    }

    const initialGeneratedPreview =
      initialDraft?.entryKind !== 'website' && initialDraft?.iconSource === 'target'
        ? (initialDraft.generatedIconBase64 ?? '')
        : ''
    if (
      entryKind === 'app' &&
      previewPath &&
      previewPath === initialDraft?.targetPath.trim() &&
      initialGeneratedPreview
    ) {
      return
    }

    if (entryKind !== 'app' || !previewPath) return

    const timer = window.setTimeout(() => {
      void invoke<string>('get_drag_preview_icon', {
        path: previewPath,
        iconSize: ICON_EDITOR_SOURCE_SIZE,
      })
        .then(nextPreview => {
          if (targetPreviewRequestRef.current === requestId) setTargetPreview(nextPreview)
        })
        .catch(() => {
          if (targetPreviewRequestRef.current === requestId) setTargetPreview('')
        })
        .finally(() => {
          if (targetPreviewRequestRef.current === requestId) setTargetPreviewLoading(false)
        })
    }, 280)

    return () => window.clearTimeout(timer)
  }, [entryKind, initialDraft, targetPath])

  useEffect(() => {
    customPreviewRequestRef.current += 1
    const requestId = customPreviewRequestRef.current
    const previewPath = customIconPath.trim()

    if (!previewPath && initialDraft?.customIconPath.trim()) {
      return
    }

    const initialGeneratedPreview =
      initialDraft?.iconSource === 'custom' ? (initialDraft.generatedIconBase64 ?? '') : ''
    if (
      previewPath &&
      previewPath === initialDraft?.customIconPath.trim() &&
      initialGeneratedPreview
    ) {
      return
    }

    if (!previewPath) return

    const timer = window.setTimeout(() => {
      void invoke<string>('get_custom_icon_source', {
        path: previewPath,
      })
        .then(nextPreview => {
          if (customPreviewRequestRef.current === requestId) setCustomPreview(nextPreview)
        })
        .catch(() => {
          if (customPreviewRequestRef.current === requestId) setCustomPreview('')
        })
        .finally(() => {
          if (customPreviewRequestRef.current === requestId) setCustomPreviewLoading(false)
        })
    }, 280)

    return () => window.clearTimeout(timer)
  }, [customIconPath, customPreviewRevision, initialDraft])

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      panelRef.current?.querySelector<HTMLFormElement>('form')?.requestSubmit()
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      if (targetPickerOpen) {
        setTargetPickerOpen(false)
        return
      }
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

  const updateTargetPath = (nextPath: string) => {
    setTargetPath(nextPath)
    setCropEditorTarget(null)
    setEditedRasterPreviews([])
    if (entryKind === 'website') {
      websitePreviewRequestRef.current += 1
      setWebsitePreview('')
      setWebsitePreviews([])
      setWebsitePreviewLoading(false)
      setWebsitePreviewError('')
      setWebsitePreviewResolved(false)
      setSelectedIconSource('target')
      setIconColor('none')
      return
    }

    targetPreviewRequestRef.current += 1
    setTargetPreview('')
    setTargetPreviewLoading(Boolean(nextPath.trim()))
  }

  const handleEntryKindChange = (nextKind: AddIconKind) => {
    if (nextKind === entryKind || submitting) return
    targetPreviewRequestRef.current += 1
    customPreviewRequestRef.current += 1
    websitePreviewRequestRef.current += 1
    setEntryKind(nextKind)
    setName('')
    setTargetPath('')
    setTargetPickerOpen(false)
    setAdvancedOpen(false)
    setLaunchArguments('')
    setWorkingDirectory('')
    setCustomIconPath('')
    setSelectedIconSource('text')
    setIconColor(DEFAULT_TEXT_ICON_COLOR)
    setIconText(DEFAULT_TEXT_ICON_TEXT)
    setEditedTextIconPreview('')
    setTargetPreview('')
    setTargetPreviewLoading(false)
    setCustomPreview('')
    setCustomPreviewLoading(false)
    setWebsitePreview('')
    setWebsitePreviews([])
    setWebsitePreviewLoading(false)
    setWebsitePreviewError('')
    setWebsitePreviewResolved(false)
    window.requestAnimationFrame(() => targetInputRef.current?.focus())
  }

  const handleIconSourceChange = (source: IconSource) => {
    if (source === selectedIconSource) return
    setSelectedIconSource(source)
    if (source !== 'text') return

    const normalizedTarget =
      entryKind === 'website' ? normalizeWebsiteUrl(targetPath) : targetPath.trim()
    const fallbackText =
      name.trim() ||
      (entryKind === 'website'
        ? deriveWebsiteName(normalizedTarget)
        : deriveIconEntryName(normalizedTarget))
    setIconText(current => current || normalizeTextIconText(fallbackText))
    setIconColor(current => (current === 'none' ? pickRandomIconColor() : current))
  }

  const handleIconColorChange = (nextColor: IconColorId) => {
    setEditedTextIconPreview('')
    setIconColor(nextColor)
  }

  const handleIconTextChange = (nextText: string) => {
    if (selectedIconSource !== 'text') handleIconSourceChange('text')
    setEditedTextIconPreview('')
    setIconText(normalizeTextIconText(nextText))
  }

  const handleExtractWebsiteIcon = async () => {
    const normalizedUrl = normalizeWebsiteUrl(targetPath)
    if (!normalizedUrl || websitePreviewLoading) return

    const requestId = ++websitePreviewRequestRef.current
    setTargetPath(normalizedUrl)
    setWebsitePreview('')
    setWebsitePreviews([])
    setWebsitePreviewLoading(true)
    setWebsitePreviewError('')
    setWebsitePreviewResolved(false)
    setSelectedIconSource('target')
    try {
      const result = await invoke<WebsiteIconResult>('extract_website_icon', {
        url: normalizedUrl,
      })
      if (websitePreviewRequestRef.current !== requestId) return

      const extractedPreviews = Array.from(
        new Set([...(result.icons ?? []), result.icon_base64].filter(Boolean))
      ).slice(0, 6)
      setTargetPath(result.url)
      setWebsitePreviews(extractedPreviews)
      setWebsitePreview(extractedPreviews[0] ?? '')
      setWebsitePreviewResolved(true)
      if (!name.trim()) setName(result.title.trim() || deriveWebsiteName(result.url))
    } catch (error) {
      if (websitePreviewRequestRef.current !== requestId) return
      setWebsitePreviewError(String(error))
    } finally {
      if (websitePreviewRequestRef.current === requestId) setWebsitePreviewLoading(false)
    }
  }

  const handleWebsiteUrlBlur = () => {
    if (!websitePreviewResolved) void handleExtractWebsiteIcon()
  }

  const handlePickTarget = async (directory: boolean) => {
    try {
      const selected = await openDialog({
        multiple: false,
        directory,
        title: directory ? translate('选择文件夹') : translate('选择文件'),
      })
      if (typeof selected === 'string') updateTargetPath(selected)
      setTargetPickerOpen(false)
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

      customPreviewRequestRef.current += 1
      setCustomIconPath(selected)
      setCustomPreview('')
      setCustomPreviewLoading(true)
      setCustomPreviewRevision(current => current + 1)
      setSelectedIconSource('custom')
      setCropEditorTarget(null)
      setEditedRasterPreviews([])
    } catch (error) {
      toast.error(translate('选择自定义图标失败：{error}', { error: String(error) }), {
        key: 'add-icon-dialog-custom-icon',
        title: translate('添加图标'),
      })
    }
  }

  const openCropEditor = (target: IconCropEditorTarget) => {
    if (!target.source || submitting) return
    setCropEditorTarget(target)
  }

  const handleCropApply = ({ dataUri, colorId, cornerRadii }: IconCropResult) => {
    if (!cropEditorTarget) return

    if (cropEditorTarget.kind === 'website') {
      setWebsitePreviews(current =>
        current.map((preview, index) => (index === cropEditorTarget.index ? dataUri : preview))
      )
      setWebsitePreview(dataUri)
      setSelectedIconSource('target')
    } else if (cropEditorTarget.kind === 'custom') {
      setCustomPreview(dataUri)
      setSelectedIconSource('custom')
    } else if (cropEditorTarget.kind === 'text') {
      setEditedTextIconPreview(dataUri)
      setSelectedIconSource('text')
    } else {
      setTargetPreview(dataUri)
      setSelectedIconSource('target')
    }

    setIconColor(colorId)
    setEditedRasterPreviews(current =>
      current.includes(dataUri) ? current : [...current, dataUri]
    )
    setEditedRasterCornerRadii(current => [
      ...current.filter(entry => entry.dataUri !== dataUri),
      { dataUri, cornerRadii },
    ])
    setCropEditorTarget(null)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedTargetPath =
      entryKind === 'website' ? normalizeWebsiteUrl(targetPath) : targetPath.trim()
    const displayName =
      name.trim() ||
      (entryKind === 'website'
        ? deriveWebsiteName(normalizedTargetPath)
        : deriveIconEntryName(normalizedTargetPath))
    if (
      !displayName ||
      !normalizedTargetPath ||
      (selectedIconSource === 'custom' && (!customPreview || customPreviewLoading)) ||
      (selectedIconSource === 'text' && !textIconPreview) ||
      (selectedIconSource !== 'text' &&
        iconColor !== 'none' &&
        !(selectedIconSource === 'custom'
          ? customPreview
          : entryKind === 'website'
            ? websitePreview
            : targetPreview)) ||
      submitting
    )
      return

    setSubmitting(true)
    try {
      const selectedPreview =
        selectedIconSource === 'text'
          ? textIconPreview
          : selectedIconSource === 'custom'
            ? customPreview
            : entryKind === 'website'
              ? websitePreview
              : targetPreview
      const selectedCornerRadii = editedRasterCornerRadii.find(
        entry => entry.dataUri === selectedPreview
      )?.cornerRadii
      const initialTargetPath = initialDraft
        ? initialDraft.entryKind === 'website'
          ? normalizeWebsiteUrl(initialDraft.targetPath)
          : initialDraft.targetPath.trim()
        : ''
      const canReuseGeneratedIcon = Boolean(
        initialDraft?.generatedIconBase64 &&
        !editedRasterPreviews.includes(selectedPreview) &&
        selectedIconSource === initialDraft.iconSource &&
        iconColor === initialDraft.iconColor &&
        normalizedTargetPath === initialTargetPath &&
        (selectedIconSource !== 'custom' ||
          customIconPath.trim() === initialDraft.customIconPath.trim()) &&
        (selectedIconSource !== 'text' ||
          normalizeTextIconText(iconText) === normalizeTextIconText(initialDraft.iconText ?? ''))
      )
      const generatedIconBase64 = canReuseGeneratedIcon
        ? (initialDraft?.generatedIconBase64 ?? '')
        : selectedIconSource === 'text'
          ? textIconPreview
          : iconColor !== 'none'
            ? await createColoredIconDataUri(
                selectedPreview,
                iconColor,
                ICON_CROP_OUTPUT_SIZE,
                selectedCornerRadii
              )
            : editedRasterPreviews.includes(selectedPreview) &&
                !(entryKind === 'website' && selectedIconSource === 'target')
              ? selectedPreview
              : ''
      const draft: AddIconDialogDraft = {
        entryKind,
        displayName,
        targetPath: normalizedTargetPath,
        launchArguments: entryKind === 'app' ? launchArguments.trim() : '',
        workingDirectory: entryKind === 'app' ? workingDirectory.trim() : '',
        customIconPath: selectedIconSource === 'custom' ? customIconPath.trim() : '',
        websiteIconBase64:
          entryKind === 'website' && selectedIconSource === 'target' && iconColor === 'none'
            ? websitePreview
            : '',
        generatedIconBase64,
        iconSource: selectedIconSource,
        iconColor,
        iconText: selectedIconSource === 'text' ? normalizeTextIconText(iconText) : '',
      }
      if (onSubmitDraft) {
        await onSubmitDraft(draft)
        onOpenChange(false)
        return
      }

      const result = await invoke<ImportIconsResult>('create_icon_entry', {
        input: {
          ...draft,
        },
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
      toast.error(
        translate(onSubmitDraft ? '保存图标失败：{error}' : '图标导入失败：{error}', {
          error: String(error),
        }),
        {
          key: 'add-icon-dialog-submit',
          title: translate(onSubmitDraft ? '编辑图标信息' : '添加图标'),
        }
      )
    } finally {
      setSubmitting(false)
    }
  }

  const normalizedTargetPath =
    entryKind === 'website' ? normalizeWebsiteUrl(targetPath) : targetPath.trim()
  const effectiveName =
    name.trim() ||
    (entryKind === 'website'
      ? deriveWebsiteName(normalizedTargetPath)
      : deriveIconEntryName(normalizedTargetPath))
  const hasTargetPreviewFailure = Boolean(
    entryKind === 'app' && normalizedTargetPath && !targetPreviewLoading && !targetPreview
  )
  const selectedCustomIconInvalid =
    selectedIconSource === 'custom' && (!customPreview || customPreviewLoading)
  const automaticPreview = entryKind === 'website' ? websitePreview : targetPreview
  const automaticPreviewLoading =
    entryKind === 'website' ? websitePreviewLoading : targetPreviewLoading
  const automaticPreviewLabel =
    entryKind === 'website' ? translate('网页图标') : translate('自动提取')
  const selectedRasterPreview = selectedIconSource === 'custom' ? customPreview : automaticPreview
  const selectedTextIconInvalid = selectedIconSource === 'text' && !textIconPreview
  const selectedColoredIconInvalid =
    selectedIconSource !== 'text' && iconColor !== 'none' && !selectedRasterPreview

  const dialogPortal = createPortal(
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
        className="flex max-h-[calc(100vh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl sm:max-h-[calc(100vh-2.5rem)]"
        onKeyDown={handleDialogKeyDown}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border/80 px-4 py-3.5 sm:px-5">
          <div className="min-w-0 space-y-1">
            <h2 id={titleId} className="text-base font-semibold text-foreground">
              {translate(onSubmitDraft ? '编辑图标信息' : '添加图标')}
            </h2>
            <p id={descriptionId} className="text-xs leading-5 text-muted-foreground">
              {entryKind === 'website'
                ? translate('输入网页地址并提取站点图标。')
                : translate('选择目标后会自动生成名称和图标；需要时可继续配置高级启动选项。')}
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
            <div className="grid gap-y-3 sm:grid-cols-[max-content_minmax(0,1fr)] sm:gap-x-3">
              <AddIconFormRow label={translate('图标类型')}>
                <div
                  role="tablist"
                  aria-label={translate('图标类型')}
                  className="inline-flex h-9 rounded-lg bg-muted p-1"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={entryKind === 'app'}
                    onClick={() => handleEntryKindChange('app')}
                    disabled={submitting}
                    className={cn(
                      'inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
                      entryKind === 'app'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Monitor className="h-3.5 w-3.5" />
                    {translate('应用')}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={entryKind === 'website'}
                    onClick={() => handleEntryKindChange('website')}
                    disabled={submitting}
                    className={cn(
                      'inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
                      entryKind === 'website'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Globe2 className="h-3.5 w-3.5" />
                    {translate('网页')}
                  </button>
                </div>
              </AddIconFormRow>
              {entryKind === 'app' ? (
                <AddIconFormRow label={translate('选择目标')} labelFor={targetInputId}>
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex min-w-0 flex-wrap gap-2">
                      <Input
                        id={targetInputId}
                        ref={targetInputRef}
                        value={targetPath}
                        onChange={event => updateTargetPath(event.target.value)}
                        placeholder={translate('输入程序、快捷方式、文件或文件夹路径')}
                        disabled={submitting}
                        className="min-w-0 flex-[1_1_18rem]"
                      />
                      <div
                        ref={targetPickerRef}
                        className="relative min-w-0 flex-[1_1_8rem] sm:flex-none"
                      >
                        <Button
                          type="button"
                          variant="outline"
                          aria-haspopup="menu"
                          aria-expanded={targetPickerOpen}
                          onClick={() => setTargetPickerOpen(current => !current)}
                          disabled={submitting}
                          className="w-full sm:w-auto"
                        >
                          <FileSearch className="h-4 w-4" />
                          {translate('选择目标')}
                          <ChevronDown
                            className={cn(
                              'h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none',
                              targetPickerOpen && 'rotate-180'
                            )}
                          />
                        </Button>
                        {targetPickerOpen ? (
                          <div
                            role="menu"
                            className="absolute right-0 top-full z-20 mt-1.5 w-40 overflow-hidden rounded-lg border border-border bg-popover p-1 shadow-lg"
                          >
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => void handlePickTarget(false)}
                              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-popover-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:outline-none"
                            >
                              <FileSearch className="h-4 w-4 text-muted-foreground" />
                              {translate('选择文件')}
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => void handlePickTarget(true)}
                              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-popover-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:outline-none"
                            >
                              <FolderOpen className="h-4 w-4 text-muted-foreground" />
                              {translate('选择文件夹')}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <span
                      className={cn(
                        'flex items-center gap-1.5 text-xs leading-5',
                        hasTargetPreviewFailure
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-muted-foreground'
                      )}
                    >
                      {!normalizedTargetPath ? null : targetPreviewLoading ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin" />
                          {translate('正在读取目标并提取图标...')}
                        </>
                      ) : hasTargetPreviewFailure ? (
                        <>
                          <CircleAlert className="h-3.5 w-3.5 shrink-0" />
                          {translate('未能识别该路径或提取图标，仍可尝试添加。')}
                        </>
                      ) : targetPreview ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                          {translate('已识别目标并生成图标预览。')}
                        </>
                      ) : null}
                    </span>
                  </div>
                </AddIconFormRow>
              ) : (
                <AddIconFormRow label={translate('网页地址')} labelFor={targetInputId}>
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex min-w-0 flex-wrap gap-2">
                      <div className="relative min-w-0 flex-[1_1_18rem]">
                        <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id={targetInputId}
                          ref={targetInputRef}
                          type="url"
                          inputMode="url"
                          value={targetPath}
                          onChange={event => updateTargetPath(event.target.value)}
                          onBlur={handleWebsiteUrlBlur}
                          placeholder={translate('例如：https://www.example.com')}
                          disabled={submitting || websitePreviewLoading}
                          className="min-w-0 pl-9"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void handleExtractWebsiteIcon()}
                        disabled={!normalizedTargetPath || websitePreviewLoading || submitting}
                        className="min-w-0 flex-[1_1_8rem] whitespace-nowrap sm:flex-none"
                      >
                        {websitePreviewLoading ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <Globe2 className="h-4 w-4" />
                        )}
                        {websitePreviewLoading ? translate('正在提取...') : translate('提取图标')}
                      </Button>
                    </div>
                    <span
                      className={cn(
                        'flex items-center gap-1.5 text-xs leading-5',
                        websitePreviewError || (targetPath.trim() && !normalizedTargetPath)
                          ? 'text-destructive'
                          : websitePreviewResolved && !websitePreview
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-muted-foreground'
                      )}
                    >
                      {!targetPath.trim() ? null : !normalizedTargetPath ? (
                        <>
                          <CircleAlert className="h-3.5 w-3.5 shrink-0" />
                          {translate('请输入有效的 HTTP 或 HTTPS 网页地址。')}
                        </>
                      ) : websitePreviewLoading ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin" />
                          {translate('正在读取网页并提取站点图标...')}
                        </>
                      ) : websitePreviewError ? (
                        <>
                          <CircleAlert className="h-3.5 w-3.5 shrink-0" />
                          {translate('网页图标提取失败：{error}', { error: websitePreviewError })}
                        </>
                      ) : websitePreviewResolved && websitePreview ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                          {translate('已提取 {count} 个网页图标。', {
                            count: websitePreviews.length,
                          })}
                        </>
                      ) : websitePreviewResolved ? (
                        <>
                          <CircleAlert className="h-3.5 w-3.5 shrink-0" />
                          {translate('网页未提供可用图标，仍可继续添加。')}
                        </>
                      ) : null}
                    </span>
                  </div>
                </AddIconFormRow>
              )}

              <AddIconAppearanceFields
                iconTextInputId={iconTextInputId}
                entryKind={entryKind}
                websitePreviews={websitePreviews}
                websitePreview={websitePreview}
                selectedIconSource={selectedIconSource}
                automaticPreview={automaticPreview}
                automaticPreviewLoading={automaticPreviewLoading}
                automaticPreviewLabel={automaticPreviewLabel}
                iconColor={iconColor}
                iconText={iconText}
                textIconPreview={textIconPreview}
                customIconPath={customIconPath}
                customPreview={customPreview}
                customPreviewLoading={customPreviewLoading}
                disabled={submitting}
                onColorChange={handleIconColorChange}
                onTextChange={handleIconTextChange}
                onIconSourceChange={handleIconSourceChange}
                onOpenCropEditor={openCropEditor}
                onPickCustomIcon={() => void handlePickCustomIcon()}
              />

              <AddIconMetadataFields
                entryKind={entryKind}
                nameInputId={nameInputId}
                name={name}
                effectiveName={effectiveName}
                advancedOpen={advancedOpen}
                launchArguments={launchArguments}
                workingDirectory={workingDirectory}
                disabled={submitting}
                onNameChange={setName}
                onToggleAdvanced={() => setAdvancedOpen(current => !current)}
                onLaunchArgumentsChange={setLaunchArguments}
                onWorkingDirectoryChange={setWorkingDirectory}
                onPickWorkingDirectory={() => void handlePickWorkingDirectory()}
              />
            </div>
          </div>

          <AddIconFormActions
            submitting={submitting}
            editing={Boolean(onSubmitDraft)}
            submitDisabled={
              !effectiveName ||
              !normalizedTargetPath ||
              selectedCustomIconInvalid ||
              selectedTextIconInvalid ||
              selectedColoredIconInvalid
            }
            onCancel={closeDialog}
          />
        </form>
      </div>
    </div>,
    document.body
  )

  return (
    <>
      {dialogPortal}
      <IconCropDialog
        open={Boolean(cropEditorTarget)}
        source={cropEditorTarget?.source ?? ''}
        initialColor={iconColor}
        onCancel={() => setCropEditorTarget(null)}
        onApply={handleCropApply}
      />
    </>
  )
}
