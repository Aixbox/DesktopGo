import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { invoke } from '@tauri-apps/api/core'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import {
  Ban,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  FileSearch,
  FolderOpen,
  Globe2,
  ImagePlus,
  Images,
  Link2,
  Monitor,
  Pencil,
  RefreshCw,
  Type,
  Upload,
  X,
} from 'lucide-react'
import { deriveIconEntryName } from '@/lib/iconManager'
import { ICON_CROP_OUTPUT_SIZE, type CropCornerRadii } from '@/lib/imageCrop'
import { deriveWebsiteName, isWebsiteTarget, normalizeWebsiteUrl } from '@/lib/websiteIcon'
import {
  createColoredIconDataUri,
  createTextIconDataUri,
  ICON_COLOR_PRESETS,
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

type ImportIconsResult = {
  imported_count: number
  duplicate_count: number
  invalid_count: number
}
export type AddIconKind = 'app' | 'website'
type IconSource = 'target' | 'custom' | 'text'

const ICON_COLOR_LABELS: Record<IconColorId, string> = {
  none: '无色',
  ocean: '海蓝',
  cyan: '湖青',
  emerald: '翠绿',
  lime: '青柠',
  amber: '琥珀',
  coral: '珊瑚',
  pink: '莓红',
  plum: '梅紫',
  graphite: '石墨',
}

const DEFAULT_TEXT_ICON_TEXT = 'D'
const DEFAULT_TEXT_ICON_COLOR: IconColorId = 'ocean'
const ICON_EDITOR_SOURCE_SIZE = 256
const ICON_PICKER_FOCUS_RING_CLASS_NAME =
  'focus-visible:border-blue-500/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45'

type WebsiteIconResult = {
  url: string
  title: string
  icon_base64: string
  icons?: string[]
}

type CropEditorTarget =
  | { kind: 'target'; source: string }
  | { kind: 'custom'; source: string }
  | { kind: 'text'; source: string }
  | { kind: 'website'; source: string; index: number }

export type AddIconDialogCreatedEntry = {
  displayName: string
  targetPath: string
}

export type AddIconDialogDraft = {
  entryKind?: AddIconKind
  displayName: string
  targetPath: string
  launchArguments: string
  workingDirectory: string
  customIconPath: string
  websiteIconBase64?: string
  generatedIconBase64?: string
  iconSource?: IconSource
  iconColor?: IconColorId
  iconText?: string
}

interface AddIconDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (entry: AddIconDialogCreatedEntry) => void | Promise<void>
  initialDraft?: AddIconDialogDraft | null
  onSubmitDraft?: (draft: AddIconDialogDraft) => void | Promise<void>
}

