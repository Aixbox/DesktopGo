import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Brain, ChevronDown, Loader2 } from 'lucide-react'
import { translate } from '@/lib/i18n'
import { TextShimmer } from './TextShimmer'
import { formatAiDuration, isNearScrollBottom } from '@/components/ai/aiOrganizePanelModel'

interface ChainOfThoughtProps {
  /** 模型输出的推理正文（流式或已持久化）。 */
  text: string
  /** true = 推理仍在流式输出；结束时自动折叠。 */
  streaming?: boolean
  /** 已结束的思考耗时（毫秒），用于触发器的「已深度思考 Xs」。 */
  reasoningMs?: number
}

/**
 * 深度思考折叠块（DeepSeek / Ant Design X 风格）：流式时默认展开、
 * 触发器微光显示「思考中」，正文是模型输出的推理文本，结束自动折叠为
 * 「已深度思考 Xs」，点击可回看。不展示应用内部的流水线状态。
 */
export function ChainOfThought({ text, streaming = false, reasoningMs = 0 }: ChainOfThoughtProps) {
  const contentRef = useRef<HTMLDivElement | null>(null)
  const prefersReducedMotion = useReducedMotion()
  const [open, setOpen] = useState(streaming)
  const [wasStreaming, setWasStreaming] = useState(streaming)

  // 思考结束（streaming 翻转）时自动折叠，只展示最终回复。
  if (wasStreaming !== streaming) {
    setWasStreaming(streaming)
    if (!streaming) setOpen(false)
  }

  useEffect(() => {
    if (!open || !streaming) return
    const content = contentRef.current
    if (!content || !isNearScrollBottom(content, 24)) return
    content.scrollTop = content.scrollHeight
  }, [open, streaming, text])

  if (!text.trim()) return null

  const triggerLabel = streaming ? (
    <TextShimmer>{translate('思考中')}</TextShimmer>
  ) : reasoningMs > 0 ? (
    translate('已深度思考 {time}', { time: formatAiDuration(reasoningMs) })
  ) : (
    translate('思考过程')
  )

  return (
    <div className="mb-1.5">
      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        aria-expanded={open}
        className="-mx-1 flex items-center gap-1.5 rounded px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        {streaming ? (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
        ) : (
          <Brain className="h-3 w-3 shrink-0" />
        )}
        <span
          className={
            streaming ? 'font-medium text-foreground/85' : 'font-medium text-foreground/75'
          }
        >
          {triggerLabel}
        </span>
        <motion.span
          className="inline-flex"
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
        >
          <ChevronDown className="h-3 w-3" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="chain-of-thought-content"
            initial={prefersReducedMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={prefersReducedMotion ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div
              ref={contentRef}
              className="ml-2.5 mt-1.5 max-h-44 overflow-y-auto border-l-2 border-border/70 py-0.5 pl-3 pr-1"
            >
              <p className="whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">
                {text}
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
