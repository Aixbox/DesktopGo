import { useEffect, useRef, useState } from 'react'
import { DEFAULT_FOLDER_LAYOUT_PROFILE, type FolderLayoutProfile } from '../domain/folderLayout'

interface UseFolderGridMeasurementParams {
  open: boolean
  renderOrderLength: number
  columnWidth: number
  rowHeight: number
  profile?: FolderLayoutProfile
}

export function useFolderGridMeasurement({
  open,
  renderOrderLength,
  columnWidth,
  rowHeight,
  profile = DEFAULT_FOLDER_LAYOUT_PROFILE,
}: UseFolderGridMeasurementParams) {
  const folderGridContainerRef = useRef<HTMLDivElement>(null)
  const folderGridRef = useRef<HTMLDivElement>(null)
  const [folderItemWidth, setFolderItemWidth] = useState(columnWidth)
  const [folderItemHeight, setFolderItemHeight] = useState(rowHeight)
  const [folderColumns, setFolderColumns] = useState(() => Math.max(1, profile.columns))

  const resetFolderGridMeasurement = () => {
    setFolderItemWidth(columnWidth)
    setFolderItemHeight(rowHeight)
    setFolderColumns(Math.max(1, profile.columns))
  }

  useEffect(() => {
    const container = folderGridContainerRef.current
    if (!container || !open) return

    let animationFrame = 0
    const recalculate = () => {
      const firstItem = folderGridRef.current?.querySelector<HTMLElement>('[data-folder-grid-item]')
      setFolderItemWidth(firstItem?.offsetWidth ?? columnWidth)
      setFolderItemHeight(firstItem?.offsetHeight ?? rowHeight)
      setFolderColumns(Math.max(1, profile.columns))
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
  }, [columnWidth, open, profile.columns, renderOrderLength, rowHeight])

  return {
    folderGridContainerRef,
    folderGridRef,
    folderItemWidth,
    folderItemHeight,
    folderColumns,
    resetFolderGridMeasurement,
  }
}
