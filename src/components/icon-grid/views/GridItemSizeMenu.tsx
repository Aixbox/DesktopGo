import { Maximize2 } from 'lucide-react'
import { MenuRadioGroup, MenuRadioItem } from '../../ui/menu'
import { MenuSub, MenuSubContent, MenuSubTrigger } from '../../ui/menu-submenu'
import { useItemMenuId } from '../../icons/focusedItemMenuContext'
import type { GridSpan, TileSize } from '../model'
import { scaledRadius } from './folderVisualPolicy'

const TILE_SIZES: Array<{ value: TileSize; label: string; span: GridSpan }> = [
  { value: '1x1', label: '1x1', span: { cols: 1, rows: 1 } },
  { value: '1x2', label: '1x2', span: { cols: 1, rows: 2 } },
  { value: '2x1', label: '2x1', span: { cols: 2, rows: 1 } },
  { value: '2x2', label: '2x2', span: { cols: 2, rows: 2 } },
]
export function GridItemSizeMenu({
  label,
  size,
  onResize,
}: {
  label: string
  size: TileSize
  onResize: (size: TileSize) => void
}) {
  const menuId = useItemMenuId()
  return (
    <MenuSub>
      <MenuSubTrigger className="px-2.5 py-2">
        <Maximize2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="whitespace-nowrap">{label}</span>
      </MenuSubTrigger>
      <MenuSubContent
        aria-label={label}
        data-focused-item-menu
        data-focused-menu-owner={menuId}
        sideOffset={6}
        collisionPadding={8}
        className="z-[283] min-w-40 p-1.5 shadow-xl"
        onPointerDown={event => event.stopPropagation()}
        onClick={event => event.stopPropagation()}
        onKeyDown={event => event.stopPropagation()}
        onContextMenu={event => {
          event.preventDefault()
          event.stopPropagation()
        }}
      >
        <MenuRadioGroup
          value={size}
          onValueChange={value => {
            if (value !== size && TILE_SIZES.some(option => option.value === value))
              onResize(value as TileSize)
          }}
        >
          {TILE_SIZES.map(option => (
            <MenuRadioItem
              key={option.value}
              value={option.value}
              className="px-3 py-1.5 text-foreground/85 focus:bg-accent focus:text-foreground data-[state=checked]:bg-accent/80 data-[state=checked]:text-foreground"
            >
              <div className="flex items-center gap-3 pr-4">
                <TileSizePreview span={option.span} active={size === option.value} />
                <span className="text-sm font-medium leading-none">{option.label}</span>
              </div>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuSubContent>
    </MenuSub>
  )
}

interface TileSizePreviewProps {
  span: GridSpan
  active: boolean
}

function TileSizePreview({ span, active }: TileSizePreviewProps) {
  const unitSize = 9
  const slotGap = 3
  const shellPadding = 3
  const shellWidth = span.cols * unitSize + Math.max(0, span.cols - 1) * slotGap + shellPadding * 2
  const shellHeight = span.rows * unitSize + Math.max(0, span.rows - 1) * slotGap + shellPadding * 2
  const shellRadius = Math.max(5, Math.floor(Math.min(shellWidth, shellHeight) * 0.2))
  const slotRadius = Math.max(2, Math.floor(unitSize * 0.22))

  return (
    <span className="flex h-8 w-12 shrink-0 items-center justify-center" aria-hidden="true">
      <span
        className={`relative overflow-hidden border shadow-[0_6px_14px_rgba(0,0,0,0.14),inset_0_1px_0_rgba(255,255,255,0.32)] transition ${
          active
            ? 'border-border/60 bg-background/62 shadow-[0_6px_14px_rgba(15,23,42,0.12)] ring-1 ring-foreground/[0.05] dark:border-white/24 dark:bg-white/12 dark:shadow-[0_6px_14px_rgba(0,0,0,0.16)] dark:ring-white/[0.08]'
            : 'border-border/45 bg-background/42 shadow-[0_4px_12px_rgba(15,23,42,0.1)] ring-1 ring-foreground/[0.03] dark:border-white/16 dark:bg-white/[0.04] dark:shadow-[0_4px_12px_rgba(0,0,0,0.12)] dark:ring-white/[0.05]'
        }`}
        style={{
          width: `${shellWidth}px`,
          height: `${shellHeight}px`,
          borderRadius: scaledRadius(shellRadius),
        }}
      >
        <span
          className="absolute inset-0 grid"
          style={{
            padding: `${shellPadding}px`,
            gap: `${slotGap}px`,
            gridTemplateColumns: `repeat(${span.cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${span.rows}, minmax(0, 1fr))`,
          }}
        >
          {Array.from({ length: span.cols * span.rows }, (_, index) => (
            <span
              key={index}
              className={`border transition ${
                active
                  ? 'border-border/40 bg-background/72 dark:border-white/18 dark:bg-white/14'
                  : 'border-border/30 bg-background/50 dark:border-white/10 dark:bg-white/[0.05]'
              }`}
              style={{ borderRadius: scaledRadius(slotRadius) }}
            />
          ))}
        </span>
      </span>
    </span>
  )
}
