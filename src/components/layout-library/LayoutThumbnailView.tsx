import { useId } from 'react'
import { translate } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { GRID_GAP } from '@/components/icon-grid/constants'
import type { FolderSize } from '@/components/icon-grid/model'
import { getDesktopLargeFolderPreviewLayout } from '@/components/icon-grid/views/folderPreviewPolicy'
import {
  FOLDER_PREVIEW_GAP,
  FOLDER_PREVIEW_PADDING,
  getDesktopFolderTileMetrics,
  getDesktopSingleSlotFolderMetrics,
  getFolderPreviewSlotSize,
} from '@/components/icon-grid/views/folderVisualPolicy'
import { useIconStore } from '@/stores/iconStore'
import {
  ICON_GRID_TILE_PADDING_Y,
  ICON_SIZE_CONFIG,
  getIconGridRowHeight,
  type TitleLineCount,
} from '@/types'
import type { LayoutThumbnail, LayoutThumbnailEntry } from './layoutLibrary'
import { useThumbnailBackground } from './useThumbnailBackground'

interface LayoutThumbnailViewProps {
  thumbnail: LayoutThumbnail | null
  /** 图标 id → 图标图（base64/data URL）。缺图的格子退化成色块。 */
  iconImages?: Map<string, string>
  className?: string
}

/** 一层网格的度量，直接取当前网格的像素值，缩略图按同一套数字画。 */
interface GridMetrics {
  cellWidth: number
  cellHeight: number
  gap: number
  icon: number
}

/** 文件夹塞满时最后一格摊成 2x2 的迷你预览。 */
const MINI_PREVIEW_LIMIT = 4

/** 槽位里的 key 可能是老的 `desktop:<id>` 形式，取图标时要去掉前缀。 */
const normalizeIconKey = (key: string) => key.replace(/^(desktop|customapp):/, '')

/** 文件夹在布局里用 `folder:<id>` 作 id。 */
const isFolderKey = (key: string) => key.startsWith('folder:')

const folderSizeFromSpan = (cols: number, rows: number): FolderSize => {
  if (cols >= 2 && rows >= 2) return '2x2'
  if (cols >= 2) return '2x1'
  if (rows >= 2) return '1x2'
  return '1x1'
}

interface GlyphProps {
  iconKey: string
  x: number
  y: number
  size: number
  iconImages?: Map<string, string>
}

/** 一个图标：查不到图时留一个淡色圆角块，别让格子直接空掉。 */
function IconGlyph({ iconKey, x, y, size, iconImages }: GlyphProps) {
  const image = iconImages?.get(normalizeIconKey(iconKey))
  if (!image) {
    return (
      <rect
        x={x}
        y={y}
        width={size}
        height={size}
        rx={size * 0.2}
        style={{ fill: 'var(--foreground)', fillOpacity: 0.16 }}
      />
    )
  }
  return (
    <image
      href={image}
      x={x}
      y={y}
      width={size}
      height={size}
      preserveAspectRatio="xMidYMid meet"
    />
  )
}

/** 文件夹表面的半透明面板，和网格里的桌面文件夹 tile 一个观感。 */
function FolderSurface({
  x,
  y,
  width,
  height,
  radius,
}: {
  x: number
  y: number
  width: number
  height: number
  radius: number
}) {
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      rx={radius}
      strokeWidth={1}
      style={{
        fill: 'var(--background)',
        fillOpacity: 0.48,
        stroke: 'var(--border)',
        strokeOpacity: 0.45,
      }}
    />
  )
}

interface FolderGlyphProps {
  entry: LayoutThumbnailEntry
  metrics: GridMetrics
  titleLineCount: TitleLineCount
  iconImages?: Map<string, string>
}

/**
 * 文件夹：按 `OuterFolderTile` 的同一套像素规则摆内部图标。
 *
 * 2x2 的文件夹在网格里是 3x3 九格，不是四格；2x1 / 1x2 是 3x1 / 1x3；
 * 成员塞满时最后一格摊成 2x2 的迷你预览。这里全部照抄，缩略图才和网格对得上。
 */
