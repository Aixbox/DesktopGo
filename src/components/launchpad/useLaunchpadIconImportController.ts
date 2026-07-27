import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { translate } from '@/lib/i18n'
import { deriveIconEntryName } from '@/lib/iconManager'
import { useToast } from '@/components/ui/toast'
import { buildIconSelectionKey, useIconStore } from '@/stores/iconStore'
import type { DesktopIcon } from '@/types'
import type { AddIconDialogDraft } from '../icons/AddIconDialog'

const NATIVE_FILE_DRAG_EVENT = 'desktopgo://native-file-drag'

type NativeFileDragPayload = {
  eventType: 'enter' | 'leave' | 'drop'
  paths: string[]
}

type ImportDroppedPathsResult = {
  imported_count: number
  duplicate_count: number
  invalid_count: number
}

export type DroppedIconDraft = AddIconDialogDraft & {
  key: string
  selected: boolean
  preview: string
  previewLoading: boolean
}

export interface LaunchpadImportPlacementRequest {
  token: number
  iconKeys: string[]
  targetGroupId?: string
}

interface UseLaunchpadIconImportControllerParams {
  icons: DesktopIcon[]
  fetchIcons: () => Promise<void>
  customNames: Record<string, string>
  clearCustomName: (path: string) => void
  editRequestedIcon: DesktopIcon | null
  clearIconEditRequest: () => void
}

