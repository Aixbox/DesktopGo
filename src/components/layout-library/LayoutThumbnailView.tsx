import { translate } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { LayoutThumbnail } from './layoutLibrary'

interface LayoutThumbnailViewProps {
  thumbnail: LayoutThumbnail | null
  className?: string
}

/** 缩略图里最多并排画几页。 */
const VISIBLE_PAGES = 2

const PageGrid = ({ thumbnail, cells }: { thumbnail: LayoutThumbnail; cells: number[] }) => {
  const { columns, rows } = thumbnail
  const occupied = cells.flatMap((value, index) => (value ? [index] : []))
  return (
    <svg
      viewBox={`0 0 ${columns} ${rows}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full text-foreground"
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      <rect
        x={0}
        y={0}
        width={columns}
        height={rows}
        rx={0.35}
        fill="currentColor"
        fillOpacity={0.07}
      />
      {occupied.map(index => (
        <rect
          key={index}
          x={(index % columns) + 0.1}
          y={Math.floor(index / columns) + 0.1}
          width={0.8}
          height={0.8}
          rx={0.14}
          fill="currentColor"
          fillOpacity={0.45}
        />
      ))}
    </svg>
  )
}

/** 布局缩略图：并排画前两页的占用格子，看不出图标长啥样，但能看出疏密和排布。 */
export function LayoutThumbnailView({ thumbnail, className }: LayoutThumbnailViewProps) {
  if (!thumbnail || thumbnail.pages.length === 0) {
    return (
      <div
        className={cn(
          'flex h-full w-full items-center justify-center rounded-md border border-dashed border-border/70 text-[10px] text-muted-foreground',
          className
        )}
      >
        {translate('无缩略图')}
      </div>
    )
  }

  return (
    <div className={cn('flex h-full w-full items-stretch gap-1', className)}>
      {thumbnail.pages.slice(0, VISIBLE_PAGES).map((cells, index) => (
        <div key={index} className="min-w-0 flex-1">
          <PageGrid thumbnail={thumbnail} cells={cells} />
        </div>
      ))}
    </div>
  )
}
