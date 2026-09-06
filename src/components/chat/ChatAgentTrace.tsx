import { Fragment } from 'react'
import { ChainOfThought } from './ChainOfThought'
import { ChatToolRecord } from './ChatTool'
import type { AiReasoningSegment, AiToolCallRecord } from '@/lib/aiOrganizeSessions'

interface ChatAgentTraceProps {
  messageKey: string
  /** 已封存的推理分段（含每段耗时）。 */
  segments: AiReasoningSegment[]
  toolCalls: AiToolCallRecord[]
  /** 当前正在流式输出的思考段文本（仅运行中）；旧会话为整段思考轨迹。 */
  streamingText: string
  streaming: boolean
  running: boolean
  /** streamingText 对应的思考耗时（旧会话回退展示用）。 */
  streamingReasoningMs?: number
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
  streamingReasoningMs = 0,
}: ChatAgentTraceProps) {
  const hasStreamingText = Boolean(streamingText.trim())

  return (
    <>
      {segments.map((segment, index) => (
        <Fragment key={`segment-${messageKey}-${index}`}>
          <ChainOfThought text={segment.text} reasoningMs={segment.ms} />
          {toolCalls[index] ? (
            <ChatToolRecord
              record={toolCalls[index]}
              pending={running && index === toolCalls.length - 1 && !toolCalls[index].resultText}
            />
          ) : null}
        </Fragment>
      ))}
      {hasStreamingText ? (
        <ChainOfThought
          text={streamingText}
          streaming={streaming}
          reasoningMs={streamingReasoningMs}
        />
      ) : null}
      {toolCalls.length > segments.length
        ? toolCalls
            .slice(segments.length)
            .map(record => (
              <ChatToolRecord
                key={record.id}
                record={record}
                pending={running && !record.resultText}
              />
            ))
        : null}
    </>
  )
}
