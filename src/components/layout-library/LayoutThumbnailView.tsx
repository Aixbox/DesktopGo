import { useId } from 'react'
import { translate } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { LayoutThumbnail, LayoutThumbnailEntry } from './layoutLibrary'
import { useThumbnailBackground } from './useThumbnailBackground'

interface LayoutThumbnailViewProps {
  thumbnail: LayoutThumbnail | null
  /** 图标 id → 图标图（base64/data URL）。缺图的格子退化成色块。 */
  iconImages?: Map<string, string>
  className?: string
}

/** viewBox 里每格的边长：跟像素解耦，整体按比例缩到卡片大小。 */
const CELL = 100
/** 图标在格子里占的比例，留白贴近网格里图标 + 标题的密度。 */
const ICON_SCALE = 0.72
/** 文件夹面板相对自己 footprint 的内缩。 */
const FOLDER_INSET = 7
const FOLDER_PREVIEW_LIMIT = 4

/** 槽位里的 key 可能是老的 `desktop:<id>` 形式，取图标时要去掉前缀。 */
const normalizeIconKey = (key: string) => key.replace(/^(desktop|customapp):/, '')

/** 文件夹在布局里用 `folder:<id>` 作 id。 */
const isFolderKey = (key: string) => key.startsWith('folder:')

interface GlyphProps {
  iconKey: string
  x: number
  y: number
  size: number
  iconImages?: Map<string, string>
}

/** 一格的图标：查不到图时留一个淡色圆角块，别让格子直接空掉。 */
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

/** 文件夹内部的小图标：2x2 宫格，跟网格里文件夹面板的预览一致。 */
function FolderPreview({
  entry,
  x,
  y,
  width,
  height,
  iconImages,
}: {
  entry: LayoutThumbnailEntry
  x: number
  y: number
  width: number
  height: number
  iconImages?: Map<string, string>
}) {
  const children = (entry.children ?? []).slice(0, FOLDER_PREVIEW_LIMIT)
  const padding = Math.max(3, Math.min(width, height) * 0.12)
  const gap = Math.max(2, Math.min(width, height) * 0.07)
  const slotWidth = (width - padding * 2 - gap) / 2
  const slotHeight = (height - padding * 2 - gap) / 2

  if (children.length === 0) {
    // 老数据没有 children，画个文件夹轮廓，至少和图标区分开。
    const tabHeight = height * 0.2
    const bodyTop = y + height * 0.34
    return (
      <g style={{ fill: 'var(--foreground)', fillOpacity: 0.24 }}>
        <rect
          x={x + width * 0.14}
          y={bodyTop - tabHeight * 0.7}
          width={width * 0.42}
          height={tabHeight}
          rx={tabHeight * 0.4}
        />
        <rect
          x={x + width * 0.1}
          y={bodyTop}
          width={width * 0.8}
          height={height * 0.34}
          rx={Math.min(width, height) * 0.12}
        />
      </g>
    )
  }

  const glyphSize = Math.min(slotWidth, slotHeight) * 0.94
  const originX = x + padding + (slotWidth - glyphSize) / 2
  const originY = y + padding + (slotHeight - glyphSize) / 2

  return (
    <>
      {children.map((childKey, index) => (
        <IconGlyph
          key={childKey}
          iconKey={childKey}
          x={originX + (index % 2) * (slotWidth + gap)}
          y={originY + Math.floor(index / 2) * (slotHeight + gap)}
          size={glyphSize}
          iconImages={iconImages}
        />
      ))}
    </>
  )
}

/** 文件夹：半透明面板 + 内部图标，跟网格里的文件夹 tile 一个观感。 */
function FolderGlyph({
  entry,
  iconImages,
}: {
  entry: LayoutThumbnailEntry
  iconImages?: Map<string, string>
}) {
  const x = entry.col * CELL + FOLDER_INSET
  const y = entry.row * CELL + FOLDER_INSET
  const width = entry.cols * CELL - FOLDER_INSET * 2
  const height = entry.rows * CELL - FOLDER_INSET * 2
  const radius = Math.min(width, height) * 0.16

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={radius}
        strokeWidth={2}
        style={{
          fill: 'var(--background)',
          fillOpacity: 0.46,
          stroke: 'var(--border)',
          strokeOpacity: 0.5,
        }}
      />
      <FolderPreview
        entry={entry}
        x={x}
        y={y}
        width={width}
        height={height}
        iconImages={iconImages}
      />
    </g>
  )
}

function EntryGlyph({
  entry,
  iconImages,
}: {
  entry: LayoutThumbnailEntry
  iconImages?: Map<string, string>
}) {
  if (isFolderKey(entry.key)) {
    return <FolderGlyph entry={entry} iconImages={iconImages} />
  }

  const size = Math.min(entry.cols, entry.rows) * CELL * ICON_SCALE
  const x = entry.col * CELL + (entry.cols * CELL - size) / 2
  const y = entry.row * CELL + (entry.rows * CELL - size) / 2
  return <IconGlyph iconKey={entry.key} x={x} y={y} size={size} iconImages={iconImages} />
}

/**
 * 布局缩略图：只画第一页，按锚点和跨度铺开，底图用当前壁纸。
 *
 * 用 SVG 而不是 div 网格，是因为卡片、设置页列表的缩略图尺寸各不相同，
 * viewBox 能按比例缩放，格子不会被拉扁；文件夹也能按 2x2 的真实尺寸画出来。
 */
export function LayoutThumbnailView({
  thumbnail,
  iconImages,
  className,
}: LayoutThumbnailViewProps) {
  const background = useThumbnailBackground()
  const rawId = useId()
  const clipId = `layout-thumbnail-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`

  const width = (thumbnail?.columns ?? 0) * CELL
  const height = (thumbnail?.rows ?? 0) * CELL
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
            iconImages={iconImages}
          />
        ))}
      </g>
    </svg>
  )
}
