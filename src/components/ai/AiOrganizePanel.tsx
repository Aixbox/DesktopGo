import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { invoke } from '@tauri-apps/api/core'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowDown, Bot, Loader2, MessageSquareText, Sparkles } from 'lucide-react'
import { translate } from '@/lib/i18n'
import { useToast } from '@/components/ui/toast'
import type { AiGroup } from '@/lib/aiOrganize'
import {
  createAiOrganizeId,
  createAiOrganizeSession,
  loadAiOrganizeSessions,
  saveAiOrganizeSessions,
  upsertAiOrganizeSession,
  type AiOrganizeSession,
  type AiOrganizeSnapshot,
} from '@/lib/aiOrganizeSessions'
import type { DesktopIcon } from '@/types'
import { AiOrganizeComposer } from './AiOrganizeComposer'
import { AiOrganizePanelHeaderActions } from './AiOrganizePanelHeaderActions'
import { AiOrganizeHistoryMenu } from './AiOrganizeHistoryMenu'
import { AiOrganizeRunInline as AssistantRunInline } from './AiOrganizeRunInline'
import { AiOrganizeSnapshotPreview } from './AiOrganizeSnapshotPreview'
import {
  getComposerCommandLabel,
  isNearScrollBottom,
  summarizeGroups,
  toAiGroups,
  toEditableGroups,
  type AiComposerCommand as ComposerCommand,
  type AiOrganizePhase as Phase,
  type EditableAiGroup as EditableGroup,
  type QueuedAiPrompt as QueuedPrompt,
} from './aiOrganizePanelModel'
import { useAiOrganizeExecution } from './useAiOrganizeExecution'
import { useQueuedPrompts } from './useQueuedPrompts'
import type { AiOrganizePanelHandle, AiOrganizePanelProps } from './aiOrganizePanelTypes'
import { useAiOrganizeRunState } from './useAiOrganizeRunState'
import { useAiOrganizeLayoutPreview } from './useAiOrganizeLayoutPreview'
import { isAiOrganizePreviewRefreshError } from './useAiOrganizeLayoutPreview.helpers'
import {
  resolveAiOrganizeComposerKeyAction,
  shouldRestoreAiOrganizeLayoutPreview,
} from './aiOrganizePanelInteraction'

export type { AiOrganizePanelHandle } from './aiOrganizePanelTypes'
export type { AiOrganizePanelRunState } from './useAiOrganizeRunState'