function FolderGlyph({ entry, metrics, titleLineCount, iconImages }: FolderGlyphProps) {
  const folderSize = folderSizeFromSpan(entry.cols, entry.rows)
  const originX = entry.col * (metrics.cellWidth + metrics.gap)
  const originY = entry.row * (metrics.cellHeight + metrics.gap)
  const children = entry.children ?? []

  if (folderSize === '1x1') {
    const single = getDesktopSingleSlotFolderMetrics(
      metrics.cellWidth,
      metrics.cellHeight,
      titleLineCount
    )
    // 表面在格子水平居中，垂直方向要让开顶部的图标留白。
    const surfaceX = originX + single.surfaceLeft
    const surfaceY = originY + single.surfaceTop
    const previewX = surfaceX + (single.surfaceSize - single.previewSize) / 2
    const previewY = surfaceY + (single.surfaceSize - single.previewSize) / 2
    const slotSize = getFolderPreviewSlotSize(single.previewSize)

    return (
      <g>
        <FolderSurface
          x={surfaceX}
          y={surfaceY}
          width={single.surfaceSize}
          height={single.surfaceSize}
          radius={single.surfaceRadius}
        />
        {children.slice(0, MINI_PREVIEW_LIMIT).map((childKey, index) => (
          <IconGlyph
            key={childKey}
            iconKey={childKey}
            x={previewX + FOLDER_PREVIEW_PADDING + (index % 2) * (slotSize + FOLDER_PREVIEW_GAP)}
            y={
              previewY +
              FOLDER_PREVIEW_PADDING +
              Math.floor(index / 2) * (slotSize + FOLDER_PREVIEW_GAP)
            }
            size={slotSize}
            iconImages={iconImages}
          />
        ))}
      </g>
    )
  }

  const tile = getDesktopFolderTileMetrics({
    span: { cols: entry.cols, rows: entry.rows },
    slotWidth: metrics.cellWidth,
    slotHeight: metrics.cellHeight,
    gridGap: metrics.gap,
    folderSize,
    titleLineCount,
    surfaceTitleLineCount: 'two',
  })
  // body 在 footprint 里水平居中，表面在 body 里再居中，合起来就是相对格子居中；
  // 垂直方向从顶部留白开始，下面要给标题让位。
  const surfaceX = originX + (tile.footprintWidth - tile.shapeWidth) / 2
  const surfaceY =
    originY + ICON_GRID_TILE_PADDING_Y + Math.max(0, (tile.bodyHeight - tile.shapeHeight) / 2)

  const layout = getDesktopLargeFolderPreviewLayout(folderSize, children.length)
  const visibleChildren = children.slice(0, layout.visibleIconCount)
  const standardChildren = visibleChildren.slice(0, layout.standardIconCount)
  const splitChildren = visibleChildren.slice(layout.standardIconCount)

  const cols = folderSize === '2x2' || folderSize === '2x1' ? 3 : 1
  const rows = folderSize === '2x2' || folderSize === '1x2' ? 3 : 1
  const innerPadding = Math.min(8, Math.max(4, Math.floor(tile.panelBase / 8)))
  const innerGap = Math.min(6, Math.max(4, Math.floor(tile.panelBase / 16)))
  const cellSize = Math.max(
    14,
    Math.floor(
      Math.min(
        (tile.shapeWidth - innerPadding * 2 - innerGap * Math.max(0, cols - 1)) / cols,
        (tile.shapeHeight - innerPadding * 2 - innerGap * Math.max(0, rows - 1)) / rows
      )
    )
  )
  const gridWidth = cols * cellSize + Math.max(0, cols - 1) * innerGap
  const gridHeight = rows * cellSize + Math.max(0, rows - 1) * innerGap
  // 网格在表面里居中，长条文件夹再按网格里的 -2px 微调错开。
  const gridX = surfaceX + (tile.shapeWidth - gridWidth) / 2 + (folderSize === '2x1' ? -2 : 0)
  const gridY = surfaceY + (tile.shapeHeight - gridHeight) / 2 + (folderSize === '1x2' ? -2 : 0)

  const cellX = (index: number) => gridX + (index % cols) * (cellSize + innerGap)
  const cellY = (index: number) => gridY + Math.floor(index / cols) * (cellSize + innerGap)

  return (
    <g>
      <FolderSurface
        x={surfaceX}
        y={surfaceY}
        width={tile.shapeWidth}
        height={tile.shapeHeight}
        radius={tile.surfaceRadius}
      />
      {standardChildren.map((childKey, index) => (
        <IconGlyph
          key={childKey}
          iconKey={childKey}
          x={cellX(index)}
          y={cellY(index)}
          size={cellSize}
          iconImages={iconImages}
        />
      ))}
      {layout.splitLastSlot ? (
        <MiniPreview
          icons={splitChildren}
          x={cellX(layout.standardIconCount)}
          y={cellY(layout.standardIconCount)}
          size={cellSize}
          iconImages={iconImages}
        />
      ) : null}
    </g>
  )
}

