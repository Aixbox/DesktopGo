import type { ReactNode } from 'react'
import { ChatAssistantAvatar, ChatMessageBody } from './ChatLoader'

interface ChatMessageUserProps {
  children: ReactNode
}

/**
 * HeroUI ChatMessage.User 风格：右侧主色调气泡，无头像。
 */
export function ChatMessageUser({ children }: ChatMessageUserProps) {
  return (
    <div className="group flex justify-end">
      <div className="flex max-w-[92%] flex-col items-end">
        <div className="rounded-2xl rounded-br-md border border-primary/25 bg-primary/12 px-3.5 py-2 text-sm leading-5 text-foreground">
          {children}
        </div>
      </div>
    </div>
  )
}

interface ChatMessageAssistantProps {
  children: ReactNode
}

/**
 * HeroUI ChatMessage.Assistant 风格：头像 + 内容列的行布局，
 * 思考块（ChainOfThought）、正文（markdown）、工具卡片、操作都由 children 组合。
 */
export function ChatMessageAssistant({ children }: ChatMessageAssistantProps) {
  return (
    <div className="group flex justify-start">
      <div className="flex max-w-full items-start gap-2">
        <ChatAssistantAvatar />
        <ChatMessageBody>{children}</ChatMessageBody>
      </div>
    </div>
  )
}
