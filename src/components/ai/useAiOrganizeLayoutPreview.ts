import { useCallback, useEffect, useRef } from 'react'
import type { DesktopIcon, LaunchpadGridViewMode } from '@/types'
import { applyAiGroupsToLayout, type AiGroup } from '@/lib/aiOrganize'
import { translate } from '@/lib/i18n'
import { hydrateItems } from '@/components/icon-grid/services/layoutStore'
import {
  readAiOrganizeLayout,
  restoreAiOrganizeLayout,
  writeAiOrganizeLayout,
} from './aiOrganizeLayout'
import {
  AiOrganizePreviewRefreshError,
  clearAiOrganizePreviewSessionState,
  markAiOrganizePreviewLayoutWritten,
  resolveAiOrganizePreviewViewMode,
  type AiOrganizePreviewSessionState,
} from './useAiOrganizeLayoutPreview.helpers'

interface UseAiOrganizeLayoutPreviewOptions {
  icons: DesktopIcon[]
  layoutViewMode: LaunchpadGridViewMode
  onPreviewed?: () => void | Promise<void>
}

interface PreviewBaseline {
  layout: Awaited<ReturnType<typeof readAiOrganizeLayout>>
  viewMode: LaunchpadGridViewMode
}

export const useAiOrganizeLayoutPreview = ({
  icons,
  layoutViewMode,
  onPreviewed,
}: UseAiOrganizeLayoutPreviewOptions) => {
  const sessionRef = useRef<AiOrganizePreviewSessionState<PreviewBaseline>>({
    baseline: null,
    baselineCaptured: false,
    dirty: false,
    applied: false,
  })
  const onPreviewedRef = useRef(onPreviewed)
  const restorePromiseRef = useRef<Promise<void> | null>(null)

  useEffect(() => {
    onPreviewedRef.current = onPreviewed
  }, [onPreviewed])

  const defaultScrollGroupName = useCallback(
    (index: number) => translate('网格 {index}', { index: index + 1 }),
    []
  )

  const clearSession = useCallback(() => {
    sessionRef.current = clearAiOrganizePreviewSessionState(sessionRef.current)
  }, [])

  const applyLayoutPreview = useCallback(
    async (aiGroups: AiGroup[]) => {
      if (!sessionRef.current.baselineCaptured) {
        try {
          sessionRef.current = {
            ...sessionRef.current,
            baseline: {
              layout: await readAiOrganizeLayout(layoutViewMode),
              viewMode: layoutViewMode,
            },
            baselineCaptured: true,
          }
        } catch (error) {
          clearSession()
          throw error
        }
      }

      const baseline = sessionRef.current.baseline
      const previewViewMode = resolveAiOrganizePreviewViewMode(baseline?.viewMode, layoutViewMode)
      const currentItems = hydrateItems(icons, baseline?.layout?.items ?? null)
      const nextItems = applyAiGroupsToLayout(currentItems, aiGroups)
      try {
        await writeAiOrganizeLayout({
          viewMode: previewViewMode,
          items: nextItems,
          baselineLayout: baseline?.layout ?? null,
          defaultScrollGroupName,
        })
      } catch (error) {
        clearSession()
        throw error
      }

      sessionRef.current = markAiOrganizePreviewLayoutWritten(sessionRef.current)
      try {
        await onPreviewedRef.current?.()
      } catch (error) {
        throw new AiOrganizePreviewRefreshError(error)
      }
    },
    [clearSession, defaultScrollGroupName, icons, layoutViewMode]
  )

  const restoreLayoutPreview = useCallback(() => {
    if (restorePromiseRef.current) return restorePromiseRef.current

    const session = sessionRef.current
    if (!session.dirty || session.applied) return Promise.resolve()

    const restorePromise = (async () => {
      const baseline = session.baseline
      if (baseline) await restoreAiOrganizeLayout(baseline.viewMode, baseline.layout)
      await onPreviewedRef.current?.()
      clearSession()
    })()
    restorePromiseRef.current = restorePromise
    void restorePromise.then(
      () => {
        if (restorePromiseRef.current === restorePromise) restorePromiseRef.current = null
      },
      () => {
        if (restorePromiseRef.current === restorePromise) restorePromiseRef.current = null
      }
    )
    return restorePromise
  }, [clearSession])

  const applyAiOrganizeLayout = useCallback(
    async (aiGroups: AiGroup[]) => {
      const baseline = sessionRef.current.baseline
      const targetViewMode = resolveAiOrganizePreviewViewMode(baseline?.viewMode, layoutViewMode)
      const persisted = baseline?.layout ?? (await readAiOrganizeLayout(targetViewMode))
      const currentItems = hydrateItems(icons, persisted?.items ?? null)
      const nextItems = applyAiGroupsToLayout(currentItems, aiGroups)
      await writeAiOrganizeLayout({
        viewMode: targetViewMode,
        items: nextItems,
        baselineLayout: persisted,
        defaultScrollGroupName,
      })
      clearSession()
    },
    [clearSession, defaultScrollGroupName, icons, layoutViewMode]
  )

  const markApplied = useCallback(() => {
    clearSession()
  }, [clearSession])

  const resetSession = useCallback(() => {
    clearSession()
  }, [clearSession])

  return {
    applyAiOrganizeLayout,
    applyLayoutPreview,
    restoreLayoutPreview,
    markApplied,
    resetSession,
  }
}
