import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import type { HoverPreviewAnchor } from './useLayoutHoverPreview'
import { LayoutThumbnailView } from './LayoutThumbnailView'

interface LayoutHoverPreviewProps {
  anchor: HoverPreviewAnchor
  iconImages?: Map<string, string>
}

/** 放大图的基准宽度；高度按行列比算，太扁的网格兜一个最小高度。 */
const PREVIEW_WIDTH = 268
const PREVIEW_MIN_HEIGHT = 96
const PREVIEW_MAX_HEIGHT = 224
/** 外壳除缩略图之外的垂直占用：只有上下各 8px 的内边距。 */
const SHELL_PADDING = 16
const HOVER_GAP = 10
const VIEWPORT_MARGIN = 8
/** 小箭头：正方形转 45°，对角线一半露在浮层外面。 */
const ARROW_SIZE = 10

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max))

/**
 * 悬停卡片的放大预览：只放一张缩略图，不带名字和统计。
 *
 * 挂到 body 上而不是留在卡片里：抽屉是 `overflow-hidden`、卡片区是 `overflow-x-auto`，
 * 贴边的卡片会把自己上方的浮层裁掉。定位用 fixed，卡片在抽屉底部，默认往上弹。
 */
export function LayoutHoverPreview({ anchor, iconImages }: LayoutHoverPreviewProps) {
  const columns = Math.max(1, anchor.thumbnail?.columns ?? 1)
  const rows = Math.max(1, anchor.thumbnail?.rows ?? 1)
  const frameHeight = clamp(
    Math.round((PREVIEW_WIDTH * rows) / columns),
    PREVIEW_MIN_HEIGHT,
    PREVIEW_MAX_HEIGHT
  )
  const shellWidth = PREVIEW_WIDTH + SHELL_PADDING
  const shellHeight = frameHeight + SHELL_PADDING

  const { rect } = anchor
  const left = clamp(
    rect.left + rect.width / 2 - shellWidth / 2,
    VIEWPORT_MARGIN,
    window.innerWidth - shellWidth - VIEWPORT_MARGIN
  )
  const above = rect.top - shellHeight - HOVER_GAP
  // 卡片在底部抽屉里，默认往上弹；上面塞不下才掉到下方，箭头跟着换边。
  const placement: 'top' | 'bottom' = above >= VIEWPORT_MARGIN ? 'top' : 'bottom'
  const top =
    placement === 'top'
      ? above
      : clamp(
          rect.bottom + HOVER_GAP,
          VIEWPORT_MARGIN,
          window.innerHeight - shellHeight - VIEWPORT_MARGIN
        )
  // 箭头对着卡片中心，贴边卡片被 clamp 之后箭头往回收到浮层内。
  const arrowCenter = clamp(
    rect.left + rect.width / 2 - left,
    ARROW_SIZE + 10,
    shellWidth - ARROW_SIZE - 10
  )

  return createPortal(
    <div
      role="tooltip"
      data-layout-hover-preview="true"
      className="pointer-events-none fixed z-[90] rounded-xl border border-border/80 bg-card/96 p-2 shadow-[0_4px_12px_-2px_rgba(15,23,42,0.22),0_1px_3px_rgba(15,23,42,0.1)] backdrop-blur-xl"
      style={{ left, top, width: shellWidth }}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute h-2.5 w-2.5 rotate-45 rounded-[1px] border-border/80 bg-card',
          placement === 'top' ? 'border-b border-r' : 'border-l border-t'
        )}
        style={{
          left: arrowCenter - ARROW_SIZE / 2,
          ...(placement === 'top' ? { bottom: -ARROW_SIZE / 2 } : { top: -ARROW_SIZE / 2 }),
        }}
      />
      <div
        className="overflow-hidden rounded-lg bg-foreground/[0.06]"
        style={{ height: frameHeight }}
      >
        <LayoutThumbnailView thumbnail={anchor.thumbnail} iconImages={iconImages} />
      </div>
    </div>,
    document.body
  )
}
