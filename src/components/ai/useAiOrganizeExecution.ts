import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { translate } from '@/lib/i18n'
import { isAiConfigReady, loadAiConfig } from '@/lib/aiConfigStore'
import { buildAiIconInputs, type AiGroup } from '@/lib/aiOrganize'
import {
  createAiOrganizeId,
  createAiOrganizeSession,
  createAiOrganizeSessionTitle,
  type AiOrganizeMessage,
  type AiOrganizeSession,
  type AiOrganizeSnapshot,
} from '@/lib/aiOrganizeSessions'
import type { DesktopIcon } from '@/types'
import {
  AI_ORGANIZE_AGENT_EVENT,
  MAX_AGENT_EVENTS,
  MAX_CONVERSATION_CONTEXT_MESSAGES,
  MAX_STREAM_CHUNKS,
  buildAiConfigPayload,
  buildConversationPrompt,
  createAssistantMessageContent,
  getAgentEventLabel,
  summarizeGroups,
  type AiAgentEvent,
  type AiAgentRunResult,
  type AiChatResult,
  type AiOrganizePhase,
  type AiOrganizeRunStatus,
  type AiStreamChunk,
  type EditableAiGroup,
} from './aiOrganizePanelModel'

const STREAM_FLUSH_INTERVAL_MS = 48
const STREAM_FLUSH_SOFT_CHARS = 56
const STREAM_FLUSH_MIN_CHARS = 280
const STREAM_FLUSH_CATCH_UP_CHARS = 1200
const STREAM_FLUSH_MAX_HOLD_MS = 180

interface UseAiOrganizeExecutionParams {
  open: boolean
  icons: DesktopIcon[]
  customNames: Record<string, string>
  phase: AiOrganizePhase
  error: string | null
  notConfigured: boolean
  groups: EditableAiGroup[]
  sessionsRef: MutableRefObject<AiOrganizeSession[]>
  activeSessionIdRef: MutableRefObject<string | null>
  groupsRef: MutableRefObject<EditableAiGroup[]>
  commitSession: (session: AiOrganizeSession) => Promise<void>
  activateSnapshot: (session: AiOrganizeSession, snapshot?: AiOrganizeSnapshot) => void
  applyLayoutPreview: (groups: AiGroup[]) => Promise<void>
  setPhase: Dispatch<SetStateAction<AiOrganizePhase>>
  setError: Dispatch<SetStateAction<string | null>>
  setNotConfigured: Dispatch<SetStateAction<boolean>>
  setRunId: Dispatch<SetStateAction<string | null>>
  setEditingSnapshotId: Dispatch<SetStateAction<string | null>>
}

