import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { translate } from '@/lib/i18n'
import { useToast } from '@/components/ui/toast'
import type { AddIconDialogDraft } from '@/components/icons/addIconDialogState'
import {
  buildQuickImportDrafts,
  buildQuickImportEditDraft,
  buildQuickImportEntryInput,
  countSelectedQuickImportApps,
  type QuickImportAppDraft,
  type QuickImportResult,
  type ScannedInstalledApp,
} from './quickImportModel'

const PREVIEW_ICON_SIZE = 48
/** 预览图标的并发上限：几百个应用逐个提取图标时避免一次性打满线程池。 */
const PREVIEW_CONCURRENCY = 6

interface UseQuickImportParams {
  /** 弹窗是否打开；打开时自动执行一次扫描。 */
  open: boolean
  /** 导入成功后的回调（刷新图标库、通知主窗口等）。 */
  onImported?: () => void | Promise<void>
}

export function useQuickImport({ open, onImported }: UseQuickImportParams) {
  const toast = useToast()
  const [scanning, setScanning] = useState(false)
  const [importing, setImporting] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [apps, setApps] = useState<QuickImportAppDraft[]>([])
  /** 正在编辑的应用：key 定位条目，draft 是「编辑图标信息」弹窗的初始值。 */
  const [editingApp, setEditingApp] = useState<{ key: string; draft: AddIconDialogDraft } | null>(null)
  const scanRequestRef = useRef(0)
  const previewRequestRef = useRef(0)

  /** 分批并发加载应用图标预览；扫描被替换或弹窗关闭时通过请求号失效。 */
  const loadPreviews = useCallback((drafts: QuickImportAppDraft[]) => {
    if (drafts.length === 0) return
    const requestId = ++previewRequestRef.current
    const requestOne = async (draft: QuickImportAppDraft) => {
      try {
        return await invoke<string>('get_drag_preview_icon', {
          path: draft.sourcePath,
          iconSize: PREVIEW_ICON_SIZE,
        })
      } catch {
        return ''
      }
    }
    const runWorker = async (offset: number) => {
      for (let index = offset; index < drafts.length; index += PREVIEW_CONCURRENCY) {
        if (previewRequestRef.current !== requestId) return
        const draft = drafts[index]
        const preview = await requestOne(draft)
        if (previewRequestRef.current !== requestId) return
        setApps(current =>
          current.map(app =>
            app.key === draft.key ? { ...app, preview, previewLoading: false } : app
          )
        )
      }
    }
    for (let offset = 0; offset < Math.min(PREVIEW_CONCURRENCY, drafts.length); offset += 1) {
      void runWorker(offset)
    }
  }, [])

  const startScan = useCallback(async () => {
    const requestId = ++scanRequestRef.current
    previewRequestRef.current += 1
    setScanning(true)
    setScanError(null)
    setApps([])
    try {
      const scanned = await invoke<ScannedInstalledApp[]>('scan_installed_apps')
      if (scanRequestRef.current !== requestId) return
      const drafts = buildQuickImportDrafts(scanned)
      setApps(drafts)
      loadPreviews(drafts)
    } catch (error) {
      if (scanRequestRef.current !== requestId) return
      console.error('Failed to scan installed apps:', error)
      setScanError(String(error))
    } finally {
      if (scanRequestRef.current === requestId) setScanning(false)
    }
  }, [loadPreviews])

  // 弹窗打开时自动扫描。扫描会把状态置回初始态，延迟到宏任务里执行，
  // 避免 effect 同步触发级联渲染；关闭后使未完成的请求失效。
  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => void startScan(), 0)
    return () => {
      window.clearTimeout(timer)
      scanRequestRef.current += 1
      previewRequestRef.current += 1
    }
  }, [open, startScan])

  const toggleApp = useCallback((key: string) => {
    setApps(current =>
      current.map(app => (app.key === key ? { ...app, selected: !app.selected } : app))
    )
  }, [])

  const setAllSelected = useCallback((selected: boolean) => {
    setApps(current => current.map(app => ({ ...app, selected })))
  }, [])

  /** 按来源分组全选/取消全选：只影响该来源下的条目。 */
  const setSourceSelected = useCallback((source: string, selected: boolean) => {
    setApps(current =>
      current.map(app => (app.sourceLabel === source ? { ...app, selected } : app))
    )
  }, [])

  /** 打开「编辑图标信息」弹窗：与「确认导入图标」的编辑流程保持一致。 */
  const handleEditApp = useCallback(
    (key: string) => {
      const app = apps.find(item => item.key === key)
      if (!app) return
      setEditingApp({ key, draft: buildQuickImportEditDraft(app) })
    },
    [apps]
  )

  /** 编辑弹窗关闭（取消或保存后）即返回快捷导入网格。 */
  const handleEditDialogOpenChange = useCallback((nextOpen: boolean) => {
    if (nextOpen) return
    setEditingApp(null)
  }, [])

  /** 保存编辑：合并草稿并刷新预览；条目标记为选中，编辑后关闭由弹窗自身触发。 */
  const handleSaveAppEdit = useCallback(
    async (draft: AddIconDialogDraft) => {
      if (!editingApp) return
      const previewPath = draft.customIconPath || draft.targetPath
      const preview =
        draft.generatedIconBase64 ||
        draft.websiteIconBase64 ||
        (await invoke<string>('get_drag_preview_icon', {
          path: previewPath,
          iconSize: PREVIEW_ICON_SIZE,
        }).catch(() => ''))
      setApps(current =>
        current.map(app =>
          app.key === editingApp.key
            ? { ...app, edit: draft, selected: true, preview, previewLoading: false }
            : app
        )
      )
    },
    [editingApp]
  )

  const selectedCount = countSelectedQuickImportApps(apps)

  const confirmImport = useCallback(async (): Promise<QuickImportResult | undefined> => {
    const selectedApps = apps.filter(app => app.selected)
    if (selectedApps.length === 0 || importing || scanning) return undefined
    setImporting(true)
    try {
      const result = await invoke<QuickImportResult>('import_app_entries', {
        entries: selectedApps.map(buildQuickImportEntryInput),
      })
      const message = translate(
        '导入完成：新增 {imported} 项，重复 {duplicate} 项，无效 {invalid} 项。',
        {
          imported: result.imported_count,
          duplicate: result.duplicate_count,
          invalid: result.invalid_count,
        }
      )
      const options = { key: 'quick-import', title: translate('快捷导入') } as const
      if (result.imported_count > 0) toast.success(message, options)
      else toast.info(message, options)
      await onImported?.()
      return result
    } catch (error) {
      console.error('Quick import failed:', error)
      toast.error(translate('导入失败，请检查应用是否仍可访问后重试。'), {
        key: 'quick-import',
        title: translate('快捷导入'),
      })
      return undefined
    } finally {
      setImporting(false)
    }
  }, [apps, importing, onImported, scanning, toast])

  return {
    apps,
    scanning,
    importing,
    scanError,
    selectedCount,
    editingApp,
    startScan,
    toggleApp,
    setAllSelected,
    setSourceSelected,
    handleEditApp,
    handleEditDialogOpenChange,
    handleSaveAppEdit,
    confirmImport,
  }
}

export type QuickImportController = ReturnType<typeof useQuickImport>
