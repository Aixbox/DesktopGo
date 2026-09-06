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
  MAX_REASONING_TRACE_CHARS,
  type AiOrganizeMessage,
  type AiOrganizeSession,
  type AiOrganizeSnapshot,
  type AiReasoningSegment,
  type AiToolCallRecord,
} from '@/lib/aiOrganizeSessions'
import type { DesktopIcon } from '@/types'
import { findAiRegenerateSourcePrompt } from './aiOrganizePanelInteraction'
import {
  AI_ORGANIZE_AGENT_EVENT,
  AI_RUN_CANCELLED,
  MAX_AGENT_EVENTS,
  MAX_CONVERSATION_CONTEXT_MESSAGES,
  buildAiConfigPayload,
  buildConversationPrompt,
  createAssistantMessageContent,
  getAgentEventLabel,
  isStreamPhase,
  summarizeGroups,
  type AiAgentEvent,
  type AiAgentRunResult,
  type AiChatResult,
  type AiOrganizePhase,
  type AiOrganizeRunStatus,
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
  updateMessageContent: (messageId: string, content: string) => void
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
  updateMessageContent,
  activateSnapshot,
  applyLayoutPreview,
  setPhase,
  setError,
  setNotConfigured,
  setRunId,
  setEditingSnapshotId,
}: UseAiOrganizeExecutionParams) {
  const [agentEvents, setAgentEvents] = useState<AiAgentEvent[]>([])
  const [reasoningText, setReasoningText] = useState('')
  const [streamedContentLength, setStreamedContentLength] = useState(0)
  const [reasoningActive, setReasoningActive] = useState(false)
  const [runKind, setRunKind] = useState<'chat' | 'organize' | null>(null)
  const [waitingForOutput, setWaitingForOutput] = useState(true)
  const [elapsedMs, setElapsedMs] = useState(0)
  // 多轮 agent 循环：工具调用把推理流切成多段，工具记录与段落交错渲染。
  const [reasoningSegments, setReasoningSegments] = useState<AiReasoningSegment[]>([])
  const [toolCallRecords, setToolCallRecords] = useState<AiToolCallRecord[]>([])
  const runSeqRef = useRef(0)
  const runStartedAtRef = useRef<number | null>(null)
  const activeRequestIdRef = useRef<string | null>(null)
  const runKindRef = useRef<'chat' | 'organize' | null>(null)
  const reasoningTraceRef = useRef('')
  const reasoningBufferRef = useRef('')
  const reasoningFlushTimerRef = useRef<number | null>(null)
  const reasoningFirstBufferedAtRef = useRef<number | null>(null)
  // 思考阶段计时：首条思考增量到首个可见输出（或运行结束）之间视为思考耗时。
  const reasoningStartedAtRef = useRef<number | null>(null)
  const reasoningEndedAtRef = useRef<number | null>(null)
  const reasoningSegmentsRef = useRef<AiReasoningSegment[]>([])
  const reasoningSegmentStartedAtRef = useRef<number | null>(null)
  const toolCallRecordsRef = useRef<AiToolCallRecord[]>([])
  const chatAnswerTextRef = useRef('')
  const chatAnswerBufferRef = useRef('')
  const chatAnswerFlushTimerRef = useRef<number | null>(null)
  const chatAnswerFirstBufferedAtRef = useRef<number | null>(null)
  const chatAnswerMessageIdRef = useRef<string | null>(null)

  const resetReasoningOutput = useCallback(() => {
    if (reasoningFlushTimerRef.current !== null) {
      window.clearTimeout(reasoningFlushTimerRef.current)
      reasoningFlushTimerRef.current = null
    }
    reasoningTraceRef.current = ''
    reasoningBufferRef.current = ''
    reasoningFirstBufferedAtRef.current = null
    reasoningStartedAtRef.current = null
    reasoningEndedAtRef.current = null
    setReasoningText('')
    setReasoningActive(false)
  }, [])

  // 思考结束：正文/整理 JSON 开始输出时调用，折叠思考块并记录结束时间。
  const markReasoningEnded = useCallback(() => {
    if (!reasoningStartedAtRef.current) return
    reasoningEndedAtRef.current ??= Date.now()
    setReasoningActive(false)
  }, [])

  const flushReasoningBuffer = useCallback(() => {
    if (reasoningFlushTimerRef.current !== null) {
      window.clearTimeout(reasoningFlushTimerRef.current)
      reasoningFlushTimerRef.current = null
    }
    const buffered = reasoningBufferRef.current
    if (!buffered) return
    reasoningBufferRef.current = ''
    reasoningFirstBufferedAtRef.current = null
    reasoningTraceRef.current = `${reasoningTraceRef.current}${buffered}`
    if (reasoningTraceRef.current.length > MAX_REASONING_TRACE_CHARS) {
      reasoningTraceRef.current = reasoningTraceRef.current.slice(-MAX_REASONING_TRACE_CHARS)
    }
    setReasoningText(reasoningTraceRef.current)
    setWaitingForOutput(false)
    setReasoningActive(true)
  }, [])

  const appendReasoningDelta = useCallback(
    (delta: string) => {
      reasoningStartedAtRef.current ??= Date.now()
      reasoningSegmentStartedAtRef.current ??= Date.now()
      reasoningEndedAtRef.current = null
      reasoningBufferRef.current = `${reasoningBufferRef.current}${delta}`
      reasoningFirstBufferedAtRef.current ??= Date.now()
      const buffered = reasoningBufferRef.current
      const elapsedSinceFirstDelta =
        Date.now() - (reasoningFirstBufferedAtRef.current ?? Date.now())
      const shouldCommitSoftChunk =
        buffered.length >= STREAM_FLUSH_SOFT_CHARS && /[。！？.!?\n]$/.test(buffered.trimEnd())

      if (
        buffered.length >= STREAM_FLUSH_CATCH_UP_CHARS ||
        buffered.length >= STREAM_FLUSH_MIN_CHARS ||
        shouldCommitSoftChunk ||
        elapsedSinceFirstDelta >= STREAM_FLUSH_MAX_HOLD_MS
      ) {
        flushReasoningBuffer()
        return
      }

      if (reasoningFlushTimerRef.current !== null) return
      reasoningFlushTimerRef.current = window.setTimeout(() => {
        reasoningFlushTimerRef.current = null
        flushReasoningBuffer()
      }, STREAM_FLUSH_INTERVAL_MS)
    },
    [flushReasoningBuffer]
  )

  // 整轮回复总耗时（从发出请求到收尾）；没有起始时间时省略。
  const finalizeResponseMs = useCallback((): number | undefined => {
    const startedAt = runStartedAtRef.current
    return startedAt ? Math.max(0, Date.now() - startedAt) : undefined
  }, [])

  // 工具调用边界：把当前推理流封存为一段（多轮思考的切分点）。
  const sealReasoningSegment = useCallback(() => {
    flushReasoningBuffer()
    const trace = reasoningTraceRef.current.trim()
    reasoningTraceRef.current = ''
    reasoningBufferRef.current = ''
    reasoningFirstBufferedAtRef.current = null
    const startedAt = reasoningSegmentStartedAtRef.current
    reasoningSegmentStartedAtRef.current = null
    reasoningStartedAtRef.current = null
    if (!trace) return
    const segment: AiReasoningSegment = {
      text: trace.slice(-MAX_REASONING_TRACE_CHARS),
      ms: startedAt ? Math.max(0, Date.now() - startedAt) : undefined,
    }
    reasoningSegmentsRef.current = [...reasoningSegmentsRef.current, segment].slice(-12)
    setReasoningSegments(reasoningSegmentsRef.current)
  }, [flushReasoningBuffer])

  const recordToolCall = useCallback((name: string, argsText: string) => {
    if (!name.trim()) return
    const record: AiToolCallRecord = {
      id: createAiOrganizeId('ai-tool'),
      name: name.trim(),
      argsText: argsText || undefined,
      state: 'success',
    }
    toolCallRecordsRef.current = [...toolCallRecordsRef.current, record].slice(-12)
    setToolCallRecords(toolCallRecordsRef.current)
  }, [])

  const attachToolResult = useCallback((resultText: string) => {
    const records = [...toolCallRecordsRef.current]
    const last = records[records.length - 1]
    if (!last) return
    let state: AiToolCallRecord['state'] = 'success'
    try {
      if (JSON.parse(resultText)?.ok === false) state = 'error'
    } catch {
      // 非 JSON 结果按成功处理。
    }
    records[records.length - 1] = { ...last, resultText: resultText || undefined, state }
    toolCallRecordsRef.current = records
    setToolCallRecords(records)
  }, [])

  // 工具请求 JSON 不属于回答正文：清空缓冲与消息占位，等待下一轮回答。
  const resetChatAnswerForTool = useCallback(() => {
    if (chatAnswerFlushTimerRef.current !== null) {
      window.clearTimeout(chatAnswerFlushTimerRef.current)
      chatAnswerFlushTimerRef.current = null
    }
    chatAnswerTextRef.current = ''
    chatAnswerBufferRef.current = ''
    chatAnswerFirstBufferedAtRef.current = null
    setStreamedContentLength(0)
    const messageId = chatAnswerMessageIdRef.current
    if (messageId) updateMessageContent(messageId, '')
  }, [updateMessageContent])

  // 取走思考轨迹与各类耗时（先冲刷缓冲），没有内容时字段为 undefined 以省略。
  const finalizeRun = useCallback((): {
    reasoning?: string
    reasoningMs?: number
    responseMs?: number
    reasoningSegments?: AiReasoningSegment[]
    toolCalls?: AiToolCallRecord[]
  } => {
    flushReasoningBuffer()
    sealReasoningSegment()
    markReasoningEnded()
    const segments = reasoningSegmentsRef.current
    const trace = reasoningTraceRef.current.trim()
    const reasoning =
      segments.length > 0
        ? segments
            .map(segment => segment.text)
            .join('\n\n')
            .slice(-MAX_REASONING_TRACE_CHARS) || undefined
        : trace.length > 0
          ? trace.slice(-MAX_REASONING_TRACE_CHARS)
          : undefined
    const totalSegmentMs = segments.reduce((total, segment) => total + (segment.ms ?? 0), 0)
    const reasoningMs =
      segments.length > 0
        ? totalSegmentMs > 0
          ? totalSegmentMs
          : undefined
        : reasoning && reasoningStartedAtRef.current && reasoningEndedAtRef.current
          ? Math.max(0, reasoningEndedAtRef.current - reasoningStartedAtRef.current)
          : undefined
    return {
      reasoning,
      reasoningMs,
      responseMs: finalizeResponseMs(),
      reasoningSegments: segments.length > 0 ? segments : undefined,
      toolCalls:
        toolCallRecordsRef.current.length > 0 ? [...toolCallRecordsRef.current] : undefined,
    }
  }, [flushReasoningBuffer, sealReasoningSegment, finalizeResponseMs, markReasoningEnded])

  const resetChatAnswer = useCallback(() => {
    if (chatAnswerFlushTimerRef.current !== null) {
      window.clearTimeout(chatAnswerFlushTimerRef.current)
      chatAnswerFlushTimerRef.current = null
    }
    chatAnswerTextRef.current = ''
    chatAnswerBufferRef.current = ''
    chatAnswerFirstBufferedAtRef.current = null
    setStreamedContentLength(0)
  }, [])

  const flushChatAnswerBuffer = useCallback(() => {
    if (chatAnswerFlushTimerRef.current !== null) {
      window.clearTimeout(chatAnswerFlushTimerRef.current)
      chatAnswerFlushTimerRef.current = null
    }
    const buffered = chatAnswerBufferRef.current
    if (!buffered) return
    chatAnswerBufferRef.current = ''
    chatAnswerFirstBufferedAtRef.current = null
    chatAnswerTextRef.current = `${chatAnswerTextRef.current}${buffered}`
    // 回复开始输出即视为思考结束（折叠思考块、记录耗时）。
    markReasoningEnded()
    const messageId = chatAnswerMessageIdRef.current
    if (messageId) updateMessageContent(messageId, chatAnswerTextRef.current)
    setStreamedContentLength(chatAnswerTextRef.current.length)
    setWaitingForOutput(false)
  }, [markReasoningEnded, updateMessageContent])

  const appendChatAnswerDelta = useCallback(
    (delta: string) => {
      chatAnswerBufferRef.current = `${chatAnswerBufferRef.current}${delta}`
      chatAnswerFirstBufferedAtRef.current ??= Date.now()
      const buffered = chatAnswerBufferRef.current
      const elapsedSinceFirstDelta =
        Date.now() - (chatAnswerFirstBufferedAtRef.current ?? Date.now())

      if (
        buffered.length >= STREAM_FLUSH_CATCH_UP_CHARS ||
        buffered.length >= STREAM_FLUSH_MIN_CHARS ||
        elapsedSinceFirstDelta >= STREAM_FLUSH_MAX_HOLD_MS
      ) {
        flushChatAnswerBuffer()
        return
      }

      if (chatAnswerFlushTimerRef.current !== null) return
      chatAnswerFlushTimerRef.current = window.setTimeout(() => {
        chatAnswerFlushTimerRef.current = null
        flushChatAnswerBuffer()
      }, STREAM_FLUSH_INTERVAL_MS)
    },
    [flushChatAnswerBuffer]
  )

  const resetExecution = useCallback(() => {
    setAgentEvents([])
    resetReasoningOutput()
    resetChatAnswer()
    reasoningSegmentsRef.current = []
    reasoningSegmentStartedAtRef.current = null
    setReasoningSegments([])
    toolCallRecordsRef.current = []
    setToolCallRecords([])
    chatAnswerMessageIdRef.current = null
    setWaitingForOutput(true)
    setRunId(null)
  }, [resetChatAnswer, resetReasoningOutput, setRunId])

  const beginRun = useCallback(() => {
    setError(null)
    setNotConfigured(false)
    resetExecution()
    runStartedAtRef.current = Date.now()
  }, [resetExecution, setError, setNotConfigured])

  // 请求后端取消当前运行；命令返回哨兵错误后由各 catch 分支收尾。
  const stopRun = useCallback(() => {
    const requestId = activeRequestIdRef.current
    if (!requestId) return
    void invoke('ai_cancel', { requestId }).catch(() => {})
  }, [])

  const runChat = useCallback(
    async (instruction: string) => {
      const normalizedInstruction = instruction.trim()
      if (!normalizedInstruction) return

      const sequence = runSeqRef.current + 1
      runSeqRef.current = sequence
      const isCurrentRun = () => runSeqRef.current === sequence
      const requestId = createAiOrganizeId('ai-run')
      activeRequestIdRef.current = requestId
      const now = Date.now()
      runKindRef.current = 'chat'
      setRunKind('chat')
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
      beginRun()
      // beginRun 会重置流式缓冲，目标消息 id 需要在其之后登记。
      chatAnswerMessageIdRef.current = runningMessage.id

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
                    responseMs: finalizeResponseMs(),
                  }
                : message
            ),
          }
          await commitSession(failedSession)
          setNotConfigured(true)
          setPhase('idle')
          return
        }

        const messages = runningSession.messages
          .filter(message => message.id !== runningMessage.id && message.status !== 'running')
          .slice(-MAX_CONVERSATION_CONTEXT_MESSAGES)
          .map(message => ({ role: message.role, content: message.content }))
        const result = await invoke<AiChatResult>('ai_chat', {
          config: buildAiConfigPayload(config),
          messages,
          requestId,
        })
        if (!isCurrentRun()) return

        flushChatAnswerBuffer()
        // 对话中调用了 organize_icons 工具：为本次回复创建布局快照并应用预览。
        const organizeGroups = result.groups ?? []
        const snapshot: AiOrganizeSnapshot | null =
          organizeGroups.length > 0 || (result.leftover?.length ?? 0) > 0
            ? {
                id: createAiOrganizeId('ai-snapshot'),
                createdAt: Date.now(),
                prompt: normalizedInstruction,
                groups: organizeGroups,
                leftover: result.leftover ?? [],
                runId: result.run_id ?? requestId,
                summary: summarizeGroups(organizeGroups),
              }
            : null
        const successSession: AiOrganizeSession = {
          ...runningSession,
          updatedAt: Date.now(),
          activeSnapshotId: snapshot?.id ?? runningSession.activeSnapshotId,
          snapshots: snapshot
            ? [...runningSession.snapshots, snapshot].slice(-12)
            : runningSession.snapshots,
          messages: runningSession.messages.map(message =>
            message.id === runningMessage.id
              ? {
                  ...message,
                  content: result.content,
                  status: 'success',
                  runId: snapshot ? (result.run_id ?? requestId) : message.runId,
                  snapshotId: snapshot?.id ?? message.snapshotId,
                  ...finalizeRun(),
                }
              : message
          ),
        }
        await commitSession(successSession)
        if (snapshot) {
          setRunId(result.run_id ?? requestId)
          activateSnapshot(successSession, snapshot)
          await applyLayoutPreview(organizeGroups)
        } else {
          setPhase(groupsRef.current.length > 0 ? 'preview' : 'idle')
        }
      } catch (caughtError) {
        if (!isCurrentRun()) return
        flushChatAnswerBuffer()
        const message = String(caughtError)
        if (message === AI_RUN_CANCELLED) {
          // 用户停止生成：保留已流式输出的部分内容，不算失败。
          await commitSession({
            ...runningSession,
            updatedAt: Date.now(),
            messages: runningSession.messages.map(currentMessage =>
              currentMessage.id === runningMessage.id
                ? {
                    ...currentMessage,
                    content: chatAnswerTextRef.current.trim() || translate(AI_RUN_CANCELLED),
                    status: 'success',
                    ...finalizeRun(),
                  }
                : currentMessage
            ),
          })
          setPhase(groupsRef.current.length > 0 ? 'preview' : 'idle')
          return
        }
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
                  ...finalizeRun(),
                }
              : currentMessage
          ),
        })
        setError(message)
        setPhase(groupsRef.current.length > 0 ? 'preview' : 'idle')
      }
    },
    [
      activeSessionIdRef,
      activateSnapshot,
      applyLayoutPreview,
      beginRun,
      commitSession,
      finalizeRun,
      finalizeResponseMs,
      flushChatAnswerBuffer,
      groupsRef,
      sessionsRef,
      setError,
      setNotConfigured,
      setPhase,
      setRunId,
      setRunKind,
    ]
  )

  const runClassification = useCallback(
    async (instruction: string, promptLabel?: string) => {
      const normalizedInstruction = instruction.trim()
      if (!normalizedInstruction) return

      const sequence = runSeqRef.current + 1
      runSeqRef.current = sequence
      const isCurrentRun = () => runSeqRef.current === sequence
      const requestId = createAiOrganizeId('ai-run')
      activeRequestIdRef.current = requestId
      const now = Date.now()
      runKindRef.current = 'organize'
      setRunKind('organize')
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
      beginRun()

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
                    responseMs: finalizeResponseMs(),
                  }
                : message
            ),
          }
          await commitSession(failedSession)
          setNotConfigured(true)
          setPhase('idle')
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
                    responseMs: finalizeResponseMs(),
                  }
                : message
            ),
          }
          await commitSession(emptySession)
          activateSnapshot(emptySession, snapshot)
          setEditingSnapshotId(snapshot.id)
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
          requestId,
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
                  ...finalizeRun(),
                }
              : message
          ),
        }
        await commitSession(successSession)
        setRunId(result.run_id)
        activateSnapshot(successSession, snapshot)
        setEditingSnapshotId(snapshot.id)
        if (result.groups.length > 0) await applyLayoutPreview(result.groups)
      } catch (caughtError) {
        if (!isCurrentRun()) return
        const message = String(caughtError)
        if (message === AI_RUN_CANCELLED) {
          // 用户停止整理：没有可用的分组结果，仅保留思考轨迹。
          await commitSession({
            ...runningSession,
            updatedAt: Date.now(),
            messages: runningSession.messages.map(currentMessage =>
              currentMessage.id === runningMessage.id
                ? {
                    ...currentMessage,
                    content: translate(AI_RUN_CANCELLED),
                    status: 'success',
                    ...finalizeRun(),
                  }
                : currentMessage
            ),
          })
          setPhase(groupsRef.current.length > 0 ? 'preview' : 'idle')
          return
        }
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
                  ...finalizeRun(),
                }
              : currentMessage
          ),
        })
        setError(message)
        setPhase('idle')
      }
    },
    [
      activeSessionIdRef,
      activateSnapshot,
      applyLayoutPreview,
      beginRun,
      commitSession,
      customNames,
      finalizeRun,
      finalizeResponseMs,
      groupsRef,
      icons,
      sessionsRef,
      setEditingSnapshotId,
      setError,
      setNotConfigured,
      setPhase,
      setRunId,
      setRunKind,
    ]
  )

  // 重新生成：重发该条回复对应的上一条用户消息（ChatGPT 的 regenerate 行为）。
  const regenerateMessage = useCallback(
    (message: AiOrganizeMessage) => {
      if (phase === 'loading' || phase === 'applying') return
      const sessionId = activeSessionIdRef.current
      const session = sessionsRef.current.find(item => item.id === sessionId)
      if (!session) return
      const previousUser = findAiRegenerateSourcePrompt(session.messages, message.id)
      if (!previousUser) return
      if (message.snapshotId) {
        void runClassification(previousUser.content)
      } else {
        void runChat(previousUser.content)
      }
    },
    [activeSessionIdRef, phase, runChat, runClassification, sessionsRef]
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
        if (payload.phase === 'reasoningToken') {
          if (payload.token) appendReasoningDelta(payload.token)
          return
        }
        if (payload.phase === 'token') {
          if (runKindRef.current === 'chat') {
            if (payload.token) appendChatAnswerDelta(payload.token)
          } else {
            // 整理路径：正文 JSON 开始输出即视为思考结束。
            markReasoningEnded()
          }
          return
        }
        if (payload.phase === 'toolCall') {
          // 多轮循环的边界：封存当前思考段、登记工具调用、清空工具请求 JSON 的正文占位。
          sealReasoningSegment()
          recordToolCall(payload.toolName ?? '', payload.detail ?? '')
          if (runKindRef.current === 'chat') resetChatAnswerForTool()
          return
        }
        if (payload.phase === 'toolResult') {
          attachToolResult(payload.detail ?? '')
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
      })

    return () => {
      active = false
      runSeqRef.current += 1
      unlisten?.()
      resetExecution()
      activeRequestIdRef.current = null
      runKindRef.current = null
      setRunKind(null)
      setPhase('idle')
      setError(null)
      setNotConfigured(false)
    }
  }, [
    appendChatAnswerDelta,
    appendReasoningDelta,
    attachToolResult,
    markReasoningEnded,
    open,
    recordToolCall,
    resetChatAnswerForTool,
    resetExecution,
    sealReasoningSegment,
    setError,
    setNotConfigured,
    setPhase,
    setRunId,
  ])

  // 生成期间在回复顶部实时计时：每 tick 读取起始时间 ref，兼容 beginRun 稍晚于 phase 切换。
  useEffect(() => {
    if (phase !== 'loading') return
    const tick = () => {
      const startedAt = runStartedAtRef.current
      if (startedAt) setElapsedMs(Math.max(0, Date.now() - startedAt))
    }
    tick()
    const intervalId = window.setInterval(tick, 500)
    return () => window.clearInterval(intervalId)
  }, [phase])

  const latestEvent = useMemo(() => {
    for (let index = agentEvents.length - 1; index >= 0; index -= 1) {
      const event = agentEvents[index]
      if (!isStreamPhase(event.phase)) return event
    }
    return null
  }, [agentEvents])
  const isStreaming = phase === 'loading'
  const isChatRun = runKind === 'chat'
  // 聊天正文正在流式输出（思考已结束），用于打字光标。
  const isAnswerStreaming = isStreaming && isChatRun && !waitingForOutput

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
        if (isStreaming) {
          return isChatRun ? translate('正在回复') : translate('模型正在流式生成草稿')
        }
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
  }, [isChatRun, isStreaming, latestEvent, runStatus])

  return {
    activeRunKind: runKind,
    elapsedMs,
    isAnswerStreaming,
    reasoningActive,
    // 多轮 agent 循环的分段推理与工具记录（仅运行中；完成后随消息持久化）。
    reasoningSegments,
    reasoningText,
    regenerateMessage,
    resetExecution,
    runChat,
    runClassification,
    // 聊天正文流式长度：驱动对话区跟随滚动。
    streamedContentLength,
    statusTitle,
    stopRun,
    toolCallRecords,
    waitingForOutput,
  }
}
