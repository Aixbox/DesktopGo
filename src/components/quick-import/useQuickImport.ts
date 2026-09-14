import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { translate } from '@/lib/i18n'
import { useToast } from '@/components/ui/toast'
import {
  buildQuickImportDrafts,
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

  const selectedCount = countSelectedQuickImportApps(apps)

  const confirmImport = useCallback(async (): Promise<QuickImportResult | undefined> => {
    const selectedApps = apps.filter(app => app.selected)
    if (selectedApps.length === 0 || importing || scanning) return undefined
    setImporting(true)
    try {
      const result = await invoke<QuickImportResult>('import_app_entries', {
        entries: selectedApps.map(app => ({
          displayName: app.displayName,
          targetPath: app.sourcePath,
          origin: 'import',
        })),
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
    startScan,
    toggleApp,
    setAllSelected,
    confirmImport,
  }
}

export type QuickImportController = ReturnType<typeof useQuickImport>
