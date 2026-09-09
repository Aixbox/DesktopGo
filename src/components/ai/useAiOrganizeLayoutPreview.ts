import { useCallback, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { DesktopIcon, LaunchpadGridViewMode } from '@/types'
import { normalizeWebsiteUrl } from '@/lib/websiteIcon'
import { applyAiGroupsToLayout, type AiGroup } from '@/lib/aiOrganize'
import { buildIconSelectionKey } from '@/stores/iconStore'
import type { AiWebsiteAddition } from '@/lib/aiOrganizeSessions'
import { createAiWebsiteIcon, findWebsiteIcon } from './aiWebsiteIconService'
import { placeAiWebsiteIcon } from './aiWebsitePlacement'
import { translate } from '@/lib/i18n'
import { hydrateItems } from '@/components/icon-grid/services/layoutStore'
import {
  readAiOrganizeLayout,
  restoreAiOrganizeLayout,
  writeAiOrganizeLayoutState,
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
  const previewWebsiteIconsRef = useRef(new Map<string, DesktopIcon>())
  const previewCreatedIconIdsRef = useRef(new Set<string>())

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

  const cleanupPreviewWebsiteIcons = useCallback(async () => {
    const ids = Array.from(previewCreatedIconIdsRef.current)
    previewWebsiteIconsRef.current.clear()
    previewCreatedIconIdsRef.current.clear()
    if (ids.length > 0) await invoke('delete_icons', { targets: ids.map(id => ({ id })) })
  }, [])

  const ensurePreviewWebsiteIcons = useCallback(
    async (additions: AiWebsiteAddition[]) => {
      try {
        let latestIcons = await invoke<DesktopIcon[]>('get_icons', { iconSize: 48 })
        for (const addition of additions) {
          const normalizedUrl = normalizeWebsiteUrl(addition.url)
          if (!normalizedUrl || previewWebsiteIconsRef.current.has(normalizedUrl)) continue
          const existing = findWebsiteIcon(latestIcons, normalizedUrl)
          if (existing) {
            previewWebsiteIconsRef.current.set(normalizedUrl, existing)
            continue
          }
          const result = await createAiWebsiteIcon(addition)
          latestIcons = await invoke<DesktopIcon[]>('get_icons', { iconSize: 48 })
          const created = findWebsiteIcon(latestIcons, result.url)
          if (created) {
            previewWebsiteIconsRef.current.set(normalizedUrl, created)
            if (result.imported_count > 0) previewCreatedIconIdsRef.current.add(created.id)
          }
        }
        return latestIcons
      } catch (error) {
        await cleanupPreviewWebsiteIcons().catch(() => {})
        throw error
      }
    },
    [cleanupPreviewWebsiteIcons]
  )

  const filterPreviewIcons = useCallback(
    (candidateIcons: DesktopIcon[], additions: AiWebsiteAddition[]) => {
      const requestedIds = new Set(
        additions
          .map(
            addition => previewWebsiteIconsRef.current.get(normalizeWebsiteUrl(addition.url))?.id
          )
          .filter((id): id is string => Boolean(id))
      )
      return candidateIcons.filter(
        icon => !previewCreatedIconIdsRef.current.has(icon.id) || requestedIds.has(icon.id)
      )
    },
    []
  )

  const applyLayoutPreview = useCallback(
    async (aiGroups: AiGroup[], websiteAdditions: AiWebsiteAddition[] = []) => {
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
      const allPreviewIcons =
        websiteAdditions.length > 0 ? await ensurePreviewWebsiteIcons(websiteAdditions) : icons
      const previewIcons = filterPreviewIcons(allPreviewIcons, websiteAdditions)
      const currentItems = hydrateItems(previewIcons, baseline?.layout?.items ?? null)
      let nextItems = applyAiGroupsToLayout(currentItems, aiGroups)
      let nextDockKeys = (baseline?.layout?.dockKeys ?? []).filter(
        (key): key is string => typeof key === 'string'
      )
      for (const addition of websiteAdditions) {
        const icon = findWebsiteIcon(previewIcons, addition.url)
        if (!icon) continue
        const placed = placeAiWebsiteIcon(
          nextItems,
          nextDockKeys,
          { kind: 'icon', key: buildIconSelectionKey(icon), icon },
          addition
        )
        nextItems = placed.items
        nextDockKeys = placed.dockKeys
      }
      try {
        await writeAiOrganizeLayoutState({
          viewMode: previewViewMode,
          items: nextItems,
          baselineLayout: baseline?.layout ?? null,
          defaultScrollGroupName,
          dockKeys: nextDockKeys,
        })
      } catch (error) {
        await cleanupPreviewWebsiteIcons().catch(() => {})
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
    [
      cleanupPreviewWebsiteIcons,
      clearSession,
      defaultScrollGroupName,
      ensurePreviewWebsiteIcons,
      filterPreviewIcons,
      icons,
      layoutViewMode,
    ]
  )

  const restoreLayoutPreview = useCallback(() => {
    if (restorePromiseRef.current) return restorePromiseRef.current

    const session = sessionRef.current
    if (!session.dirty || session.applied) return Promise.resolve()

    const restorePromise = (async () => {
      const baseline = session.baseline
      if (baseline) await restoreAiOrganizeLayout(baseline.viewMode, baseline.layout)
      await cleanupPreviewWebsiteIcons()
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
  }, [cleanupPreviewWebsiteIcons, clearSession])

  const applyAiChanges = useCallback(
    async (aiGroups: AiGroup[], websiteAdditions: AiWebsiteAddition[]) => {
      const baseline = sessionRef.current.baseline
      const targetViewMode = resolveAiOrganizePreviewViewMode(baseline?.viewMode, layoutViewMode)
      const persisted = baseline?.layout ?? (await readAiOrganizeLayout(targetViewMode))
      let latestIcons = icons
      const requestedAdditions: Array<{ addition: AiWebsiteAddition; targetUrl: string }> = []

      for (const addition of websiteAdditions) {
        const previewIcon = previewWebsiteIconsRef.current.get(normalizeWebsiteUrl(addition.url))
        if (previewIcon) {
          requestedAdditions.push({ addition, targetUrl: previewIcon.target_path })
          continue
        }
        const result = await createAiWebsiteIcon(addition)
        requestedAdditions.push({ addition, targetUrl: result.url })
      }

      if (requestedAdditions.length > 0) {
        latestIcons = await invoke<DesktopIcon[]>('get_icons', { iconSize: 48 })
      }

      const usableIcons = filterPreviewIcons(latestIcons, websiteAdditions)
      let nextItems = applyAiGroupsToLayout(
        hydrateItems(usableIcons, persisted?.items ?? null),
        aiGroups
      )
      let nextDockKeys = (persisted?.dockKeys ?? []).filter(
        (key): key is string => typeof key === 'string'
      )
      for (const { addition, targetUrl } of requestedAdditions) {
        const normalizedTargetUrl = normalizeWebsiteUrl(targetUrl)
        const icon = latestIcons.find(current => {
          const currentUrl = normalizeWebsiteUrl(current.target_path)
          return currentUrl && normalizedTargetUrl && currentUrl === normalizedTargetUrl
        })
        if (!icon) continue
        const iconKey = buildIconSelectionKey(icon)
        const placed = placeAiWebsiteIcon(
          nextItems,
          nextDockKeys,
          { kind: 'icon', key: iconKey, icon },
          addition
        )
        nextItems = placed.items
        nextDockKeys = placed.dockKeys
      }

      await writeAiOrganizeLayoutState({
        viewMode: targetViewMode,
        items: nextItems,
        baselineLayout: persisted,
        defaultScrollGroupName,
        dockKeys: nextDockKeys,
      })
      clearSession()
      previewWebsiteIconsRef.current.clear()
      previewCreatedIconIdsRef.current.clear()
      return requestedAdditions.length
    },
    [clearSession, defaultScrollGroupName, filterPreviewIcons, icons, layoutViewMode]
  )

  const markApplied = useCallback(() => {
    clearSession()
  }, [clearSession])

  const resetSession = useCallback(() => {
    clearSession()
  }, [clearSession])

  return {
    applyAiChanges,
    applyLayoutPreview,
    restoreLayoutPreview,
    markApplied,
    resetSession,
  }
}
