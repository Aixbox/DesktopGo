import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowDown } from 'lucide-react'
import { translate } from '@/lib/i18n'

interface AiScrollToBottomButtonProps {
  show: boolean
  onClick: () => void
}

export function AiScrollToBottomButton({ show, onClick }: AiScrollToBottomButtonProps) {
  const prefersReducedMotion = useReducedMotion()
  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.button
          type="button"
          onClick={onClick}
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
  )
}
