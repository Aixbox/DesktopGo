import { useLayoutEffect } from 'react'
import { animate, useMotionValue } from 'framer-motion'
import type { DesktopFolderTileMetrics } from '../views/folderVisualPolicy'
import { FOLDER_RESIZE_TRANSITION, interpolateFolderGeometry } from '../views/folderResizeMotion'

export type TileResizeDisplay = DesktopFolderTileMetrics & { artworkSize?: number }

/** Animate visual geometry only; grid occupancy and persisted sizes stay discrete. */
export function useFolderResizeMotion(
  target: DesktopFolderTileMetrics,
  reducedMotion: boolean,
  artworkSize?: number
) {
  const geometry = useMotionValue<TileResizeDisplay>({
    ...target,
    ...(artworkSize === undefined ? {} : { artworkSize }),
  })
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
      ...(artworkSize === undefined ? {} : { artworkSize }),
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
    artworkSize,
  ])
  return geometry
}
