import { useEffect, useRef, useState } from 'react'
import { getDefaultFolderColumnCount } from '../domain/gridGeometry'
import { FOLDER_MODAL_MAX_WIDTH } from '../views/folderVisualPolicy'

interface UseFolderGridMeasurementParams {
  open: boolean
  renderOrderLength: number
  columnWidth: number
  rowHeight: number
}

export function useFolderGridMeasurement({
  open,
  renderOrderLength,
  columnWidth,
  rowHeight,
}: UseFolderGridMeasurementParams) {
  const folderGridContainerRef = useRef<HTMLDivElement>(null)
  const folderGridRef = useRef<HTMLDivElement>(null)
  const [folderItemWidth, setFolderItemWidth] = useState(columnWidth)
  const [folderItemHeight, setFolderItemHeight] = useState(rowHeight)
  const [folderColumns, setFolderColumns] = useState(() =>
    getDefaultFolderColumnCount(columnWidth, FOLDER_MODAL_MAX_WIDTH)
  )

  const resetFolderGridMeasurement = () => {
    setFolderItemWidth(columnWidth)
    setFolderItemHeight(rowHeight)
    setFolderColumns(getDefaultFolderColumnCount(columnWidth, FOLDER_MODAL_MAX_WIDTH))
  }

  useEffect(() => {
    const container = folderGridContainerRef.current
    if (!container || !open) return

    let animationFrame = 0
    const recalculate = () => {
      const firstItem = folderGridRef.current?.querySelector<HTMLElement>('[data-folder-grid-item]')
      const tileWidth = firstItem?.offsetWidth ?? columnWidth
      setFolderItemWidth(tileWidth)
      setFolderItemHeight(firstItem?.offsetHeight ?? rowHeight)
      setFolderColumns(getDefaultFolderColumnCount(tileWidth, FOLDER_MODAL_MAX_WIDTH))
    }
    const schedule = () => {
      cancelAnimationFrame(animationFrame)
      animationFrame = requestAnimationFrame(recalculate)
    }

    schedule()
    const observer = new ResizeObserver(schedule)
    observer.observe(container)
    if (folderGridRef.current) observer.observe(folderGridRef.current)
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(animationFrame)
      observer.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [columnWidth, open, renderOrderLength, rowHeight])

  return {
    folderGridContainerRef,
    folderGridRef,
    folderItemWidth,
    folderItemHeight,
    folderColumns,
    resetFolderGridMeasurement,
  }
}
