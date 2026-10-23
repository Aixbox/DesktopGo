import { useCallback, useEffect, useRef, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { translate } from '@/lib/i18n'
import { useToast } from '@/components/ui/toast'
import {
  deleteLayoutVersion,
  formatLayoutVersionTime,
  getLayoutVersion,
  prepareLayoutPayloadForApply,
  renameLayoutVersion,
  saveLayoutVersion,
  setLayoutHistoryPaused,
  type LayoutVersionMeta,
} from './layoutLibrary'

/** 命名弹窗的两种来意：存新布局，或给已保存的布局改名。 */
export type LayoutNameDialogState =
  | { mode: 'create' }
  | { mode: 'rename'; id: string; initialName: string }

interface UseLayoutLibraryControllerOptions {
  currentGeometryKey: string
  /** 布局库只认分页网格，滚动模式下直接挡住入口。 */
  gridViewMode: 'paged' | 'scroll'
  fetchIcons: () => Promise<void>
  bumpLayoutToken: () => void
  /** AI 整理模式开着时不让进：它的预览要靠面板自身的关闭流程回滚。 */
  isAiOrganizeMode: boolean
  /** 打开抽屉前收尾：清空选择、关掉搜索面板。 */
  onBeforeOpen: () => void
}

/**
 * 布局抽屉的预览会话：打开时记下当前布局原串，应用就保留预览结果，取消则写回原串。
 *
 * 预览走"先写库再重新水合"的路子，和 AI 整理的预览一致：网格只认持久化数据，
 * 另开一条内存通道会让两套状态打架。
 */
export function useLayoutLibraryController({
  currentGeometryKey,
  gridViewMode,
  fetchIcons,
  bumpLayoutToken,
  isAiOrganizeMode,
  onBeforeOpen,
}: UseLayoutLibraryControllerOptions) {
  const toast = useToast()
  const [isOpen, setIsOpen] = useState(false)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)
  const [nameDialog, setNameDialog] = useState<LayoutNameDialogState | null>(null)
  const baselineRef = useRef<string | null>(null)

  const reportError = useCallback(
    (message: string, error: unknown) => {
      console.error(message, error)
      toast.error(`${message}：${String(error)}`, {
        key: 'layout-library',
        title: translate('布局'),
      })
    },
    [toast]
  )

  /** 入口统一走这里：非分页网格与 AI 整理模式都不放行。 */
  const canEnter = useCallback(() => {
    if (gridViewMode !== 'paged') {
      toast.info(translate('布局库只支持分页网格。'), {
        key: 'layout-library',
        title: translate('布局'),
      })
      return false
    }
    if (isAiOrganizeMode) {
      // AI 面板的预览要由它自己的关闭流程回滚，这里强行收起会把预览留在库里。
      toast.info(translate('请先退出 AI 整理，再打开布局库。'), {
        key: 'layout-library',
        title: translate('布局'),
      })
      return false
    }
    return true
  }, [gridViewMode, isAiOrganizeMode, toast])

  const openLibrary = useCallback(async () => {
    if (!canEnter()) return
    onBeforeOpen()
    setPreviewId(null)
    setLayoutHistoryPaused(true)
    try {
      const { readLayoutPayload } = await import('@/components/icon-grid/services/layoutStore')
      baselineRef.current = await readLayoutPayload('paged')
    } catch (error) {
      console.error('Failed to capture the current layout:', error)
      baselineRef.current = null
    }
    setIsOpen(true)
  }, [canEnter, onBeforeOpen])

  const previewVersion = useCallback(
    async (version: LayoutVersionMeta) => {
      // 点已经预览中的那条不必重写一遍库，省掉一次无谓的重新水合。
      if (version.id === previewId) return
      try {
        const detail = await getLayoutVersion(version.id)
        if (!detail) throw new Error(translate('布局已不存在'))
        const { applyLayoutPayload } = await import('@/components/icon-grid/services/layoutStore')
        await applyLayoutPayload(
          prepareLayoutPayloadForApply(detail.payload, currentGeometryKey),
          'paged'
        )
        setPreviewId(version.id)
        bumpLayoutToken()
        await fetchIcons()
      } catch (error) {
        reportError(translate('预览布局失败'), error)
      }
    },
    [bumpLayoutToken, currentGeometryKey, fetchIcons, previewId, reportError]
  )

  const finish = useCallback(() => {
    baselineRef.current = null
    setPreviewId(null)
    setIsOpen(false)
    setLayoutHistoryPaused(false)
  }, [])

  const applyPreview = useCallback(async () => {
    const baseline = baselineRef.current
    const appliedId = previewId
    finish()
    if (!appliedId) return

    // 应用前补一条快照：误点应用还能从历史里找回应用前的样子。
    if (baseline) {
      try {
        await saveLayoutVersion({ kind: 'auto', name: translate('应用前'), payload: baseline })
        setRefreshToken(current => current + 1)
      } catch (error) {
        console.error('Failed to snapshot the layout before applying:', error)
      }
    }
    toast.success(translate('已应用布局。'), { key: 'layout-library', title: translate('布局') })
  }, [finish, previewId, toast])

  /** 把网格写回打开抽屉时记下的原样；不动抽屉的开关状态。 */
  const restoreBaselineLayout = useCallback(async () => {
    const baseline = baselineRef.current
    if (baseline === null) return
    try {
      const { applyLayoutPayload } = await import('@/components/icon-grid/services/layoutStore')
      await applyLayoutPayload(baseline, 'paged')
      bumpLayoutToken()
      await fetchIcons()
    } catch (error) {
      reportError(translate('恢复原布局失败'), error)
    }
  }, [bumpLayoutToken, fetchIcons, reportError])

  const cancelPreview = useCallback(async () => {
    const hadPreview = previewId !== null
    finish()
    if (!hadPreview) return
    await restoreBaselineLayout()
  }, [finish, previewId, restoreBaselineLayout])

  // 预览期间启动台失焦（用户切走 / 窗口被隐藏）：把预览收掉。
  // 不然快照暂停会一直挂在那里，之后所有布局改动都不会进历史。
  useEffect(() => {
    if (previewId === null) return
    const window = getCurrentWindow()
    let disposed = false
    let unlisten: (() => void) | null = null
    void window
      .onFocusChanged(({ payload: focused }) => {
        if (focused || disposed) return
        void cancelPreview()
      })
      .then(fn => {
        if (disposed) {
          fn()
          return
        }
        unlisten = fn
      })
      .catch(error => {
        console.error('Failed to watch launchpad focus for the layout preview:', error)
      })
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [cancelPreview, previewId])

  const saveCurrent = useCallback(
    async (name: string) => {
      try {
        const { readLayoutPayload } = await import('@/components/icon-grid/services/layoutStore')
        const payload = await readLayoutPayload('paged')
        if (!payload) throw new Error(translate('当前布局为空'))
        await saveLayoutVersion({ kind: 'saved', name, payload })
        setRefreshToken(current => current + 1)
        setNameDialog(null)
        toast.success(translate('已保存布局「{name}」。', { name }), {
          key: 'layout-library',
          title: translate('布局'),
        })
      } catch (error) {
        reportError(translate('保存布局失败'), error)
      }
    },
    [reportError, toast]
  )

  const renameVersion = useCallback(
    async (id: string, name: string) => {
      try {
        await renameLayoutVersion(id, name)
        setRefreshToken(current => current + 1)
        setNameDialog(null)
        toast.success(translate('已重命名为「{name}」。', { name }), {
          key: 'layout-library',
          title: translate('布局'),
        })
      } catch (error) {
        reportError(translate('重命名失败'), error)
      }
    },
    [reportError, toast]
  )

  /** 弹窗确认：按打开时的来意分流到「存新布局」或「改名」。 */
  const submitName = useCallback(
    async (name: string) => {
      if (!nameDialog) return
      if (nameDialog.mode === 'rename') await renameVersion(nameDialog.id, name)
      else await saveCurrent(name)
    },
    [nameDialog, renameVersion, saveCurrent]
  )

  const deleteVersion = useCallback(
    async (version: LayoutVersionMeta) => {
      const label = version.name?.trim() || formatLayoutVersionTime(version.createdAt)
      if (!window.confirm(translate('确定删除布局「{name}」吗？', { name: label }))) return
      try {
        await deleteLayoutVersion(version.id)
        // 删掉的正是当前预览的那份：预览对象没了，网格写回打开抽屉时的原样，
        // 但抽屉留着（用户可能接着删/选别的），所以不走 cancelPreview。
        if (version.id === previewId) {
          setPreviewId(null)
          await restoreBaselineLayout()
        }
        setRefreshToken(current => current + 1)
        toast.success(translate('已删除布局「{name}」。', { name: label }), {
          key: 'layout-library',
          title: translate('布局'),
        })
      } catch (error) {
        reportError(translate('删除布局失败'), error)
      }
    },
    [previewId, reportError, restoreBaselineLayout, toast]
  )

  const openNameDialog = useCallback(() => {
    // 滚动模式的布局没法存成"分页布局"，这里直接挡掉，免得存出个对不上的东西。
    if (gridViewMode !== 'paged') {
      toast.info(translate('布局库只支持分页网格。'), {
        key: 'layout-library',
        title: translate('布局'),
      })
      return
    }
    setNameDialog({ mode: 'create' })
  }, [gridViewMode, toast])

  const openRenameDialog = useCallback((version: LayoutVersionMeta) => {
    setNameDialog({ mode: 'rename', id: version.id, initialName: version.name?.trim() ?? '' })
  }, [])

  return {
    isLayoutLibraryOpen: isOpen,
    layoutPreviewId: previewId,
    layoutVersionsRefreshToken: refreshToken,
    layoutNameDialog: nameDialog,
    openLayoutLibrary: openLibrary,
    previewLayoutVersion: previewVersion,
    applyLayoutPreview: applyPreview,
    cancelLayoutPreview: cancelPreview,
    submitLayoutName: submitName,
    openLayoutNameDialog: openNameDialog,
    openLayoutRenameDialog: openRenameDialog,
    deleteLayoutVersion: deleteVersion,
    closeLayoutNameDialog: () => setNameDialog(null),
  }
}
