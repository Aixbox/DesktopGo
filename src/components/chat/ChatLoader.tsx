import { motion, useReducedMotion } from 'framer-motion'
import { Bot } from 'lucide-react'
import type { ReactNode } from 'react'

const DOT_EASE = [0.22, 1, 0.36, 1] as const

/**
 * HeroUI ChatLoader.Dots 风格的等待气泡：助手头像 + 圆角气泡内三个
 * 交错跳动的圆点，仅在没有可展示输出时整行出现。
 */
export function ChatLoaderDots() {
  const prefersReducedMotion = useReducedMotion()

  return (
    <div className="flex justify-start">
      <div className="flex max-w-full items-start gap-2">
        <ChatAssistantAvatar />
        <div className="rounded-2xl rounded-bl-md border border-border/70 bg-muted/40 px-3.5 py-2.5">
          <span className="flex items-center gap-1" aria-hidden="true">
            {[0, 1, 2].map(index => (
              <motion.span
                key={index}
                className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
                animate={
                  prefersReducedMotion ? undefined : { y: [0, -3, 0], opacity: [0.4, 1, 0.4] }
                }
                transition={{
                  duration: 0.9,
                  repeat: Infinity,
                  ease: DOT_EASE,
                  delay: index * 0.15,
                }}
              />
            ))}
          </span>
          <span className="sr-only">…</span>
        </div>
      </div>
    </div>
  )
}

/** HeroUI ChatMessage.Avatar 风格的助手头像块，消息行与加载行共用。 */
export function ChatAssistantAvatar() {
  return (
    <div
      aria-hidden="true"
      className="accent-tonal mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border"
    >
      <Bot className="h-3.5 w-3.5" />
    </div>
  )
}

interface ChatMessageBodyProps {
  children: ReactNode
}

/** 助手消息头像右侧的内容列：思考块、正文、操作都收在这里。 */
export function ChatMessageBody({ children }: ChatMessageBodyProps) {
  return <div className="min-w-0 flex-1">{children}</div>
}
