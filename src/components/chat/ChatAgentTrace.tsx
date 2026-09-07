import { Fragment, useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChainOfThought } from './ChainOfThought'
import { ChatToolRecord } from './ChatTool'
import type { AiReasoningSegment, AiToolCallRecord } from '@/lib/aiOrganizeSessions'
import { formatAiDuration } from '@/components/ai/aiOrganizePanelModel'
import { translate } from '@/lib/i18n'
import { ChevronDown } from 'lucide-react'

interface ChatAgentTraceProps {
  messageKey: string
  /** 已封存的推理分段（含每段耗时）。 */
  segments: AiReasoningSegment[]
  toolCalls: AiToolCallRecord[]
  /** 当前正在流式输出的思考段文本（仅运行中）；旧会话为整段思考轨迹。 */
  streamingText: string
  streaming: boolean
  running: boolean
  responseMs?: number
}

/**
 * 多轮 agent 循环的交错时间线：思考段与工具调用行按发生顺序交替排列，
 * 与主流 AI 会话（思考 → 工具 → 思考 → 回答）的表现一致。
 */
export function ChatAgentTrace({
  messageKey,
  segments,
  toolCalls,
  streamingText,
  streaming,
  running,
  responseMs,
}: ChatAgentTraceProps) {
  const hasStreamingText = Boolean(streamingText.trim())
  const prefersReducedMotion = useReducedMotion()
  const [expanded, setExpanded] = useState(running)

  useEffect(() => {
    if (running) return
    const frame = window.requestAnimationFrame(() => setExpanded(false))
    return () => window.cancelAnimationFrame(frame)
  }, [running])

  return (
    <div className="space-y-1 text-sm leading-5 text-foreground">
      {responseMs ? (
        <>
          <button
            type="button"
            onClick={() => setExpanded(current => !current)}
            aria-expanded={expanded}
            className="-mx-1 flex items-center gap-1 rounded px-1 py-0.5 text-sm font-normal leading-5 text-muted-foreground transition-colors hover:text-foreground"
          >
            <span>{running ? translate('进行中') : translate('用时 {time}', { time: formatAiDuration(responseMs) })}</span>
            <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
          <div className="mt-1 border-b-2 border-border/70" aria-hidden="true" />
        </>
      ) : null}
      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            key="agent-trace-content"
            initial={prefersReducedMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={prefersReducedMotion ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="w-full overflow-hidden"
          >
          {segments.map((segment, index) => (
            <Fragment key={`segment-${messageKey}-${index}`}>
              <ChainOfThought text={segment.text} defaultOpen />
              {toolCalls[index] ? (
                <ChatToolRecord
                  record={toolCalls[index]}
                  pending={running && index === toolCalls.length - 1 && !toolCalls[index].resultText}
                />
              ) : null}
            </Fragment>
          ))}
          {hasStreamingText ? <ChainOfThought text={streamingText} streaming={streaming} defaultOpen /> : null}
          {toolCalls.length > segments.length
            ? toolCalls.slice(segments.length).map(record => (
                <ChatToolRecord key={record.id} record={record} pending={running && !record.resultText} />
              ))
            : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
