import type { CSSProperties } from 'react'
import type { SearchHighlightSegment } from '@/lib/search/highlight'

/**
 * 高亮分段的渲染。分段怎么切由调用方决定（Everything 的 `*` 标记、本地打分器的
 * 子序列命中、或字面子串），这里只负责把切好的段落画出来，
 * 好让结果列表和「最佳匹配」用同一套外观。
 */
export function HighlightedText({
  segments,
  className,
  highlightClassName,
  style,
}: {
  segments: SearchHighlightSegment[]
  className: string
  highlightClassName: string
  style?: CSSProperties
}) {
  return (
    <span className={className} style={style}>
      {segments.map((segment, index) => (
        <span
          key={`${segment.text}-${index}`}
          className={segment.highlighted ? highlightClassName : undefined}
        >
          {segment.text}
        </span>
      ))}
    </span>
  )
}
