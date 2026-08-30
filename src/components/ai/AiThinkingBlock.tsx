import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Brain, ChevronDown, Loader2 } from 'lucide-react'
import { translate } from '@/lib/i18n'
import { isNearScrollBottom } from './aiOrganizePanelModel'

interface AiThinkingBlockProps {
  text: string
  streaming?: boolean
}

export function AiThinkingBlock({ text, streaming = false }: AiThinkingBlockProps) {
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

  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        aria-expanded={open}
        className="-mx-1 flex items-center gap-1 rounded px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        {streaming ? (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
        ) : (
          <Brain className="h-3 w-3 shrink-0" />
        )}
        <span className={streaming ? 'font-medium text-foreground/80' : 'font-medium'}>
          {streaming ? translate('思考中') : translate('思考过程')}
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
            key="reasoning-content"
            initial={prefersReducedMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={prefersReducedMotion ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div
              ref={contentRef}
              className="max-h-36 overflow-y-auto pb-0.5 pl-4 pr-1 pt-1 text-xs leading-5 text-muted-foreground"
            >
              <p className="whitespace-pre-wrap break-words">{text}</p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
