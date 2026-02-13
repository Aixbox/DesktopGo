import { useEffect, useMemo, useRef, useState } from 'react'
import type { DesktopIcon } from '../types'
import { ICON_SIZE_CONFIG } from '../types'
import { buildIconSelectionKey, useIconStore } from '../stores/iconStore'
import { Icon } from './Icon'

interface IconGridProps {
  icons: DesktopIcon[]
}

const GRID_GAP = 8
const PAGINATION_OFFSET = 14
const PAGINATION_DOT_SIZE = 8
const PAGINATION_DOT_GAP = 10
const PAGINATION_ACTIVE_WIDTH = 18

const FALLBACK_ICON_ROW_HEIGHT = {
  large: 130,
  medium: 112,
  small: 96,
} as const

const fitCount = (container: number, item: number) => {
  if (item <= 0 || container <= item) return 1
  return Math.floor((container - item) / (item + GRID_GAP)) + 1
}

export function IconGrid({ icons }: IconGridProps) {
  const {
    iconSize,
    selectionMode,
    selectedIconKeys,
    toggleSelectIcon,
  } = useIconStore()

  const containerRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const columnWidth = ICON_SIZE_CONFIG[iconSize].columnWidth
  const fallbackRowHeight = FALLBACK_ICON_ROW_HEIGHT[iconSize]

  const [columns, setColumns] = useState(1)
  const [rows, setRows] = useState(1)
  const [currentPage, setCurrentPage] = useState(0)
  const [hoverPage, setHoverPage] = useState<number | null>(null)
  const [itemWidth, setItemWidth] = useState<number>(columnWidth)
  const [itemHeight, setItemHeight] = useState<number>(fallbackRowHeight)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    let raf = 0

    const recalc = () => {
      const width = el.clientWidth
      const height = el.clientHeight
      const firstIcon = gridRef.current?.querySelector<HTMLElement>('[data-icon]')
      const iconWidth = firstIcon?.offsetWidth ?? columnWidth
      const iconHeight = firstIcon?.offsetHeight ?? fallbackRowHeight

      setItemWidth(iconWidth)
      setItemHeight(iconHeight)
      setColumns(fitCount(width, iconWidth))
      setRows(fitCount(height, iconHeight))
    }

    const scheduleRecalc = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(recalc)
    }

    scheduleRecalc()
    const observer = new ResizeObserver(scheduleRecalc)
    observer.observe(el)
    if (gridRef.current) {
      observer.observe(gridRef.current)
    }
    window.addEventListener('resize', scheduleRecalc)

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      window.removeEventListener('resize', scheduleRecalc)
    }
  }, [columnWidth, fallbackRowHeight, icons.length, currentPage])

  const pageSize = Math.max(1, columns * rows)
  const pageCount = Math.max(1, Math.ceil(icons.length / pageSize))

  useEffect(() => {
    if (currentPage >= pageCount) {
      setCurrentPage(pageCount - 1)
    }
  }, [currentPage, pageCount])

  useEffect(() => {
    if (hoverPage !== null && hoverPage >= pageCount) {
      setHoverPage(null)
    }
  }, [hoverPage, pageCount])

  useEffect(() => {
    setCurrentPage(0)
  }, [icons.length, iconSize, pageSize])

  const pagedIcons = useMemo(() => {
    const start = currentPage * pageSize
    return icons.slice(start, start + pageSize)
  }, [icons, currentPage, pageSize])

  const selectedIconSet = useMemo(() => new Set(selectedIconKeys), [selectedIconKeys])
  const gridWidth = columns * itemWidth + Math.max(0, columns - 1) * GRID_GAP
  const gridHeight = rows * itemHeight + Math.max(0, rows - 1) * GRID_GAP

  return (
    <div className="relative h-full w-full px-16 pb-20 pt-24">
      <div ref={containerRef} className="flex h-full w-full items-center justify-center">
        <div
          className="relative"
          style={{
            width: `${gridWidth}px`,
            height: `${gridHeight}px`,
            maxWidth: '100%',
            maxHeight: '100%',
          }}
        >
          <div
            ref={gridRef}
            className="grid h-full w-full content-start justify-items-center gap-2"
            style={{
              gridTemplateColumns: `repeat(${columns}, ${itemWidth}px)`,
            }}
          >
            {pagedIcons.map(icon => {
              const selectionKey = buildIconSelectionKey(icon)
              return (
                <Icon
                  key={selectionKey}
                  icon={icon}
                  selectionKey={selectionKey}
                  selectionMode={selectionMode}
                  selected={selectedIconSet.has(selectionKey)}
                  onToggleSelect={toggleSelectIcon}
                />
              )
            })}
          </div>

          <div
            data-pagination
            className="absolute left-1/2 z-10 -translate-x-1/2 px-3 py-1.5"
            style={{ top: `calc(100% + ${PAGINATION_OFFSET}px)` }}
            onMouseLeave={() => setHoverPage(null)}
          >
            <div className="flex items-center" style={{ columnGap: `${PAGINATION_DOT_GAP}px` }}>
              {Array.from({ length: pageCount }, (_, index) => {
                const isCurrent = currentPage === index
                const isHovered = hoverPage === index
                const shouldExpand = isCurrent || isHovered

                return (
                  <button
                    key={index}
                    data-pagination
                    type="button"
                    aria-label={`切换到第 ${index + 1} 页`}
                    onMouseEnter={() => setHoverPage(index)}
                    onClick={() => setCurrentPage(index)}
                    className={`relative rounded-full transition-all duration-250 ease-out ${
                      isCurrent
                        ? 'bg-white/95 shadow-[0_0_10px_rgba(255,255,255,0.75)]'
                        : isHovered
                          ? 'bg-white/55'
                          : 'bg-white/35 hover:bg-white/45'
                    }`}
                    style={{
                      width: `${shouldExpand ? PAGINATION_ACTIVE_WIDTH : PAGINATION_DOT_SIZE}px`,
                      height: `${PAGINATION_DOT_SIZE}px`,
                    }}
                  />
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