export function useLaunchpadIconImportController({
  icons,
  fetchIcons,
  customNames,
  clearCustomName,
  editRequestedIcon,
  clearIconEditRequest,
}: UseLaunchpadIconImportControllerParams) {
  const toast = useToast()
  const [isExternalDragActive, setIsExternalDragActive] = useState(false)
  const [isImportingDrop, setIsImportingDrop] = useState(false)
  const [pendingDropDrafts, setPendingDropDrafts] = useState<DroppedIconDraft[]>([])
  const [editingDropIndex, setEditingDropIndex] = useState<number | null>(null)
  const [editingIcon, setEditingIcon] = useState<DesktopIcon | null>(null)
  const [addIconInitialDraft, setAddIconInitialDraft] = useState<AddIconDialogDraft | null>(null)
  const [addIconDialogOpen, setAddIconDialogOpen] = useState(false)
  const [importPlacementRequest, setImportPlacementRequest] =
    useState<LaunchpadImportPlacementRequest | null>(null)
  const importPlacementTokenRef = useRef(0)
  const dropPreviewRequestRef = useRef(0)
  const pendingAddIconKeySetRef = useRef<Set<string>>(new Set())
  const pendingAddTargetGroupIdRef = useRef<string | undefined>(undefined)
  const iconEditSourceRequestRef = useRef(0)

  const handleAddIcons = useCallback(
    (targetGroupId?: string) => {
      pendingAddIconKeySetRef.current = new Set(icons.map(buildIconSelectionKey))
      pendingAddTargetGroupIdRef.current = targetGroupId
      setAddIconInitialDraft(null)
      setEditingDropIndex(null)
      setEditingIcon(null)
      setAddIconDialogOpen(true)
    },
    [icons]
  )

  useEffect(() => {
    if (!editRequestedIcon) return
    iconEditSourceRequestRef.current += 1
    const requestId = iconEditSourceRequestRef.current
    const iconSource =
      editRequestedIcon.icon_source ?? (editRequestedIcon.custom_icon_path ? 'custom' : 'target')

    void invoke<string>('get_icon_edit_source', { id: editRequestedIcon.id })
      .catch(() => '')
      .then(canonicalSource => {
        if (iconEditSourceRequestRef.current !== requestId) return
        const isWebsiteTarget = editRequestedIcon.item_type === 'website' && iconSource === 'target'
        setAddIconInitialDraft({
          entryKind: editRequestedIcon.item_type === 'website' ? 'website' : 'app',
          displayName: customNames[editRequestedIcon.path] ?? editRequestedIcon.name,
          targetPath: editRequestedIcon.target_path || editRequestedIcon.path,
          launchArguments: editRequestedIcon.launch_arguments ?? '',
          workingDirectory: editRequestedIcon.working_directory ?? '',
          customIconPath: editRequestedIcon.custom_icon_path ?? '',
          websiteIconBase64: isWebsiteTarget
            ? canonicalSource || editRequestedIcon.icon_base64
            : '',
          generatedIconBase64: isWebsiteTarget ? '' : canonicalSource,
          iconSource,
          iconColor: editRequestedIcon.icon_color ?? 'none',
          iconText: editRequestedIcon.icon_text ?? '',
        })
        setEditingDropIndex(null)
        setEditingIcon(editRequestedIcon)
        setAddIconDialogOpen(true)
        clearIconEditRequest()
      })

    return () => {
      if (iconEditSourceRequestRef.current === requestId) iconEditSourceRequestRef.current += 1
    }
  }, [clearIconEditRequest, customNames, editRequestedIcon])

  const handleIconCreated = useCallback(async () => {
    setIsImportingDrop(true)
    try {
      await fetchIcons()
      const nextIcons = useIconStore.getState().icons
      const importedIconKeys = nextIcons
        .map(icon => buildIconSelectionKey(icon))
        .filter(key => !pendingAddIconKeySetRef.current.has(key))
      if (importedIconKeys.length > 0) {
        importPlacementTokenRef.current += 1
        setImportPlacementRequest({
          token: importPlacementTokenRef.current,
          iconKeys: importedIconKeys,
          targetGroupId: pendingAddTargetGroupIdRef.current,
        })
      }
    } finally {
      pendingAddTargetGroupIdRef.current = undefined
      setIsImportingDrop(false)
    }
  }, [fetchIcons])

  const prepareDroppedPaths = useCallback(
    (paths: string[]) => {
      const uniquePaths = Array.from(new Set(paths.filter(path => path.trim())))
      if (uniquePaths.length === 0) return
      const requestId = ++dropPreviewRequestRef.current
      setPendingDropDrafts([])
      const drafts = uniquePaths.map<DroppedIconDraft>(path => ({
        key: path,
        selected: true,
        entryKind: 'app',
        displayName: deriveIconEntryName(path),
        targetPath: path,
        launchArguments: '',
        workingDirectory: '',
        customIconPath: '',
        preview: '',
        previewLoading: true,
      }))
      if (drafts.length === 1) {
        pendingAddIconKeySetRef.current = new Set(icons.map(buildIconSelectionKey))
        setAddIconInitialDraft(drafts[0])
        setEditingDropIndex(null)
        setAddIconDialogOpen(true)
        return
      }
      setPendingDropDrafts(drafts)
      void Promise.all(
        drafts.map(async draft => {
          try {
            const preview = await invoke<string>('get_drag_preview_icon', {
              path: draft.targetPath,
              iconSize: 48,
            })
            return { key: draft.key, preview }
          } catch {
            return { key: draft.key, preview: '' }
          }
        })
      ).then(results => {
        if (dropPreviewRequestRef.current !== requestId) return
        const previewByKey = new Map(results.map(result => [result.key, result.preview]))
        setPendingDropDrafts(current =>
          current.map(draft => ({
            ...draft,
            preview: previewByKey.get(draft.key) ?? '',
            previewLoading: false,
          }))
        )
      })
    },
    [icons]
  )

  const handleEditDroppedDraft = useCallback(
    (index: number) => {
      const draft = pendingDropDrafts[index]
      if (!draft) return
      setAddIconInitialDraft(draft)
      setEditingDropIndex(index)
      setAddIconDialogOpen(true)
    },
    [pendingDropDrafts]
  )

  const handleSaveDroppedDraft = useCallback(
    async (draft: AddIconDialogDraft) => {
      if (editingDropIndex === null) return
      const previewPath = draft.customIconPath || draft.targetPath
      const preview =
        draft.generatedIconBase64 ||
        (await invoke<string>('get_drag_preview_icon', {
          path: previewPath,
          iconSize: 48,
        }).catch(() => ''))
      setPendingDropDrafts(current =>
        current.map((item, index) =>
          index === editingDropIndex
            ? { ...item, ...draft, selected: true, preview, previewLoading: false }
            : item
        )
      )
    },
    [editingDropIndex]
  )

  const handleSaveIconEdit = useCallback(
    async (draft: AddIconDialogDraft) => {
      if (!editingIcon) return
      await invoke('update_icon_entry', {
        input: {
          id: editingIcon.id,
          displayName: draft.displayName,
          targetPath: draft.targetPath,
          launchArguments: draft.launchArguments,
          workingDirectory: draft.workingDirectory,
          customIconPath: draft.customIconPath,
          websiteIconBase64: draft.websiteIconBase64 ?? '',
          generatedIconBase64: draft.generatedIconBase64 ?? '',
          iconSource: draft.iconSource ?? 'target',
          iconColor: draft.iconColor ?? 'none',
          iconText: draft.iconText ?? '',
        },
      })
      clearCustomName(editingIcon.path)
      await fetchIcons()
      toast.success(translate('“{name}”已更新。', { name: draft.displayName }), {
        key: 'edit-icon-dialog-submit',
        title: translate('编辑图标信息'),
      })
    },
    [clearCustomName, editingIcon, fetchIcons, toast]
  )

  const handleAddIconDialogOpenChange = useCallback((nextOpen: boolean) => {
    setAddIconDialogOpen(nextOpen)
    if (nextOpen) return
    pendingAddTargetGroupIdRef.current = undefined
    setAddIconInitialDraft(null)
    setEditingDropIndex(null)
    setEditingIcon(null)
  }, [])

  const handleConfirmDroppedImport = useCallback(async () => {
    const selectedDrafts = pendingDropDrafts.filter(draft => draft.selected)
    if (selectedDrafts.length === 0 || isImportingDrop) return
    setIsImportingDrop(true)
    try {
      const previousIconKeySet = new Set(icons.map(buildIconSelectionKey))
      const result = { imported_count: 0, duplicate_count: 0, invalid_count: 0 }
      const failedKeys = new Set<string>()
      for (const draft of selectedDrafts) {
        try {
          const itemResult = await invoke<ImportDroppedPathsResult>('create_icon_entry', {
            input: {
              displayName: draft.displayName,
              targetPath: draft.targetPath,
              launchArguments: draft.launchArguments,
              workingDirectory: draft.workingDirectory,
              customIconPath: draft.customIconPath,
              websiteIconBase64: draft.websiteIconBase64,
              generatedIconBase64: draft.generatedIconBase64,
              iconSource: draft.iconSource ?? 'target',
              iconColor: draft.iconColor ?? 'none',
              iconText: draft.iconText ?? '',
            },
          })
          result.imported_count += itemResult.imported_count
          result.duplicate_count += itemResult.duplicate_count
          result.invalid_count += itemResult.invalid_count
        } catch (error) {
          console.error('Failed to import dropped item:', error)
          failedKeys.add(draft.key)
          result.invalid_count += 1
        }
      }
      await fetchIcons()
      if (result.imported_count > 0) {
        const nextIcons = useIconStore.getState().icons
        const importedIconKeys = nextIcons
          .map(icon => buildIconSelectionKey(icon))
          .filter(key => !previousIconKeySet.has(key))
        if (importedIconKeys.length > 0) {
          importPlacementTokenRef.current += 1
          setImportPlacementRequest({
            token: importPlacementTokenRef.current,
            iconKeys: importedIconKeys,
          })
        }
      }
      const message = translate(
        '导入完成：新增 {imported} 项，重复 {duplicate} 项，无效 {invalid} 项。',
        {
          imported: result.imported_count,
          duplicate: result.duplicate_count,
          invalid: result.invalid_count,
        }
      )
      const options = {
        key: 'launchpad-import-drop',
        title: translate('启动台'),
        duration: result.imported_count > 0 ? 3600 : 3200,
      }
      if (result.imported_count > 0) toast.success(message, options)
      else toast.info(message, options)
      if (failedKeys.size > 0) {
        setPendingDropDrafts(current => current.filter(draft => failedKeys.has(draft.key)))
        toast.error(translate('部分项目未能导入，未完成的项目已保留，请检查后重试。'), {
          key: 'launchpad-import-drop-error',
          title: translate('启动台'),
          duration: 8000,
        })
      } else {
        setPendingDropDrafts([])
      }
    } catch (error) {
      console.error('Failed to import dropped paths:', error)
      toast.error(translate('导入失败，项目已保留。请检查文件是否可访问后重试。'), {
        key: 'launchpad-import-drop',
        title: translate('启动台'),
        duration: 8000,
      })
    } finally {
      setIsImportingDrop(false)
    }
  }, [fetchIcons, icons, isImportingDrop, pendingDropDrafts, toast])

  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | null = null
    let unlistenNative: (() => void) | null = null
    const handleFileDrag = (type: 'enter' | 'over' | 'leave' | 'drop', paths: string[] = []) => {
      if (type === 'enter' || type === 'over') {
        setIsExternalDragActive(true)
        return
      }
      if (type === 'leave') {
        if (!isImportingDrop) setIsExternalDragActive(false)
        return
      }
      setIsExternalDragActive(false)
      prepareDroppedPaths(paths)
    }
    void getCurrentWindow()
      .onDragDropEvent(event => {
        const payload = event.payload
        handleFileDrag(payload.type, payload.type === 'drop' ? payload.paths : [])
      })
      .then(fn => {
        if (disposed) fn()
        else unlisten = fn
      })
    void listen<NativeFileDragPayload>(NATIVE_FILE_DRAG_EVENT, event => {
      handleFileDrag(event.payload.eventType, event.payload.paths)
    }).then(fn => {
      if (disposed) fn()
      else unlistenNative = fn
    })
    return () => {
      disposed = true
      unlisten?.()
      unlistenNative?.()
    }
  }, [isImportingDrop, prepareDroppedPaths])

  return {
    addIconDialogOpen,
    addIconInitialDraft,
    dismissPendingDrop: () => setPendingDropDrafts([]),
    editingDropIndex,
    editingIcon,
    handleAddIconDialogOpenChange,
    handleAddIcons,
    handleConfirmDroppedImport,
    handleEditDroppedDraft,
    handleIconCreated,
    handleSaveDroppedDraft,
    handleSaveIconEdit,
    importPlacementRequest,
    isExternalDragActive,
    isImportingDrop,
    pendingDropDrafts,
    toggleDroppedDraft: (index: number) => {
      setPendingDropDrafts(current =>
        current.map((item, itemIndex) =>
          itemIndex === index ? { ...item, selected: !item.selected } : item
        )
      )
    },
  }
}

export type LaunchpadIconImportController = ReturnType<typeof useLaunchpadIconImportController>