/** 塞不下时最后一格的 2x2 迷你宫格，对应网格里的 SplitPreviewIconButton。 */
function MiniPreview({
  icons,
  x,
  y,
  size,
  iconImages,
}: {
  icons: string[]
  x: number
  y: number
  size: number
  iconImages?: Map<string, string>
}) {
  const padding = 1
  const gap = 1
  const miniSize = Math.max(5, Math.floor((size - padding * 2 - gap) / 2))
  const slots = Array.from({ length: MINI_PREVIEW_LIMIT }, (_, index) => icons[index])

  return (
    <>
      {slots.map((childKey, index) =>
        childKey ? (
          <IconGlyph
            key={`${childKey}-${index}`}
            iconKey={childKey}
            x={x + padding + (index % 2) * (miniSize + gap)}
            y={y + padding + Math.floor(index / 2) * (miniSize + gap)}
            size={miniSize}
            iconImages={iconImages}
          />
        ) : null
      )}
    </>
  )
}

function EntryGlyph({
  entry,
  metrics,
  titleLineCount,
  iconImages,
}: {
  entry: LayoutThumbnailEntry
  metrics: GridMetrics
  titleLineCount: TitleLineCount
  iconImages?: Map<string, string>
}) {
  if (isFolderKey(entry.key)) {
    return (
      <FolderGlyph
        entry={entry}
        metrics={metrics}
        titleLineCount={titleLineCount}
        iconImages={iconImages}
      />
    )
  }

  const spanWidth = entry.cols * metrics.cellWidth + Math.max(0, entry.cols - 1) * metrics.gap
  const x = entry.col * (metrics.cellWidth + metrics.gap) + (spanWidth - metrics.icon) / 2
  // 网格里的图标贴着格子上沿，下面留标题的位置。
  const y = entry.row * (metrics.cellHeight + metrics.gap) + ICON_GRID_TILE_PADDING_Y
  return <IconGlyph iconKey={entry.key} x={x} y={y} size={metrics.icon} iconImages={iconImages} />
}

/**
 * 布局缩略图：只画第一页，按网格的真实像素比例铺开，底图用当前壁纸。
 *
 * viewBox 直接采用网格的像素尺寸（格子宽 + 间距），所以图标间距、文件夹的
 * 3x3 九宫格、内部图标大小都和启动台里看到的一致，缩放到卡片大小时等比缩小。
 */
export function LayoutThumbnailView({
  thumbnail,
  iconImages,
  className,
}: LayoutThumbnailViewProps) {
  const background = useThumbnailBackground()
  const iconSizeKey = useIconStore(state => state.iconSize)
  const titleLineCount = useIconStore(state => state.titleLineCount)
  const rawId = useId()
  const clipId = `layout-thumbnail-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`

  const metrics: GridMetrics = {
    cellWidth: ICON_SIZE_CONFIG[iconSizeKey].columnWidth,
    cellHeight: getIconGridRowHeight(iconSizeKey),
    gap: GRID_GAP,
    icon: ICON_SIZE_CONFIG[iconSizeKey].imgSize,
  }

  const columns = thumbnail?.columns ?? 0
  const rows = thumbnail?.rows ?? 0
  const width = columns > 0 ? columns * metrics.cellWidth + (columns - 1) * metrics.gap : 0
  const height = rows > 0 ? rows * metrics.cellHeight + (rows - 1) * metrics.gap : 0
  const entries = thumbnail?.entries ?? []

  if (!thumbnail || entries.length === 0 || width <= 0 || height <= 0) {
    return (
      <div
        className={cn(
          'flex h-full w-full items-center justify-center rounded-[5px] border border-dashed border-border/60 text-[10px] text-muted-foreground',
          className
        )}
      >
        {translate('无缩略图')}
      </div>
    )
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      className={cn('pointer-events-none h-full w-full', className)}
      aria-hidden="true"
    >
      <defs>
        <clipPath id={clipId}>
          <rect width={width} height={height} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width={width} height={height} style={{ fill: 'var(--muted)' }} />
        {background ? (
          <>
            <image
              href={background.image}
              width={width}
              height={height}
              preserveAspectRatio="xMidYMid slice"
            />
            <rect
              width={width}
              height={height}
              style={{
                fill: `rgb(var(--launchpad-background-scrim-rgb) / ${background.overlay})`,
              }}
            />
          </>
        ) : null}
        {entries.map(entry => (
          <EntryGlyph
            key={`${entry.key}-${entry.col}-${entry.row}`}
            entry={entry}
            metrics={metrics}
            titleLineCount={titleLineCount}
            iconImages={iconImages}
          />
        ))}
      </g>
    </svg>
  )
}
