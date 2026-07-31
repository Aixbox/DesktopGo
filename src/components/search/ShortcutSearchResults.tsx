import { useEffect, useMemo, useRef } from 'react'
import { AppWindow, Folder } from 'lucide-react'
import { translate } from '@/lib/i18n'
import { IconContextMenu } from '@/components/icons/IconContextMenu'
import { useIconStore } from '@/stores/iconStore'
import type { BestMatchItem } from '@/lib/search/bestMatch'
import { ICON_SIZE_CONFIG, type DesktopIcon } from '@/types'
import { FileResultContextMenu } from './FileResultContextMenu'
import { SearchResultSectionHeader } from './SearchResultSectionHeader'
import { SHORTCUT_GRID_COLUMN_GAP, resolveShortcutGridColumnCount } from './shortcutGridLayout'
import { useStableSearchEvent } from './useStableSearchEvent'
import { useVisibleSearchIcons } from './useVisibleSearchIcons'

interface ShortcutSearchResultsProps {
  items: BestMatchItem[]
  selectedIndex: number
  onSelect: (index: number) => void
  onActivate: (item: BestMatchItem) => void
  mode: 'compact' | 'grid'
  heading?: string
  onColumnCountChange?: (columnCount: number) => void
}

function ShortcutIcon({ icon, size }: { icon: DesktopIcon; size: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden"
      style={{ width: size, height: size }}
    >
      {icon.icon_base64 ? (
        <img
          src={icon.icon_base64}
          alt=""
          className="h-full w-full object-contain"
          draggable={false}
        />
      ) : icon.item_type === 'folder' ? (
        <Folder className="h-5 w-5 text-muted-foreground" />
      ) : (
        <AppWindow className="h-5 w-5 text-muted-foreground" />
      )}
    </span>
  )
}

/**
 * 文件条目走和结果列表同一套 Shell 图标管线（`useVisibleSearchIcons`），
 * 图标未就绪时只留空位，不画线框占位符，避免闪一下再换成真图标。
 */
function FileResultIcon({ iconBase64, size }: { iconBase64: string; size: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden"
      style={{ width: size, height: size }}
    >
      {iconBase64 ? (
        <img src={iconBase64} alt="" className="h-full w-full object-contain" draggable={false} />
      ) : null}
    </span>
  )
}

export function ShortcutSearchResults({
  items,
  selectedIndex,
  onSelect,
  onActivate,
  mode,
  heading,
  onColumnCountChange,
}: ShortcutSearchResultsProps) {
  const { iconSize, titleLineCount } = useIconStore()
  const config = ICON_SIZE_CONFIG[iconSize]
  const singleLineTitle = titleLineCount === 'one'
  const gridRef = useRef<HTMLDivElement | null>(null)
  const isGridMode = mode === 'grid'
  const hasItems = items.length > 0
  const tileWidth = config.containerWidth
  const reportColumnCount = useStableSearchEvent((columnCount: number) => {
    onColumnCountChange?.(columnCount)
  })

  const fileIconRequests = useMemo(
    () =>
      items.flatMap(item =>
        item.kind === 'file' ? [{ path: item.hit.path, isFolder: item.hit.isFolder }] : []
      ),
    [items]
  )
  const resolveFileIcon = useVisibleSearchIcons(fileIconRequests, fileIconRequests.length > 0)

  useEffect(() => {
    if (!isGridMode || !hasItems) return

    const element = gridRef.current
    if (!element) return

    const syncColumnCount = () => {
      reportColumnCount(
        resolveShortcutGridColumnCount({ availableWidth: element.clientWidth, tileWidth })
      )
    }

    syncColumnCount()

    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(syncColumnCount)
    resizeObserver?.observe(element)

    return () => {
      resizeObserver?.disconnect()
    }
  }, [hasItems, isGridMode, reportColumnCount, tileWidth])

  useEffect(() => {
    if (!isGridMode || selectedIndex < 0) return

    gridRef.current
      ?.querySelector<HTMLElement>(`[data-shortcut-index="${selectedIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [isGridMode, selectedIndex])

  if (items.length === 0) return null

  if (mode === 'compact') {
    return (
      <section className="shrink-0 border-b border-border/70 pb-2">
        <SearchResultSectionHeader title={translate(heading ?? '最佳匹配')} count={items.length} />
        <div className="grid grid-cols-2 gap-1 px-2">
          {items.map((item, index) => {
            const row = (
              <button
                type="button"
                aria-current={selectedIndex === index ? 'true' : undefined}
                className={`flex h-12 min-w-0 items-center gap-2.5 rounded-md px-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/45 ${
                  selectedIndex === index
                    ? 'bg-primary/18 ring-1 ring-inset ring-primary/55 dark:bg-primary/24 dark:ring-primary/65'
                    : 'hover:bg-accent/55'
                }`}
                title={item.name}
                onMouseEnter={() => onSelect(index)}
                onClick={() => onSelect(index)}
                onDoubleClick={() => onActivate(item)}
              >
                {item.kind === 'shortcut' ? (
                  <ShortcutIcon icon={item.icon} size={30} />
                ) : (
                  <FileResultIcon
                    iconBase64={resolveFileIcon(item.hit.path, item.hit.isFolder)}
                    size={30}
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">{item.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {item.detail}
                  </span>
                </span>
              </button>
            )

            return item.kind === 'shortcut' ? (
              <IconContextMenu key={item.key} icon={item.icon} onOpen={() => onActivate(item)}>
                {row}
              </IconContextMenu>
            ) : (
              <FileResultContextMenu
                key={item.key}
                path={item.hit.path}
                onOpen={() => onActivate(item)}
              >
                {row}
              </FileResultContextMenu>
            )
          })}
        </div>
      </section>
    )
  }

  return (
    <div className="max-h-[56vh] overflow-auto px-4 py-4">
      <div
        ref={gridRef}
        className="grid justify-start gap-y-5"
        style={{
          columnGap: SHORTCUT_GRID_COLUMN_GAP,
          gridTemplateColumns: `repeat(auto-fill, ${tileWidth}px)`,
        }}
      >
        {items.map((item, index) =>
          item.kind !== 'shortcut' ? null : (
            <IconContextMenu key={item.key} icon={item.icon} onOpen={() => onActivate(item)}>
              <button
                type="button"
                data-shortcut-index={index}
                aria-current={selectedIndex === index ? 'true' : undefined}
                className={`group relative flex cursor-pointer flex-col items-center gap-2 rounded-md border-none p-3 shadow-none ${
                  selectedIndex === index
                    ? 'bg-primary/12 ring-1 ring-primary/40 dark:bg-primary/18 dark:ring-primary/45'
                    : 'bg-transparent hover:bg-accent/60 active:bg-accent'
                }`}
                style={{ width: config.containerWidth }}
                title={item.name}
                onMouseEnter={() => onSelect(index)}
                onClick={() => onSelect(index)}
                onDoubleClick={() => onActivate(item)}
              >
                <ShortcutIcon icon={item.icon} size={config.imgSize} />
                <span
                  className={`text-center text-[11px] leading-tight ${
                    selectedIndex === index ? 'accent-foreground' : 'text-foreground'
                  }`}
                  style={{
                    maxWidth: config.containerWidth - 10,
                    display: singleLineTitle ? 'block' : '-webkit-box',
                    WebkitLineClamp: singleLineTitle ? 1 : 2,
                    WebkitBoxOrient: singleLineTitle ? undefined : 'vertical',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: singleLineTitle ? 'nowrap' : 'normal',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {item.name}
                </span>
              </button>
            </IconContextMenu>
          )
        )}
      </div>
    </div>
  )
}
