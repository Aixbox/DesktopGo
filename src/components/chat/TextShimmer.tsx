import type { ReactNode } from 'react'

interface TextShimmerProps {
  children: ReactNode
  className?: string
}

/**
 * HeroUI TextShimmer 风格的文字微光：用于流式、思考中的短标签。
 * 颜色继承 currentColor，动画在 globals.css 的 .chat-text-shimmer 中定义。
 */
export function TextShimmer({ children, className = '' }: TextShimmerProps) {
  return <span className={`chat-text-shimmer ${className}`.trim()}>{children}</span>
}
