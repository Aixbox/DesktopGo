import { useLayoutEffect } from 'react'
import { animate, useMotionValue } from 'framer-motion'
import type { DesktopFolderTileMetrics } from '../views/folderVisualPolicy'
import { FOLDER_RESIZE_TRANSITION, interpolateFolderGeometry } from '../views/folderResizeMotion'

/** Animate only the folder's visual geometry, never the grid's occupancy or persisted size. */
export function useFolderResizeMotion(target: DesktopFolderTileMetrics, reducedMotion: boolean) {
  const geometry = useMotionValue(target)
  // Primitive dependencies keep repeated pointer previews from restarting the animation.
  const {
    footprintWidth,
    footprintHeight,
    bodyWidth,
    bodyHeight,
    singleSlotBodyExtent,
    shapeWidth,
    shapeHeight,
    panelBase,
    surfaceRadius,
  } = target
  useLayoutEffect(() => {
    const next = {
      footprintWidth,
      footprintHeight,
      bodyWidth,
      bodyHeight,
      singleSlotBodyExtent,
      shapeWidth,
      shapeHeight,
      panelBase,
      surfaceRadius,
    }
    const from = geometry.get()
    if (reducedMotion) {
      geometry.set(next)
      return
    }
    if (
      Object.keys(next).every(
        key => from[key as keyof typeof next] === next[key as keyof typeof next]
      )
    )
      return
    const animation = animate(0, 1, {
      ...FOLDER_RESIZE_TRANSITION,
      onUpdate: progress => geometry.set(interpolateFolderGeometry(from, next, progress)),
    })
    return () => animation.stop()
  }, [
    geometry,
    reducedMotion,
    footprintWidth,
    footprintHeight,
    bodyWidth,
    bodyHeight,
    singleSlotBodyExtent,
    shapeWidth,
    shapeHeight,
    panelBase,
    surfaceRadius,
  ])
  return geometry
}
