import { useEffect, useRef } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { NativeScrollArea } from '@/components/ui/native-scroll-area'
import { translate } from '@/lib/i18n'
import {
  formatElapsed,
  getAgentEventLabel,
  type AiAgentEvent,
  type AiOrganizeRunStatus,
  type AiStreamChunk,
} from './aiOrganizePanelModel'

interface AiOrganizeRunInlineProps {
  status: AiOrganizeRunStatus
  title: string
  detail?: string
  elapsedMs: number
  events: AiAgentEvent[]
  streamChunks: AiStreamChunk[]
  isStreaming: boolean
}

export function AiOrganizeRunInline({
  status,
  title,
  detail,
  elapsedMs,
  events,
  streamChunks,
  isStreaming,
}: AiOrganizeRunInlineProps) {
  const outputRef = useRef<HTMLDivElement | null>(null)
  const prefersReducedMotion = useReducedMotion()
  const latestUsage = [...events].reverse().find(event => event.usage)?.usage
  const visibleEvents = events.filter(event => event.phase !== 'token').slice(-4)
  const hasStreamOutput = streamChunks.length > 0

  useEffect(() => {
    const output = outputRef.current
    if (!output) return
    output.scrollTop = output.scrollHeight
  }, [streamChunks])

  return (
    <div
      aria-live="polite"
      className="mt-3 space-y-2 rounded-lg border border-border/70 bg-background/70 p-2.5 text-xs"
    >
      <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
        {status === 'failed' ? (
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-300" />
        ) : status === 'success' ? (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-300" />
        ) : (
          <Loader2 className="accent-foreground h-3.5 w-3.5 shrink-0 animate-spin" />
        )}
        <span className="font-medium text-foreground">{title}</span>
        {elapsedMs > 0 ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
            {translate('耗时 {time}', { time: formatElapsed(elapsedMs) })}
          </span>
        ) : null}
        {latestUsage ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
            {translate('输入 {input} / 输出 {output}', {
              input: latestUsage.inputTokens,
              output: latestUsage.outputTokens,
            })}
          </span>
        ) : null}
      </div>
      {detail ? <p className="break-words leading-5 text-muted-foreground">{detail}</p> : null}
      {visibleEvents.length > 0 ? (
        <div className="space-y-1">
          {visibleEvents.map((event, index) => (
            <div
              key={`${event.runId}-${event.phase}-${event.at}-${index}`}
              className="min-w-0 rounded-md bg-muted/45 px-2 py-1"
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
                <span className="truncate text-foreground/90">{getAgentEventLabel(event)}</span>
                {event.toolName ? (
                  <span className="accent-foreground shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px]">
                    {event.toolName}
                  </span>
                ) : null}
              </div>
              {event.detail ? (
                <div
                  className={`mt-0.5 line-clamp-2 break-words text-[11px] ${
                    event.phase === 'failed' || event.phase === 'error'
                      ? 'text-red-600 dark:text-red-300'
                      : 'text-muted-foreground'
                  }`}
                >
                  {event.detail}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      <div className="rounded-md border border-border/60 bg-background px-2.5 py-2">
        <div className="mb-1 flex items-center justify-between gap-2 text-[11px] font-medium text-muted-foreground">
          {translate('模型输出片段')}
          {isStreaming ? (
            <span className="accent-foreground inline-flex items-center gap-1 text-[10px] font-normal">
              <span className="h-1.5 w-1.5 rounded-full bg-primary motion-safe:animate-pulse" />
              {translate('接收中')}
            </span>
          ) : null}
        </div>
        <NativeScrollArea asChild>
          <div
            ref={outputRef}
            className="max-h-28 min-h-10 overflow-y-auto font-mono text-[11px] leading-relaxed text-foreground/85"
          >
            {hasStreamOutput ? (
              <pre className="whitespace-pre-wrap break-words">
                <AnimatePresence initial={false}>
                  {streamChunks.map(chunk => (
                    <motion.span
                      key={chunk.id}
                      initial={prefersReducedMotion ? false : { opacity: 0.7, filter: 'blur(3px)' }}
                      animate={
                        prefersReducedMotion ? undefined : { opacity: 1, filter: 'blur(0px)' }
                      }
                      transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
                      style={prefersReducedMotion ? undefined : { willChange: 'filter, opacity' }}
                    >
                      {chunk.text}
                    </motion.span>
                  ))}
                </AnimatePresence>
                {isStreaming ? <span className="accent-foreground ml-0.5">|</span> : null}
              </pre>
            ) : isStreaming ? (
              <div className="flex min-h-10 items-center gap-2 text-muted-foreground">
                <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-8 rounded-full bg-primary/70 motion-safe:animate-[ai-stream-wait_1.1s_cubic-bezier(0.22,1,0.36,1)_infinite]" />
                </div>
                <span>{translate('正在等待首段模型输出...')}</span>
              </div>
            ) : (
              <span className="text-muted-foreground">{translate('等待模型输出...')}</span>
            )}
          </div>
        </NativeScrollArea>
      </div>
    </div>
  )
}