export const AiOrganizePanel = forwardRef<AiOrganizePanelHandle, AiOrganizePanelProps>(
  function AiOrganizePanel(
    {
      open = true,
      visible = open,
      layoutViewMode,
      icons,
      customNames,
      onRunStateChange,
      onCollapse,
      onClose,
      onPreviewed,
      onApplied,
    },
    ref
  ) {
    const toast = useToast()
    const prefersReducedMotion = useReducedMotion()
    const [phase, setPhase] = useState<Phase>('idle')
    const [error, setError] = useState<string | null>(null)
    const [notConfigured, setNotConfigured] = useState(false)
    const [groups, setGroups] = useState<EditableGroup[]>([])
    const [runId, setRunId] = useState<string | null>(null)
    const [sessions, setSessions] = useState<AiOrganizeSession[]>([])
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
    const [activeSnapshotId, setActiveSnapshotId] = useState<string | null>(null)
    const [editingSnapshotId, setEditingSnapshotId] = useState<string | null>(null)
    const [composerValue, setComposerValue] = useState('')
    const [composerCommand, setComposerCommand] = useState<ComposerCommand | null>(null)
    const [sessionsLoaded, setSessionsLoaded] = useState(false)
    const [sessionSaveError, setSessionSaveError] = useState<string | null>(null)
    const [historyExpanded, setHistoryExpanded] = useState(false)
    const [presetsExpanded, setPresetsExpanded] = useState(false)
    const [isExpanded, setIsExpanded] = useState(false)
    const [showScrollToBottom, setShowScrollToBottom] = useState(false)
    const sessionsRef = useRef<AiOrganizeSession[]>([])
    const groupsRef = useRef<EditableGroup[]>([])
    const activeSessionIdRef = useRef<string | null>(null)
    const activeSnapshotIdRef = useRef<string | null>(null)
    const shouldStickToBottomRef = useRef(true)
    const transcriptRef = useRef<HTMLDivElement | null>(null)
    const composerRef = useRef<HTMLTextAreaElement | null>(null)
    const historyButtonRef = useRef<HTMLButtonElement | null>(null)
    const historyMenuRef = useRef<HTMLDivElement | null>(null)
    const presetsButtonRef = useRef<HTMLButtonElement | null>(null)
    const presetsMenuRef = useRef<HTMLDivElement | null>(null)
    const { applyAiOrganizeLayout, applyLayoutPreview, restoreLayoutPreview, markApplied } =
      useAiOrganizeLayoutPreview({ icons, layoutViewMode, onPreviewed })

    useEffect(() => {
      if (!historyExpanded && !presetsExpanded) return

      const isInside = (node: Node, elements: Array<HTMLElement | null>) =>
        elements.some(element => element?.contains(node))

      const handlePointerDown = (event: PointerEvent) => {
        const target = event.target
        if (!(target instanceof Node)) return

        if (
          historyExpanded &&
          !isInside(target, [historyButtonRef.current, historyMenuRef.current])
        ) {
          setHistoryExpanded(false)
        }

        if (
          presetsExpanded &&
          !isInside(target, [presetsButtonRef.current, presetsMenuRef.current])
        ) {
          setPresetsExpanded(false)
        }
      }

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return
        setHistoryExpanded(false)
        setPresetsExpanded(false)
      }

      document.addEventListener('pointerdown', handlePointerDown, true)
      document.addEventListener('keydown', handleKeyDown, true)
      return () => {
        document.removeEventListener('pointerdown', handlePointerDown, true)
        document.removeEventListener('keydown', handleKeyDown, true)
      }
    }, [historyExpanded, presetsExpanded])

    const iconByKey = useMemo(() => {
      const map = new Map<string, DesktopIcon>()
      icons.forEach(icon => {
        map.set(icon.id, icon)
      })
      return map
    }, [icons])

    const resolveIconName = useCallback(
      (key: string): string => {
        const icon = iconByKey.get(key)
        if (!icon) return key
        const custom = customNames[icon.path]
        return (custom && custom.trim()) || icon.name
      },
      [customNames, iconByKey]
    )

    const activeSession = useMemo(
      () => sessions.find(session => session.id === activeSessionId) ?? null,
      [activeSessionId, sessions]
    )

    const activeSnapshots = activeSession?.snapshots ?? []
    const isBusy = phase === 'loading' || phase === 'applying'

    useEffect(() => {
      sessionsRef.current = sessions
    }, [sessions])

    useEffect(() => {
      activeSessionIdRef.current = activeSessionId
    }, [activeSessionId])

    useEffect(() => {
      activeSnapshotIdRef.current = activeSnapshotId
    }, [activeSnapshotId])

    const scrollTranscriptToBottom = useCallback((behavior: 'auto' | 'smooth' = 'smooth') => {
      const transcript = transcriptRef.current
      if (!transcript) return
      shouldStickToBottomRef.current = true
      transcript.scrollTo({ top: transcript.scrollHeight, behavior })
      setShowScrollToBottom(false)
    }, [])

    const handleTranscriptScroll = useCallback(() => {
      const transcript = transcriptRef.current
      if (!transcript) return
      const isAtBottom = isNearScrollBottom(transcript)
      shouldStickToBottomRef.current = isAtBottom
      setShowScrollToBottom(!isAtBottom)
    }, [])

    const commitSessions = useCallback(
      async (
        nextSessions: AiOrganizeSession[],
        nextActiveSessionId = activeSessionIdRef.current
      ) => {
        sessionsRef.current = nextSessions
        setSessions(nextSessions)
        if (nextActiveSessionId) {
          activeSessionIdRef.current = nextActiveSessionId
          setActiveSessionId(nextActiveSessionId)
        }

        try {
          await saveAiOrganizeSessions(nextSessions)
          setSessionSaveError(null)
        } catch (e) {
          setSessionSaveError(String(e))
        }
      },
      []
    )

    const commitSession = useCallback(
      async (session: AiOrganizeSession) => {
        const nextSessions = upsertAiOrganizeSession(sessionsRef.current, session)
        await commitSessions(nextSessions, session.id)
      },
      [commitSessions]
    )

    const activateSnapshot = useCallback(
      (session: AiOrganizeSession, snapshot?: AiOrganizeSnapshot) => {
        activeSessionIdRef.current = session.id
        setActiveSessionId(session.id)
        if (!snapshot) {
          groupsRef.current = []
          activeSnapshotIdRef.current = null
          setActiveSnapshotId(null)
          setEditingSnapshotId(null)
          setGroups([])
          setPhase('idle')
          setRunId(null)
          setError(null)
          setNotConfigured(false)
          return
        }

        activeSnapshotIdRef.current = snapshot.id
        setActiveSnapshotId(snapshot.id)
        const nextGroups = toEditableGroups(snapshot.groups)
        groupsRef.current = nextGroups
        setGroups(nextGroups)
        setPhase('preview')
        setRunId(snapshot.runId ?? null)
        setError(null)
        setNotConfigured(false)
      },
      []
    )

    const activateSnapshotContextOnly = useCallback(
      (session: AiOrganizeSession, snapshot: AiOrganizeSnapshot) => {
        activeSessionIdRef.current = session.id
        activeSnapshotIdRef.current = snapshot.id
        setActiveSessionId(session.id)
        setActiveSnapshotId(snapshot.id)
        const nextGroups = toEditableGroups(snapshot.groups)
        groupsRef.current = nextGroups
        setGroups(nextGroups)
        setRunId(snapshot.runId ?? null)
        setError(null)
        setNotConfigured(false)
      },
      []
    )

    const activateSessionOnly = useCallback((session: AiOrganizeSession) => {
      activeSessionIdRef.current = session.id
      activeSnapshotIdRef.current = null
      groupsRef.current = []
      setActiveSessionId(session.id)
      setActiveSnapshotId(null)
      setEditingSnapshotId(null)
      setGroups([])
      setPhase('idle')
      setRunId(null)
      setError(null)
      setNotConfigured(false)
    }, [])

    const handleSelectSession = useCallback(
      (session: AiOrganizeSession) => {
        shouldStickToBottomRef.current = true
        setShowScrollToBottom(false)
        activateSessionOnly(session)
        setHistoryExpanded(false)
      },
      [activateSessionOnly]
    )

    const handleDeleteSession = useCallback(
      async (sessionId: string) => {
        if (isBusy) return
        const session = sessionsRef.current.find(item => item.id === sessionId)
        if (!session) return
        if (!window.confirm(translate('确定删除这个会话吗？'))) return

        const nextSessions = sessionsRef.current.filter(item => item.id !== sessionId)
        sessionsRef.current = nextSessions
        setSessions(nextSessions)
        await saveAiOrganizeSessions(nextSessions)

        if (activeSessionIdRef.current !== sessionId) return

        const nextSession = nextSessions[0] ?? null
        if (nextSession) {
          activateSessionOnly(nextSession)
          return
        }

        activeSessionIdRef.current = null
        activeSnapshotIdRef.current = null
        setActiveSessionId(null)
        setActiveSnapshotId(null)
        setEditingSnapshotId(null)
        setGroups([])
        setPhase('idle')
        setError(null)
        setNotConfigured(false)
        setRunId(null)
      },
      [activateSessionOnly, isBusy]
    )

    const handleSelectSnapshot = useCallback(
      (snapshot: AiOrganizeSnapshot) => {
        if (!activeSession) return
        const now = Date.now()
        const nextSession: AiOrganizeSession = {
          ...activeSession,
          updatedAt: now,
          activeSnapshotId: snapshot.id,
        }
        activateSnapshot(nextSession, snapshot)
        setEditingSnapshotId(null)
        void commitSession(nextSession)
      },
      [activeSession, activateSnapshot, commitSession]
    )

    const handleLayoutPreview = useCallback(
      (aiGroups: AiGroup[]) => {
        void applyLayoutPreview(aiGroups).catch(error => {
          if (isAiOrganizePreviewRefreshError(error)) {
            console.error('Failed to refresh AI organize layout preview:', error.cause)
            toast.error(translate('预览已写入但刷新失败，可关闭以恢复布局。'), {
              key: 'ai-organize-layout-preview-refresh',
              title: translate('AI 智能整理'),
            })
            return
          }

          console.error('Failed to create AI organize layout preview:', error)
          toast.error(translate('无法创建布局预览，请重试。'), {
            key: 'ai-organize-layout-preview-write',
            title: translate('AI 智能整理'),
          })
        })
      },
      [applyLayoutPreview, toast]
    )

    const handlePreviewSnapshot = useCallback(
      (snapshot: AiOrganizeSnapshot) => {
        handleSelectSnapshot(snapshot)
        handleLayoutPreview(snapshot.groups)
      },
      [handleLayoutPreview, handleSelectSnapshot]
    )

    const insertComposerCommand = useCallback(
      (command: ComposerCommand, fallbackInstruction: string) => {
        setComposerCommand(command)
        setComposerValue(current => {
          const trimmed = current.trim()
          return trimmed || fallbackInstruction
        })
        window.requestAnimationFrame(() => composerRef.current?.focus())
      },
      []
    )

    const handleInsertOrganizeCommand = useCallback(() => {
      insertComposerCommand({ kind: 'organize' }, translate('按用途整理当前图标库。'))
    }, [insertComposerCommand])

    const handleInsertEditCommand = useCallback(
      async (snapshot: AiOrganizeSnapshot) => {
        if (activeSession) {
          const nextSession: AiOrganizeSession = {
            ...activeSession,
            updatedAt: Date.now(),
            activeSnapshotId: snapshot.id,
          }
          activateSnapshotContextOnly(nextSession, snapshot)
          setEditingSnapshotId(snapshot.id)
          void commitSession(nextSession)
        }
        insertComposerCommand(
          { kind: 'edit', snapshotId: snapshot.id },
          translate('参考此版布局继续优化。')
        )
      },
      [activeSession, activateSnapshotContextOnly, commitSession, insertComposerCommand]
    )

    const handleExitEditSnapshot = useCallback((snapshotId: string) => {
      setEditingSnapshotId(current => (current === snapshotId ? null : current))
      setComposerCommand(current =>
        current?.kind === 'edit' && current.snapshotId === snapshotId ? null : current
      )
    }, [])

    const persistCurrentPreview = useCallback(
      (nextGroups: EditableGroup[]) => {
        const currentSession = sessionsRef.current.find(
          session => session.id === activeSessionIdRef.current
        )
        const currentSnapshotId = activeSnapshotIdRef.current
        if (!currentSession || !currentSnapshotId) return

        const now = Date.now()
        const nextAiGroups = toAiGroups(nextGroups)
        const nextSession: AiOrganizeSession = {
          ...currentSession,
          updatedAt: now,
          snapshots: currentSession.snapshots.map(snapshot =>
            snapshot.id === currentSnapshotId
              ? {
                  ...snapshot,
                  groups: nextAiGroups,
                  summary: summarizeGroups(nextAiGroups),
                }
              : snapshot
          ),
        }
        void commitSession(nextSession)
      },
      [commitSession]
    )

    const {
      agentEvents,
      elapsedMs,
      isStreaming,
      resetExecution,
      runChat,
      runClassification,
      runStatus,
      statusDetail,
      statusTitle,
      streamChunks,
    } = useAiOrganizeExecution({
      open,
      icons,
      customNames,
      phase,
      error,
      notConfigured,
      groups,
      sessionsRef,
      activeSessionIdRef,
      groupsRef,
      commitSession,
      activateSnapshot,
      applyLayoutPreview,
      setPhase,
      setError,
      setNotConfigured,
      setRunId,
      setEditingSnapshotId,
    })

    useEffect(() => {
      const transcript = transcriptRef.current
      if (!transcript) return
      if (!shouldStickToBottomRef.current) {
        setShowScrollToBottom(!isNearScrollBottom(transcript))
        return
      }
      transcript.scrollTop = transcript.scrollHeight
      setShowScrollToBottom(false)
    }, [activeSession?.messages.length, phase, streamChunks.length, agentEvents.length])

    useLayoutEffect(() => {
      if (!open || !visible) return
      scrollTranscriptToBottom('auto')
    }, [activeSessionId, open, scrollTranscriptToBottom, visible])

    const handleNewSession = useCallback(() => {
      shouldStickToBottomRef.current = true
      setShowScrollToBottom(false)
      const session = createAiOrganizeSession(translate('新的整理对话'))
      const nextSessions = upsertAiOrganizeSession(sessionsRef.current, session)
      sessionsRef.current = nextSessions
      setSessions(nextSessions)
      activeSessionIdRef.current = session.id
      activeSnapshotIdRef.current = null
      groupsRef.current = []
      setActiveSessionId(session.id)
      setActiveSnapshotId(null)
      setEditingSnapshotId(null)
      setGroups([])
      setComposerValue('')
      setComposerCommand(null)
      setError(null)
      setNotConfigured(false)
      setPhase('idle')
      resetExecution()
      setHistoryExpanded(false)
    }, [resetExecution])

    const restoreLayoutPreviewAfterClose = useCallback(() => {
      void restoreLayoutPreview().catch(error => {
        console.error('Failed to restore AI organize layout preview:', error)
        toast.error(translate('无法恢复 AI 整理预览，布局未被重置。'), {
          key: 'ai-organize-layout-restore',
          title: translate('AI 智能整理'),
        })
      })
    }, [restoreLayoutPreview, toast])

    useEffect(() => {
      if (
        !shouldRestoreAiOrganizeLayoutPreview({ open, visible, hasOnCollapse: Boolean(onCollapse) })
      ) {
        return
      }
      restoreLayoutPreviewAfterClose()
    }, [onCollapse, open, restoreLayoutPreviewAfterClose, visible])

    useEffect(() => {
      if (!open) return

      let active = true
      void loadAiOrganizeSessions()
        .then(loadedSessions => {
          if (!active) return
          sessionsRef.current = loadedSessions
          setSessions(loadedSessions)
          const firstSession = loadedSessions[0]
          if (firstSession) {
            activateSessionOnly(firstSession)
          } else {
            const session = createAiOrganizeSession(translate('新的整理对话'))
            sessionsRef.current = [session]
            setSessions([session])
            activeSessionIdRef.current = session.id
            activeSnapshotIdRef.current = null
            setActiveSessionId(session.id)
            setActiveSnapshotId(null)
          }
        })
        .catch(caughtError => {
          if (active) setSessionSaveError(String(caughtError))
        })
        .finally(() => {
          if (active) setSessionsLoaded(true)
        })

      return () => {
        active = false
        restoreLayoutPreviewAfterClose()
        setGroups([])
        sessionsRef.current = []
        activeSessionIdRef.current = null
        activeSnapshotIdRef.current = null
        setSessions([])
        setActiveSessionId(null)
        setActiveSnapshotId(null)
        setEditingSnapshotId(null)
        setSessionsLoaded(false)
        setSessionSaveError(null)
        setComposerValue('')
        setComposerCommand(null)
        setPresetsExpanded(false)
      }
    }, [activateSessionOnly, open, restoreLayoutPreviewAfterClose])

    const handleRenameGroup = (id: string, name: string) => {
      const nextGroups = groups.map(group =>
        group.id === id ? { ...group, folderName: name } : group
      )
      setGroups(nextGroups)
      persistCurrentPreview(nextGroups)
      if (phase === 'preview') {
        handleLayoutPreview(toAiGroups(nextGroups))
      }
    }

    const handleRemoveIcon = (groupId: string, key: string) => {
      const nextGroups = groups.map(group =>
        group.id === groupId ? { ...group, iconKeys: group.iconKeys.filter(k => k !== key) } : group
      )
      setGroups(nextGroups)
      persistCurrentPreview(nextGroups)
      if (phase === 'preview') {
        handleLayoutPreview(toAiGroups(nextGroups))
      }
    }

    const handleDropGroup = (groupId: string) => {
      const nextGroups = groups.filter(group => group.id !== groupId)
      setGroups(nextGroups)
      persistCurrentPreview(nextGroups)
      if (phase === 'preview') {
        handleLayoutPreview(toAiGroups(nextGroups))
      }
    }

    // 只有至少包含 2 个图标的分组才有意义。
    const applicableGroups = useMemo(
      () => groups.filter(group => group.iconKeys.length >= 2),
      [groups]
    )

    useAiOrganizeRunState(phase, applicableGroups.length, groups.length, onRunStateChange)

    const dispatchPrompt = useCallback(
      async (prompt: string, command?: ComposerCommand | null, label?: string) => {
        const normalizedPrompt = prompt.trim()
        if (command) {
          const instruction =
            normalizedPrompt ||
            (command.kind === 'edit'
              ? translate('参考此版布局继续优化。')
              : translate('按用途整理当前图标库。'))
          await runClassification(instruction, label ?? getComposerCommandLabel(command))
          return
        }

        await runChat(normalizedPrompt)
      },
      [runChat, runClassification]
    )

    const {
      items: queuedPrompts,
      enqueue: enqueuePrompt,
      drain: drainQueuedPrompts,
      clear: clearQueuedPrompts,
    } = useQueuedPrompts((nextPrompt: QueuedPrompt) =>
      dispatchPrompt(nextPrompt.prompt, nextPrompt.command, nextPrompt.label)
    )

    const sendPrompt = useCallback(
      (prompt: string, label?: string) => {
        const normalizedPrompt = prompt.trim()
        const command = composerCommand
        if (!normalizedPrompt && !command) return
        if (!sessionsLoaded || phase === 'applying') return
        shouldStickToBottomRef.current = true
        setShowScrollToBottom(false)
        setComposerValue('')
        setComposerCommand(null)
        if (phase === 'loading') {
          enqueuePrompt({
            id: createAiOrganizeId('queued-prompt'),
            prompt: normalizedPrompt,
            label,
            command: command ?? undefined,
          })
          return
        }
        void dispatchPrompt(normalizedPrompt, command, label).finally(drainQueuedPrompts)
      },
      [composerCommand, dispatchPrompt, drainQueuedPrompts, enqueuePrompt, phase, sessionsLoaded]
    )

    const handleComposerKeyDown = useCallback(
      (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
        const action = resolveAiOrganizeComposerKeyAction({
          key: event.key,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          isComposing: event.nativeEvent.isComposing,
          composerValue,
          hasComposerCommand: Boolean(composerCommand),
        })
        if (action === 'remove-command') {
          event.preventDefault()
          setComposerCommand(null)
          return
        }
        if (action !== 'send') return
        event.preventDefault()
        sendPrompt(composerValue)
      },
      [composerCommand, composerValue, sendPrompt]
    )

    const handleSelectPreset = useCallback((prompt: string) => {
      setComposerCommand({ kind: 'organize' })
      setComposerValue(prompt)
      setPresetsExpanded(false)
      window.requestAnimationFrame(() => composerRef.current?.focus())
    }, [])

    const handleApply = useCallback(async () => {
      if (applicableGroups.length === 0) {
        toast.info(translate('没有可应用的分组。'), {
          key: 'ai-organize',
          title: translate('AI 智能整理'),
        })
        return
      }

      setPhase('applying')
      try {
        const aiGroups: AiGroup[] = applicableGroups.map(group => ({
          folder_name: group.folderName,
          icon_keys: group.iconKeys,
          folder_size: group.folderSize,
        }))
        // 与「重置布局」一致：清空 slots/dock，交给 IconGrid 重新 hydrate。
        await applyAiOrganizeLayout(aiGroups)
        markApplied()
        if (runId) {
          await invoke('ai_organize_record_apply', { runId, groups: aiGroups }).catch(e => {
            console.warn('Failed to record AI organize apply:', e)
          })
        }
        await onApplied()
        toast.success(
          translate('已应用 AI 整理：新建 {count} 个分组文件夹。', {
            count: applicableGroups.length,
          }),
          {
            key: 'ai-organize',
            title: translate('AI 智能整理'),
          }
        )
        onClose()
      } catch (e) {
        setError(String(e))
        setPhase('preview')
      }
    }, [applicableGroups, applyAiOrganizeLayout, markApplied, onApplied, onClose, runId, toast])

    useImperativeHandle(
      ref,
      () => ({
        applyPreview: () => void handleApply(),
      }),
      [handleApply]
    )

    if (!open || !visible) return null

    const collapseOrClose = onCollapse ?? onClose
    return (
      <div
        data-ai-organize-sidebar="true"
        data-no-window-drag="true"
        className="fixed inset-0 z-[60] flex justify-end bg-black/[0.08] backdrop-blur-[1px] dark:bg-black/20"
        onPointerDown={event => event.stopPropagation()}
        onClick={event => {
          event.stopPropagation()
          if (event.target !== event.currentTarget || phase === 'applying') return
          collapseOrClose()
        }}
      >
        <motion.aside
          role="complementary"
          aria-label={translate('AI 智能整理')}
          initial={prefersReducedMotion ? false : { x: 28, opacity: 0 }}
          animate={prefersReducedMotion ? undefined : { x: 0, opacity: 1 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className={`flex h-full ${
            isExpanded ? 'w-full' : 'w-[min(460px,100vw)]'
          } flex-col overflow-hidden border-l border-border/85 bg-background/95 shadow-2xl backdrop-blur-xl`}
          onClick={event => event.stopPropagation()}
        >
          <div className="relative flex items-center justify-between border-b border-border/80 px-4 py-3.5">
            <div className="flex min-w-0 items-center gap-2">
              <div className="accent-tonal flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border">
                <Bot className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-foreground">
                  {translate('AI 智能整理')}
                </h3>
                <p className="truncate text-xs text-muted-foreground">{statusTitle}</p>
              </div>
            </div>
            <AiOrganizePanelHeaderActions
              historyButtonRef={historyButtonRef}
              historyExpanded={historyExpanded}
              isBusy={isBusy}
              isExpanded={isExpanded}
              closeDisabled={phase === 'applying'}
              historyLabel={translate('会话历史')}
              newChatLabel={translate('新对话')}
              expandLabel={translate('展开至窗口')}
              restoreLabel={translate('恢复侧栏大小')}
              closeLabel={translate(onCollapse ? '收起侧栏' : '关闭')}
              onToggleHistory={() => setHistoryExpanded(expanded => !expanded)}
              onNewSession={handleNewSession}
              onToggleExpanded={() => setIsExpanded(expanded => !expanded)}
              onClose={collapseOrClose}
            />
            <AiOrganizeHistoryMenu
              expanded={historyExpanded}
              menuRef={historyMenuRef}
              prefersReducedMotion={prefersReducedMotion}
              sessionsLoaded={sessionsLoaded}
              sessions={sessions}
              activeSessionId={activeSessionId}
              isBusy={isBusy}
              onNewSession={handleNewSession}
              onSelectSession={handleSelectSession}
              onDeleteSession={handleDeleteSession}
            />
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            <div className="relative flex h-full min-h-0 flex-col px-4">
              {sessionSaveError ? (
                <div className="shrink-0 py-2">
                  <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-200">
                    {translate('会话保存失败：{error}', { error: sessionSaveError })}
                  </div>
                </div>
              ) : null}

              <div
                ref={transcriptRef}
                onScroll={handleTranscriptScroll}
                className="min-h-0 flex-1 overflow-y-auto py-4"
              >
                <div className="space-y-3">
                  {activeSession?.messages.length ? (
                    activeSession.messages.map(message => {
                      const isUser = message.role === 'user'
                      const failed = message.status === 'failed'
                      const running = message.status === 'running'
                      const snapshotIndex =
                        !isUser && message.snapshotId
                          ? activeSnapshots.findIndex(
                              snapshot => snapshot.id === message.snapshotId
                            )
                          : -1
                      const messageSnapshot =
                        snapshotIndex >= 0 ? activeSnapshots[snapshotIndex] : null
                      return (
                        <div
                          key={message.id}
                          className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`flex max-w-[92%] flex-col ${isUser ? 'items-end' : 'items-start'}`}
                          >
                            <div
                              className={`rounded-lg border px-3 py-2 text-sm leading-5 ${
                                isUser
                                  ? 'border-primary/25 bg-primary/12 text-foreground'
                                  : failed
                                    ? 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-200'
                                    : 'border-border/80 bg-muted/35 text-foreground'
                              }`}
                            >
                              <div className="flex items-start gap-2">
                                {!isUser ? (
                                  running ? (
                                    <Loader2 className="accent-foreground mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />
                                  ) : (
                                    <MessageSquareText className="accent-foreground mt-0.5 h-3.5 w-3.5 shrink-0" />
                                  )
                                ) : null}
                                <div className="min-w-0 flex-1">
                                  <p className="whitespace-pre-wrap break-words">
                                    {message.content}
                                  </p>
                                  {message.error ? (
                                    <p className="mt-1 break-words text-xs opacity-80">
                                      {message.error}
                                    </p>
                                  ) : null}
                                  {running || (failed && message.error) ? (
                                    <AssistantRunInline
                                      status={runStatus}
                                      title={statusTitle}
                                      detail={statusDetail}
                                      elapsedMs={elapsedMs}
                                      events={agentEvents}
                                      streamChunks={streamChunks}
                                      isStreaming={isStreaming}
                                    />
                                  ) : null}
                                </div>
                              </div>
                            </div>
                            {messageSnapshot ? (
                              <AiOrganizeSnapshotPreview
                                snapshot={messageSnapshot}
                                snapshotIndex={snapshotIndex}
                                activeSnapshotId={activeSnapshotId}
                                editingSnapshotId={editingSnapshotId}
                                groups={groups}
                                phase={phase}
                                iconByKey={iconByKey}
                                resolveIconName={resolveIconName}
                                onPreviewSnapshot={handlePreviewSnapshot}
                                onInsertEditCommand={handleInsertEditCommand}
                                onExitEditSnapshot={handleExitEditSnapshot}
                                onRenameGroup={handleRenameGroup}
                                onDropGroup={handleDropGroup}
                                onRemoveIcon={handleRemoveIcon}
                              />
                            ) : null}
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
                      <div className="mb-2 flex items-center gap-2 text-foreground">
                        <Sparkles className="accent-foreground h-4 w-4" />
                        {translate('选择预设或输入要求开始整理')}
                      </div>
                      <p className="text-xs leading-5">
                        {translate('你可以先生成一版布局，再继续对话要求 AI 调整。')}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="relative shrink-0 pb-3 pt-1">
                <AnimatePresence initial={false}>
                  {showScrollToBottom ? (
                    <motion.button
                      type="button"
                      onClick={() => scrollTranscriptToBottom()}
                      aria-label={translate('滚动到底部')}
                      title={translate('滚动到底部')}
                      initial={prefersReducedMotion ? false : { opacity: 0, y: 6, scale: 0.96 }}
                      animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
                      exit={prefersReducedMotion ? undefined : { opacity: 0, y: 6, scale: 0.96 }}
                      transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
                      className="absolute -top-10 left-1/2 z-10 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border border-border/80 bg-background/95 text-muted-foreground shadow-lg backdrop-blur transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </motion.button>
                  ) : null}
                </AnimatePresence>
                <AiOrganizeComposer
                  phase={phase}
                  sessionsLoaded={sessionsLoaded}
                  composerRef={composerRef}
                  composerValue={composerValue}
                  setComposerValue={setComposerValue}
                  composerCommand={composerCommand}
                  setComposerCommand={setComposerCommand}
                  presetsExpanded={presetsExpanded}
                  setPresetsExpanded={setPresetsExpanded}
                  presetsButtonRef={presetsButtonRef}
                  presetsMenuRef={presetsMenuRef}
                  queuedPrompts={queuedPrompts}
                  clearQueuedPrompts={clearQueuedPrompts}
                  onComposerKeyDown={handleComposerKeyDown}
                  onInsertOrganizeCommand={handleInsertOrganizeCommand}
                  onSelectPreset={handleSelectPreset}
                  onSendPrompt={sendPrompt}
                />
              </div>
            </div>
          </div>
        </motion.aside>
      </div>
    )
  }
)