export function useAiOrganizeExecution({
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
}: UseAiOrganizeExecutionParams) {
  const [agentEvents, setAgentEvents] = useState<AiAgentEvent[]>([])
  const [streamChunks, setStreamChunks] = useState<AiStreamChunk[]>([])
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null)
  const [runFinishedAt, setRunFinishedAt] = useState<number | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const runSeqRef = useRef(0)
  const streamChunkSeqRef = useRef(0)
  const streamBufferRef = useRef('')
  const streamFlushTimerRef = useRef<number | null>(null)
  const streamFirstBufferedAtRef = useRef<number | null>(null)

  const clearStreamFlushTimer = useCallback(() => {
    if (streamFlushTimerRef.current === null) return
    window.clearTimeout(streamFlushTimerRef.current)
    streamFlushTimerRef.current = null
  }, [])

  const flushStreamBuffer = useCallback(() => {
    const buffered = streamBufferRef.current
    if (!buffered) return
    streamBufferRef.current = ''
    streamFirstBufferedAtRef.current = null
    streamChunkSeqRef.current += 1
    const nextChunk: AiStreamChunk = {
      id: streamChunkSeqRef.current,
      text: buffered,
    }
    setStreamChunks(currentChunks => [...currentChunks, nextChunk].slice(-MAX_STREAM_CHUNKS))
  }, [])

  const flushPendingStream = useCallback(() => {
    clearStreamFlushTimer()
    flushStreamBuffer()
  }, [clearStreamFlushTimer, flushStreamBuffer])

  const resetStreamOutput = useCallback(() => {
    clearStreamFlushTimer()
    streamChunkSeqRef.current = 0
    streamBufferRef.current = ''
    streamFirstBufferedAtRef.current = null
    setStreamChunks([])
  }, [clearStreamFlushTimer])

  const resetExecution = useCallback(() => {
    setAgentEvents([])
    resetStreamOutput()
    setRunId(null)
    setRunStartedAt(null)
    setRunFinishedAt(null)
    setElapsedMs(0)
  }, [resetStreamOutput, setRunId])

  const appendStreamDelta = useCallback(
    (delta: string) => {
      streamBufferRef.current = `${streamBufferRef.current}${delta}`
      streamFirstBufferedAtRef.current ??= Date.now()
      const buffered = streamBufferRef.current
      const elapsedSinceFirstDelta = Date.now() - streamFirstBufferedAtRef.current
      const shouldCommitSoftChunk =
        buffered.length >= STREAM_FLUSH_SOFT_CHARS && /[\n,}\]]$/.test(buffered.trimEnd())

      if (
        buffered.length >= STREAM_FLUSH_CATCH_UP_CHARS ||
        buffered.length >= STREAM_FLUSH_MIN_CHARS ||
        shouldCommitSoftChunk ||
        elapsedSinceFirstDelta >= STREAM_FLUSH_MAX_HOLD_MS
      ) {
        flushPendingStream()
        return
      }

      if (streamFlushTimerRef.current !== null) return
      streamFlushTimerRef.current = window.setTimeout(() => {
        streamFlushTimerRef.current = null
        flushStreamBuffer()
      }, STREAM_FLUSH_INTERVAL_MS)
    },
    [flushPendingStream, flushStreamBuffer]
  )

  const beginRun = useCallback(
    (startedAt: number) => {
      setError(null)
      setNotConfigured(false)
      resetExecution()
      setRunStartedAt(startedAt)
    },
    [resetExecution, setError, setNotConfigured]
  )

  const runChat = useCallback(
    async (instruction: string) => {
      const normalizedInstruction = instruction.trim()
      if (!normalizedInstruction) return

      const sequence = runSeqRef.current + 1
      runSeqRef.current = sequence
      const isCurrentRun = () => runSeqRef.current === sequence
      const now = Date.now()
      const existingSession =
        sessionsRef.current.find(session => session.id === activeSessionIdRef.current) ?? null
      const session =
        existingSession ??
        createAiOrganizeSession(createAiOrganizeSessionTitle(normalizedInstruction, now))
      const userMessage: AiOrganizeMessage = {
        id: createAiOrganizeId('ai-message'),
        role: 'user',
        content: normalizedInstruction,
        createdAt: now,
        status: 'success',
      }
      const runningMessage: AiOrganizeMessage = {
        id: createAiOrganizeId('ai-message'),
        role: 'assistant',
        content: translate('正在回复...'),
        createdAt: now + 1,
        status: 'running',
      }
      const runningSession: AiOrganizeSession = {
        ...session,
        title:
          session.messages.length === 0 && session.snapshots.length === 0
            ? createAiOrganizeSessionTitle(normalizedInstruction, now)
            : session.title,
        updatedAt: now,
        messages: [...session.messages, userMessage, runningMessage],
      }

      setPhase('loading')
      await commitSession(runningSession)
      beginRun(now)

      try {
        const config = await loadAiConfig()
        if (!isCurrentRun()) return

        if (!isAiConfigReady(config)) {
          const failedSession: AiOrganizeSession = {
            ...runningSession,
            updatedAt: Date.now(),
            messages: runningSession.messages.map(message =>
              message.id === runningMessage.id
                ? {
                    ...message,
                    content: translate('AI 配置不完整，请先到设置页填写接口地址、密钥和模型。'),
                    status: 'failed',
                    error: translate('AI 配置不完整'),
                  }
                : message
            ),
          }
          await commitSession(failedSession)
          setNotConfigured(true)
          setPhase('idle')
          setRunFinishedAt(Date.now())
          return
        }

        const messages = runningSession.messages
          .filter(message => message.id !== runningMessage.id && message.status !== 'running')
          .slice(-MAX_CONVERSATION_CONTEXT_MESSAGES)
          .map(message => ({ role: message.role, content: message.content }))
        const result = await invoke<AiChatResult>('ai_chat', {
          config: buildAiConfigPayload(config),
          messages,
        })
        if (!isCurrentRun()) return

        await commitSession({
          ...runningSession,
          updatedAt: Date.now(),
          messages: runningSession.messages.map(message =>
            message.id === runningMessage.id
              ? { ...message, content: result.content, status: 'success' }
              : message
          ),
        })
        setPhase(groupsRef.current.length > 0 ? 'preview' : 'idle')
        setRunFinishedAt(Date.now())
      } catch (caughtError) {
        if (!isCurrentRun()) return
        const message = String(caughtError)
        await commitSession({
          ...runningSession,
          updatedAt: Date.now(),
          messages: runningSession.messages.map(currentMessage =>
            currentMessage.id === runningMessage.id
              ? {
                  ...currentMessage,
                  content: translate('这次回复失败了，可以稍后重试。'),
                  status: 'failed',
                  error: message,
                }
              : currentMessage
          ),
        })
        setError(message)
        setPhase(groupsRef.current.length > 0 ? 'preview' : 'idle')
        setRunFinishedAt(Date.now())
      }
    },
    [
      activeSessionIdRef,
      beginRun,
      commitSession,
      groupsRef,
      sessionsRef,
      setError,
      setNotConfigured,
      setPhase,
    ]
  )

  const runClassification = useCallback(
    async (instruction: string, promptLabel?: string) => {
      const normalizedInstruction = instruction.trim()
      if (!normalizedInstruction) return

      const sequence = runSeqRef.current + 1
      runSeqRef.current = sequence
      const isCurrentRun = () => runSeqRef.current === sequence
      const now = Date.now()
      const existingSession =
        sessionsRef.current.find(session => session.id === activeSessionIdRef.current) ?? null
      const session =
        existingSession ??
        createAiOrganizeSession(createAiOrganizeSessionTitle(normalizedInstruction, now))
      const userMessage: AiOrganizeMessage = {
        id: createAiOrganizeId('ai-message'),
        role: 'user',
        content: normalizedInstruction,
        createdAt: now,
        status: 'success',
      }
      const runningMessage: AiOrganizeMessage = {
        id: createAiOrganizeId('ai-message'),
        role: 'assistant',
        content: translate('正在根据你的要求生成新的整理预览...'),
        createdAt: now + 1,
        status: 'running',
      }
      const runningSession: AiOrganizeSession = {
        ...session,
        title:
          session.messages.length === 0 && session.snapshots.length === 0
            ? createAiOrganizeSessionTitle(normalizedInstruction, now)
            : session.title,
        updatedAt: now,
        messages: [...session.messages, userMessage, runningMessage],
      }

      setPhase('loading')
      await commitSession(runningSession)
      beginRun(now)

      try {
        const config = await loadAiConfig()
        if (!isCurrentRun()) return

        if (!isAiConfigReady(config)) {
          const failedSession: AiOrganizeSession = {
            ...runningSession,
            updatedAt: Date.now(),
            messages: runningSession.messages.map(message =>
              message.id === runningMessage.id
                ? {
                    ...message,
                    content: translate('AI 配置不完整，请先到设置页填写接口地址、密钥和模型。'),
                    status: 'failed',
                    error: translate('AI 配置不完整'),
                  }
                : message
            ),
          }
          await commitSession(failedSession)
          setNotConfigured(true)
          setPhase('idle')
          setRunFinishedAt(Date.now())
          return
        }

        const inputs = buildAiIconInputs(icons, customNames)
        if (inputs.length === 0) {
          const snapshot: AiOrganizeSnapshot = {
            id: createAiOrganizeId('ai-snapshot'),
            createdAt: Date.now(),
            prompt: normalizedInstruction,
            groups: [],
            leftover: [],
            summary: translate('没有可整理的图标。'),
          }
          const emptySession: AiOrganizeSession = {
            ...runningSession,
            updatedAt: Date.now(),
            activeSnapshotId: snapshot.id,
            snapshots: [...runningSession.snapshots, snapshot],
            messages: runningSession.messages.map(message =>
              message.id === runningMessage.id
                ? {
                    ...message,
                    content: translate('当前没有可整理的图标。'),
                    status: 'success',
                    snapshotId: snapshot.id,
                  }
                : message
            ),
          }
          await commitSession(emptySession)
          activateSnapshot(emptySession, snapshot)
          setEditingSnapshotId(snapshot.id)
          setRunFinishedAt(Date.now())
          return
        }

        const prompt = buildConversationPrompt({
          basePrompt: config.customPrompt,
          instruction: normalizedInstruction,
          session: runningSession,
          currentGroups: groupsRef.current,
        })
        const result = await invoke<AiAgentRunResult>('ai_organize_icons_agent', {
          config: buildAiConfigPayload(config, prompt),
          icons: inputs,
        })
        if (!isCurrentRun()) return

        const snapshot: AiOrganizeSnapshot = {
          id: createAiOrganizeId('ai-snapshot'),
          createdAt: Date.now(),
          prompt: normalizedInstruction,
          groups: result.groups,
          leftover: result.leftover,
          runId: result.run_id,
          summary: summarizeGroups(result.groups),
        }
        const successSession: AiOrganizeSession = {
          ...runningSession,
          updatedAt: Date.now(),
          activeSnapshotId: snapshot.id,
          snapshots: [...runningSession.snapshots, snapshot].slice(-12),
          messages: runningSession.messages.map(message =>
            message.id === runningMessage.id
              ? {
                  ...message,
                  content: createAssistantMessageContent(result.groups.length, promptLabel),
                  status: 'success',
                  runId: result.run_id,
                  snapshotId: snapshot.id,
                }
              : message
          ),
        }
        await commitSession(successSession)
        setRunId(result.run_id)
        activateSnapshot(successSession, snapshot)
        setEditingSnapshotId(snapshot.id)
        if (result.groups.length > 0) await applyLayoutPreview(result.groups)
        flushPendingStream()
        setRunFinishedAt(Date.now())
      } catch (caughtError) {
        if (!isCurrentRun()) return
        flushPendingStream()
        const message = String(caughtError)
        await commitSession({
          ...runningSession,
          updatedAt: Date.now(),
          messages: runningSession.messages.map(currentMessage =>
            currentMessage.id === runningMessage.id
              ? {
                  ...currentMessage,
                  content: translate('这次请求失败了，可以调整要求后重试。'),
                  status: 'failed',
                  error: message,
                }
              : currentMessage
          ),
        })
        setError(message)
        setPhase('idle')
        setRunFinishedAt(Date.now())
        setAgentEvents(current => {
          if (current.some(event => event.phase === 'failed')) return current
          const lastEvent = current[current.length - 1]
          return [
            ...current,
            {
              runId: lastEvent?.runId ?? `local-${Date.now()}`,
              phase: 'failed',
              message: 'AI Agent 请求失败。',
              detail: message,
              at: Math.floor(Date.now() / 1000),
            },
          ].slice(-MAX_AGENT_EVENTS)
        })
      }
    },
    [
      activeSessionIdRef,
      activateSnapshot,
      applyLayoutPreview,
      beginRun,
      commitSession,
      customNames,
      flushPendingStream,
      groupsRef,
      icons,
      sessionsRef,
      setEditingSnapshotId,
      setError,
      setNotConfigured,
      setPhase,
      setRunId,
    ]
  )

  useEffect(() => {
    if (!open) return
    let active = true
    let unlisten: (() => void) | null = null

    void getCurrentWindow()
      .listen<AiAgentEvent>(AI_ORGANIZE_AGENT_EVENT, event => {
        if (!active) return
        const payload = event.payload
        setRunId(current => current ?? payload.runId)
        if (payload.phase === 'token') {
          if (payload.token) appendStreamDelta(payload.token)
          return
        }
        setAgentEvents(current => [...current, payload].slice(-MAX_AGENT_EVENTS))
      })
      .then(fn => {
        if (!active) fn()
        else unlisten = fn
      })
      .catch(caughtError => {
        if (!active) return
        setError(String(caughtError))
        setPhase('idle')
        setRunFinishedAt(Date.now())
      })

    return () => {
      active = false
      runSeqRef.current += 1
      unlisten?.()
      resetExecution()
      setPhase('idle')
      setError(null)
      setNotConfigured(false)
    }
  }, [appendStreamDelta, open, resetExecution, setError, setNotConfigured, setPhase, setRunId])

  useEffect(() => {
    if (!runStartedAt) return
    const syncElapsed = () => setElapsedMs((runFinishedAt ?? Date.now()) - runStartedAt)
    syncElapsed()
    if (runFinishedAt) return
    const intervalId = window.setInterval(syncElapsed, 500)
    return () => window.clearInterval(intervalId)
  }, [runFinishedAt, runStartedAt])

  const latestEvent = useMemo(() => {
    for (let index = agentEvents.length - 1; index >= 0; index -= 1) {
      const event = agentEvents[index]
      if (event.phase !== 'token') return event
    }
    return null
  }, [agentEvents])
  const isStreaming = phase === 'loading'

  const runStatus = useMemo<AiOrganizeRunStatus>(() => {
    if (phase === 'applying') return 'applying'
    if (error) return 'failed'
    if (notConfigured) return 'notConfigured'
    if (phase === 'loading') return 'running'
    if (phase === 'preview' && groups.length > 0) return 'success'
    if (phase === 'preview') return 'empty'
    return 'idle'
  }, [error, groups.length, notConfigured, phase])

  const statusTitle = useMemo(() => {
    switch (runStatus) {
      case 'running':
        if (isStreaming) return translate('模型正在流式生成草稿')
        return latestEvent ? getAgentEventLabel(latestEvent) : translate('正在准备 AI 请求')
      case 'success':
        return translate('请求成功')
      case 'failed':
        return translate('请求失败')
      case 'notConfigured':
        return translate('AI 配置不完整')
      case 'empty':
        return translate('没有可用分组')
      case 'applying':
        return translate('正在应用整理结果')
      default:
        return translate('等待开始')
    }
  }, [isStreaming, latestEvent, runStatus])

  const statusDetail = useMemo(() => {
    switch (runStatus) {
      case 'running':
        if (isStreaming) {
          return translate('正在接收模型的原始 JSON 流，分组预览会在解析成功后出现。')
        }
        return latestEvent?.detail ?? translate('请求正在进行，窗口保持打开即可继续接收状态。')
      case 'success':
        return translate('请求成功，已生成 {count} 个可预览分组。', {
          count: groups.length,
        })
      case 'failed':
        return error ?? latestEvent?.detail ?? translate('请求没有完成，请检查模型配置或网关日志。')
      case 'notConfigured':
        return translate('请先到「设置 → AI 助手」填写接口地址、密钥和模型。')
      case 'empty':
        return translate('请求完成，但没有生成可用分组。')
      case 'applying':
        return translate('正在写入桌面布局并刷新启动台。')
      default:
        return translate('等待 AI Agent 开始处理。')
    }
  }, [error, groups.length, isStreaming, latestEvent, runStatus])

  return {
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
  }
}