function FormRow({
  label,
  labelFor,
  children,
}: {
  label: string
  labelFor?: string
  children: ReactNode
}) {
  const labelClassName = 'block text-xs font-medium leading-5 text-foreground'

  return (
    <div className="grid min-w-0 gap-2 sm:contents">
      <div
        className={cn('min-w-0 sm:pt-2', !label && 'hidden sm:block')}
        aria-hidden={label ? undefined : true}
      >
        {labelFor ? (
          <label htmlFor={labelFor} className={labelClassName}>
            {label}
          </label>
        ) : (
          <span className={labelClassName}>{label}</span>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function AddIconDialog({
  open,
  onOpenChange,
  onCreated,
  initialDraft = null,
  onSubmitDraft,
}: AddIconDialogProps) {
  useI18n()

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
  const [name, setName] = useState('')
  const [targetPath, setTargetPath] = useState('')
  const websitePreviewRequestRef = useRef(0)
  const [entryKind, setEntryKind] = useState<AddIconKind>('app')
  const [targetPickerOpen, setTargetPickerOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [launchArguments, setLaunchArguments] = useState('')
  const [workingDirectory, setWorkingDirectory] = useState('')
  const [customIconPath, setCustomIconPath] = useState('')
  const [selectedIconSource, setSelectedIconSource] = useState<IconSource>('text')
  const [iconColor, setIconColor] = useState<IconColorId>(DEFAULT_TEXT_ICON_COLOR)
  const [iconText, setIconText] = useState(DEFAULT_TEXT_ICON_TEXT)
  const [editedTextIconPreview, setEditedTextIconPreview] = useState('')
  const [targetPreview, setTargetPreview] = useState('')
  const [targetPreviewLoading, setTargetPreviewLoading] = useState(false)
  const [customPreview, setCustomPreview] = useState('')
  const [customPreviewLoading, setCustomPreviewLoading] = useState(false)
  const [customPreviewRevision, setCustomPreviewRevision] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const toast = useToast()
  const [websitePreview, setWebsitePreview] = useState('')
  const [websitePreviews, setWebsitePreviews] = useState<string[]>([])
  const [websitePreviewLoading, setWebsitePreviewLoading] = useState(false)
  const [websitePreviewError, setWebsitePreviewError] = useState('')
  const [websitePreviewResolved, setWebsitePreviewResolved] = useState(false)
  const [cropEditorTarget, setCropEditorTarget] = useState<CropEditorTarget | null>(null)
  const [editedRasterPreviews, setEditedRasterPreviews] = useState<string[]>([])
  const [editedRasterCornerRadii, setEditedRasterCornerRadii] = useState<
    Array<{ dataUri: string; cornerRadii: CropCornerRadii }>
  >([])
  const textIconPreview = useMemo(
    () => editedTextIconPreview || createTextIconDataUri(iconText, iconColor),
    [editedTextIconPreview, iconColor, iconText]
  )

  const resetForm = () => {
    targetPreviewRequestRef.current += 1
    customPreviewRequestRef.current += 1
    websitePreviewRequestRef.current += 1
    setEntryKind('app')
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
    setCropEditorTarget(null)
    setEditedRasterPreviews([])
    setEditedRasterCornerRadii([])
  }

  const closeDialog = () => {
    if (!submitting) onOpenChange(false)
  }

  useEffect(() => {
    if (!open) return

    previousFocusRef.current = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusFrame = window.requestAnimationFrame(() => targetInputRef.current?.focus())

    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.body.style.overflow = previousOverflow
      window.requestAnimationFrame(() => previousFocusRef.current?.focus())
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      resetForm()
      return
    }
    if (!initialDraft) return

    targetPreviewRequestRef.current += 1
    customPreviewRequestRef.current += 1
    setName(initialDraft.displayName)
    setTargetPath(initialDraft.targetPath)
    websitePreviewRequestRef.current += 1
    const nextEntryKind: AddIconKind =
      initialDraft.entryKind ?? (isWebsiteTarget(initialDraft.targetPath) ? 'website' : 'app')
    setEntryKind(nextEntryKind)
    setLaunchArguments(initialDraft.launchArguments)
    setWorkingDirectory(initialDraft.workingDirectory)
    setCustomIconPath(initialDraft.customIconPath)
    setSelectedIconSource(
      initialDraft.iconSource ??
        (initialDraft.generatedIconBase64
          ? 'text'
          : initialDraft.customIconPath
            ? 'custom'
            : 'target')
    )
    setIconColor(initialDraft.iconColor ?? 'none')
    setIconText(initialDraft.iconText ?? '')
    setEditedTextIconPreview(
      initialDraft.iconSource === 'text' ? (initialDraft.generatedIconBase64 ?? '') : ''
    )
    const initialGeneratedPreview = initialDraft.generatedIconBase64 ?? ''
    const initialTargetPreview =
      nextEntryKind === 'app' && initialDraft.iconSource === 'target' ? initialGeneratedPreview : ''
    const initialCustomPreview = initialDraft.iconSource === 'custom' ? initialGeneratedPreview : ''
    setTargetPreview(initialTargetPreview)
    setTargetPreviewLoading(
      nextEntryKind === 'app' && Boolean(initialDraft.targetPath.trim()) && !initialTargetPreview
    )
    setCustomPreview(initialCustomPreview)
    setCustomPreviewLoading(Boolean(initialDraft.customIconPath.trim()) && !initialCustomPreview)
    const initialWebsitePreview = initialDraft.websiteIconBase64 ?? ''
    setWebsitePreview(initialWebsitePreview)
    setWebsitePreviews(initialWebsitePreview ? [initialWebsitePreview] : [])
    setWebsitePreviewLoading(false)
    setWebsitePreviewError('')
    setWebsitePreviewResolved(Boolean(initialDraft.websiteIconBase64))
    setCropEditorTarget(null)
    setEditedRasterPreviews([])
    setEditedRasterCornerRadii([])
  }, [initialDraft, open])

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

    if (open && !previewPath && initialDraft?.targetPath.trim()) {
      return
    }

    const initialGeneratedPreview =
      initialDraft?.entryKind !== 'website' && initialDraft?.iconSource === 'target'
        ? (initialDraft.generatedIconBase64 ?? '')
        : ''
    if (
      open &&
      entryKind === 'app' &&
      previewPath &&
      previewPath === initialDraft?.targetPath.trim() &&
      initialGeneratedPreview
    ) {
      return
    }

    if (!open || entryKind !== 'app' || !previewPath) {
      setTargetPreview('')
      setTargetPreviewLoading(false)
      return
    }

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
  }, [entryKind, initialDraft, open, targetPath])

  useEffect(() => {
    customPreviewRequestRef.current += 1
    const requestId = customPreviewRequestRef.current
    const previewPath = customIconPath.trim()

    if (open && !previewPath && initialDraft?.customIconPath.trim()) {
      return
    }

    const initialGeneratedPreview =
      initialDraft?.iconSource === 'custom' ? (initialDraft.generatedIconBase64 ?? '') : ''
    if (
      open &&
      previewPath &&
      previewPath === initialDraft?.customIconPath.trim() &&
      initialGeneratedPreview
    ) {
      return
    }

    if (!open || !previewPath) {
      setCustomPreview('')
      setCustomPreviewLoading(false)
      return
    }

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
  }, [customIconPath, customPreviewRevision, initialDraft, open])

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

  const openCropEditor = (target: CropEditorTarget) => {
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

  if (!open) return null

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
  const selectedColorPreset = ICON_COLOR_PRESETS.find(preset => preset.id === iconColor)
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
              <FormRow label={translate('图标类型')}>
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
              </FormRow>
              {entryKind === 'app' ? (
                <FormRow label={translate('选择目标')} labelFor={targetInputId}>
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
                </FormRow>
              ) : (
                <FormRow label={translate('网页地址')} labelFor={targetInputId}>
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
                </FormRow>
              )}

              <FormRow label={translate('图标颜色')}>
                <div
                  role="radiogroup"
                  aria-label={translate('图标颜色')}
                  className="flex min-h-9 flex-wrap items-center gap-1.5"
                >
                  {ICON_COLOR_PRESETS.map(preset => {
                    const colorLabel = translate(ICON_COLOR_LABELS[preset.id])
                    const selected = iconColor === preset.id
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={colorLabel}
                        title={colorLabel}
                        onClick={() => {
                          setEditedTextIconPreview('')
                          setIconColor(preset.id)
                        }}
                        disabled={submitting}
                        className={cn(
                          'relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-[border-color,box-shadow,transform] duration-200 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-35 motion-reduce:transform-none motion-reduce:transition-none',
                          selected
                            ? 'border-foreground ring-2 ring-foreground/15'
                            : 'border-border hover:border-foreground/40',
                          preset.id === 'none' && 'bg-background text-muted-foreground'
                        )}
                        style={preset.id === 'none' ? undefined : { backgroundColor: preset.color }}
                      >
                        {preset.id === 'none' ? <Ban className="h-3.5 w-3.5" /> : null}
                        {selected && preset.id !== 'none' ? (
                          <Check className="absolute h-3.5 w-3.5 text-white" />
                        ) : null}
                      </button>
                    )
                  })}
                  <span className="ml-1 text-xs text-muted-foreground">
                    {translate(ICON_COLOR_LABELS[iconColor])}
                  </span>
                </div>
              </FormRow>

              <FormRow label={translate('图标文字')} labelFor={iconTextInputId}>
                <div className="min-w-0 space-y-1.5">
                  <Input
                    id={iconTextInputId}
                    value={iconText}
                    onChange={event => {
                      if (selectedIconSource !== 'text') handleIconSourceChange('text')
                      setEditedTextIconPreview('')
                      setIconText(normalizeTextIconText(event.target.value))
                    }}
                    placeholder={translate('输入最多六个字符')}
                    disabled={submitting}
                  />
                  <span className="block text-xs leading-5 text-muted-foreground">
                    {translate('最多使用六个字符生成图标，内容较长时会自动缩小并保持单行。')}
                  </span>
                </div>
              </FormRow>

              <FormRow label="">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-start gap-x-[20px] gap-y-3">
                    {entryKind === 'website' && websitePreviews.length > 0
                      ? websitePreviews.map((preview, index) => {
                          const selected =
                            selectedIconSource === 'target' && websitePreview === preview
                          const candidateLabel = `${automaticPreviewLabel} ${index + 1}`
                          return (
                            <div
                              key={`${index}-${preview.slice(-32)}`}
                              className="flex w-16 shrink-0 flex-col items-center gap-1.5"
                            >
                              <div className="group relative h-16 w-16">
                                <button
                                  type="button"
                                  aria-pressed={selected}
                                  aria-label={translate('编辑 {name}', { name: candidateLabel })}
                                  title={translate('裁剪图标')}
                                  onClick={() =>
                                    openCropEditor({ kind: 'website', source: preview, index })
                                  }
                                  disabled={submitting}
                                  className={cn(
                                    'relative flex h-full w-full items-center justify-center overflow-hidden rounded-xl border bg-background transition-[border-color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.25,1,0.5,1)] hover:-translate-y-0.5 disabled:opacity-50 motion-reduce:transform-none motion-reduce:transition-none',
                                    ICON_PICKER_FOCUS_RING_CLASS_NAME,
                                    selected
                                      ? 'border-blue-500/45 ring-2 ring-blue-500/45'
                                      : 'border-border hover:border-foreground/30'
                                  )}
                                  style={
                                    iconColor !== 'none'
                                      ? { backgroundColor: selectedColorPreset?.color }
                                      : undefined
                                  }
                                >
                                  <img
                                    src={preview}
                                    alt=""
                                    draggable={false}
                                    className="h-full w-full object-contain"
                                  />
                                  {selected ? (
                                    <CheckCircle2 className="absolute right-1 top-1 z-10 h-4 w-4 fill-primary text-primary-foreground" />
                                  ) : null}
                                  <span className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[inherit] bg-black/60 text-white opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100">
                                    <Pencil className="h-4 w-4" />
                                  </span>
                                </button>
                              </div>
                              <span className="whitespace-nowrap text-center text-[11px] leading-4 text-muted-foreground">
                                {candidateLabel}
                              </span>
                            </div>
                          )
                        })
                      : null}

                    {entryKind !== 'website' || websitePreviews.length === 0 ? (
                      <div className="flex w-16 shrink-0 flex-col items-center gap-1.5">
                        <div className="group relative h-16 w-16">
                          <button
                            type="button"
                            aria-pressed={selectedIconSource === 'target'}
                            aria-label={
                              automaticPreview
                                ? translate('编辑 {name}', { name: automaticPreviewLabel })
                                : automaticPreviewLabel
                            }
                            title={automaticPreview ? translate('裁剪图标') : undefined}
                            onClick={() => {
                              if (automaticPreview && !automaticPreviewLoading) {
                                openCropEditor({ kind: 'target', source: automaticPreview })
                                return
                              }
                              handleIconSourceChange('target')
                            }}
                            disabled={submitting}
                            className={cn(
                              'relative flex h-full w-full items-center justify-center overflow-hidden rounded-xl border bg-background transition-[border-color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.25,1,0.5,1)] hover:-translate-y-0.5 disabled:opacity-50 motion-reduce:transform-none motion-reduce:transition-none',
                              ICON_PICKER_FOCUS_RING_CLASS_NAME,
                              selectedIconSource === 'target'
                                ? 'border-blue-500/45 ring-2 ring-blue-500/45'
                                : 'border-border hover:border-foreground/30'
                            )}
                            style={
                              iconColor !== 'none'
                                ? { backgroundColor: selectedColorPreset?.color }
                                : undefined
                            }
                          >
                            {automaticPreviewLoading ? (
                              <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                            ) : automaticPreview ? (
                              <img
                                src={automaticPreview}
                                alt={automaticPreviewLabel}
                                className="h-full w-full object-contain"
                              />
                            ) : entryKind === 'website' ? (
                              <Globe2 className="h-5 w-5 text-muted-foreground" />
                            ) : (
                              <Images className="h-5 w-5 text-muted-foreground" />
                            )}
                            {selectedIconSource === 'target' ? (
                              <CheckCircle2 className="absolute right-1 top-1 h-4 w-4 fill-primary text-primary-foreground" />
                            ) : null}
                            {automaticPreview && !automaticPreviewLoading ? (
                              <span className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[inherit] bg-black/60 text-white opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100">
                                <Pencil className="h-4 w-4" />
                              </span>
                            ) : null}
                          </button>
                        </div>
                        <span className="whitespace-nowrap text-center text-[11px] leading-4 text-muted-foreground">
                          {automaticPreviewLabel}
                        </span>
                      </div>
                    ) : null}

                    <div className="flex w-16 shrink-0 flex-col items-center gap-1.5">
                      <div className="group relative h-16 w-16">
                        <button
                          type="button"
                          aria-pressed={selectedIconSource === 'text'}
                          aria-label={translate('编辑 {name}', { name: translate('文字图标') })}
                          title={translate('裁剪图标')}
                          onClick={() => {
                            if (textIconPreview) {
                              openCropEditor({ kind: 'text', source: textIconPreview })
                              return
                            }
                            handleIconSourceChange('text')
                          }}
                          disabled={submitting}
                          className={cn(
                            'relative flex h-full w-full items-center justify-center overflow-hidden rounded-xl border bg-background transition-[border-color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.25,1,0.5,1)] hover:-translate-y-0.5 disabled:opacity-50 motion-reduce:transform-none motion-reduce:transition-none',
                            ICON_PICKER_FOCUS_RING_CLASS_NAME,
                            selectedIconSource === 'text'
                              ? 'border-blue-500/45 ring-2 ring-blue-500/45'
                              : 'border-border hover:border-foreground/30'
                          )}
                        >
                          {textIconPreview ? (
                            <img
                              src={textIconPreview}
                              alt={translate('文字图标')}
                              className="h-full w-full object-contain"
                            />
                          ) : (
                            <Type className="h-5 w-5 text-muted-foreground" />
                          )}
                          {selectedIconSource === 'text' && textIconPreview ? (
                            <CheckCircle2 className="absolute right-1 top-1 h-4 w-4 fill-primary text-primary-foreground" />
                          ) : null}
                          {textIconPreview ? (
                            <span className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[inherit] bg-black/60 text-white opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100">
                              <Pencil className="h-4 w-4" />
                            </span>
                          ) : null}
                        </button>
                      </div>
                      <span className="whitespace-nowrap text-center text-[11px] leading-4 text-muted-foreground">
                        {translate('文字图标')}
                      </span>
                    </div>

                    <div className="flex w-16 shrink-0 flex-col items-center gap-1.5">
                      {customIconPath ? (
                        <div className="group relative h-16 w-16">
                          <button
                            type="button"
                            aria-pressed={selectedIconSource === 'custom'}
                            aria-label={translate('编辑 {name}', {
                              name: translate('自定义图标'),
                            })}
                            title={translate('裁剪图标')}
                            onClick={() => {
                              if (customPreview) {
                                openCropEditor({ kind: 'custom', source: customPreview })
                              }
                            }}
                            disabled={submitting || !customPreview}
                            className={cn(
                              'relative flex h-full w-full items-center justify-center overflow-hidden rounded-xl border bg-background transition-[border-color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.25,1,0.5,1)] hover:-translate-y-0.5 disabled:opacity-50 motion-reduce:transform-none motion-reduce:transition-none',
                              ICON_PICKER_FOCUS_RING_CLASS_NAME,
                              selectedIconSource === 'custom'
                                ? 'border-blue-500/45 ring-2 ring-blue-500/45'
                                : 'border-border hover:border-foreground/30'
                            )}
                            style={
                              iconColor !== 'none'
                                ? { backgroundColor: selectedColorPreset?.color }
                                : undefined
                            }
                          >
                            {customPreviewLoading ? (
                              <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                            ) : customPreview ? (
                              <img
                                src={customPreview}
                                alt={translate('自定义图标')}
                                className="h-full w-full object-contain"
                              />
                            ) : (
                              <CircleAlert className="h-5 w-5 text-amber-500" />
                            )}
                            {selectedIconSource === 'custom' && customPreview ? (
                              <CheckCircle2 className="absolute right-1 top-1 h-4 w-4 fill-primary text-primary-foreground" />
                            ) : null}
                            {customPreview && !customPreviewLoading ? (
                              <span className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[inherit] bg-black/60 text-white opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100">
                                <Pencil className="h-4 w-4" />
                              </span>
                            ) : null}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          aria-label={translate('添加自定义图标')}
                          onClick={() => void handlePickCustomIcon()}
                          disabled={submitting}
                          className={cn(
                            'flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-border bg-muted/15 text-muted-foreground transition-[border-color,color,background-color,transform] duration-200 ease-[cubic-bezier(0.25,1,0.5,1)] hover:-translate-y-0.5 hover:border-foreground/35 hover:bg-muted/35 hover:text-foreground disabled:opacity-50 motion-reduce:transform-none motion-reduce:transition-none',
                            ICON_PICKER_FOCUS_RING_CLASS_NAME
                          )}
                        >
                          <ImagePlus className="h-5 w-5" />
                        </button>
                      )}
                      <span className="whitespace-nowrap text-center text-[11px] leading-4 text-muted-foreground">
                        {customIconPath ? translate('自定义图标') : translate('添加图标')}
                      </span>
                    </div>
                  </div>

                  {customIconPath && !customPreviewLoading && !customPreview ? (
                    <p className="flex items-center gap-1.5 text-xs leading-5 text-amber-600 dark:text-amber-400">
                      <CircleAlert className="h-3.5 w-3.5 shrink-0" />
                      {translate('未能从自定义文件提取图标，请重新选择。')}
                    </p>
                  ) : null}
                </div>
              </FormRow>

              <FormRow label={translate('显示名称')} labelFor={nameInputId}>
                <div className="min-w-0">
                  <Input
                    id={nameInputId}
                    value={name}
                    onChange={event => setName(event.target.value)}
                    maxLength={64}
                    placeholder={
                      effectiveName
                        ? translate('留空则使用：{name}', { name: effectiveName })
                        : translate('选择目标后自动生成')
                    }
                    disabled={submitting}
                  />
                </div>
              </FormRow>

              {entryKind === 'app' ? (
                <FormRow label={translate('高级启动选项')}>
                  <div
                    className={cn(
                      'overflow-hidden rounded-lg border transition-[border-color,background-color,box-shadow] duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none',
                      advancedOpen
                        ? 'border-border bg-muted/20 shadow-sm'
                        : 'border-border/70 bg-muted/10 hover:border-border hover:bg-muted/20'
                    )}
                  >
                    <button
                      type="button"
                      aria-expanded={advancedOpen}
                      onClick={() => setAdvancedOpen(current => !current)}
                      disabled={submitting}
                      className="flex h-9 w-full min-w-0 items-center justify-between gap-3 px-3 text-left text-xs font-medium text-foreground disabled:opacity-50"
                    >
                      <span>{translate(advancedOpen ? '收起选项' : '展开选项')}</span>
                      <ChevronDown
                        className={cn(
                          'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none',
                          advancedOpen && 'rotate-180'
                        )}
                      />
                    </button>

                    <div
                      className={cn(
                        'grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none',
                        advancedOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                      )}
                    >
                      <div
                        className="min-h-0 overflow-hidden"
                        aria-hidden={!advancedOpen}
                        inert={!advancedOpen}
                      >
                        <div className="grid gap-3 border-t border-border/60 p-3 lg:grid-cols-2">
                          <label className="min-w-0 space-y-1.5">
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
                        </div>
                      </div>
                    </div>
                  </div>
                </FormRow>
              ) : null}
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
              disabled={
                !effectiveName ||
                !normalizedTargetPath ||
                selectedCustomIconInvalid ||
                selectedTextIconInvalid ||
                selectedColoredIconInvalid ||
                submitting
              }
              className="min-w-0 flex-1 sm:flex-none"
            >
              {submitting ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {submitting
                ? onSubmitDraft
                  ? translate('正在保存...')
                  : translate('正在添加...')
                : onSubmitDraft
                  ? translate('保存修改')
                  : translate('确认添加')}
            </Button>
          </div>
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
