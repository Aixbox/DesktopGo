import {
  getIconGridTitleHeight,
  ICON_GRID_TILE_PADDING_Y,
  ICON_GRID_TITLE_GAP,
  type TitleLineCount,
} from '../../../types/index'
import type { GridSpan, TileSize } from '../model'
import {
  DESKTOP_TILE_SURFACE_CLASS,
  getDesktopFolderTileMetrics,
  type DesktopFolderTileMetrics,
} from './folderVisualPolicy'
import { folderSizeFromSpan } from '../domain/folderResizePolicy'

export interface IconGridTileConfig {
  metrics: DesktopFolderTileMetrics
  span: GridSpan
  slotWidth: number
  slotHeight: number
  gridGap: number
  onPreview?: (size: TileSize) => void
  onCommit?: (size: TileSize) => void
  onCancel?: () => void
}

/** Keep small icon surfaces rounded in proportion to their visible short edge. */
export const getIconPreviewSurfaceRadius = (width: number, height = width): number =>
  Math.min(width, height) / 4

/** Rectangular tiles leave 10% on each narrow edge; 2x2 retains half-width artwork. */
export function getIconForegroundSize(
  span: GridSpan,
  surfaceWidth: number,
  surfaceHeight: number
): number | undefined {
  if (span.cols === 2 && span.rows === 2) return surfaceWidth / 2
  if (span.cols > 1 || span.rows > 1) return Math.min(surfaceWidth, surfaceHeight) * 0.8
  return undefined
}

/** Artwork retains its aspect ratio inside the resized workspace surface. */
export function getIconTileMetrics({
  span,
  slotWidth,
  slotHeight,
  gridGap,
  imageSize,
  titleLineCount,
}: {
  span: GridSpan
  slotWidth: number
  slotHeight: number
  gridGap: number
  imageSize: number
  titleLineCount: TitleLineCount
}): DesktopFolderTileMetrics {
  if (span.cols > 1 || span.rows > 1) {
    return getDesktopFolderTileMetrics({
      span,
      slotWidth,
      slotHeight,
      gridGap,
      titleLineCount,
      folderSize: folderSizeFromSpan(span),
      surfaceTitleLineCount: 'two',
    })
  }
  const footprintWidth = span.cols * slotWidth + (span.cols - 1) * gridGap
  const footprintHeight = span.rows * slotHeight + (span.rows - 1) * gridGap
  const singleSlotBodyExtent =
    slotHeight -
    ICON_GRID_TILE_PADDING_Y * 2 -
    getIconGridTitleHeight(titleLineCount) -
    ICON_GRID_TITLE_GAP
  const bodyHeight = singleSlotBodyExtent + (span.rows - 1) * (slotHeight + gridGap)
  const shapeWidth = imageSize + (span.cols - 1) * (slotWidth + gridGap)
  const shapeHeight =
    Math.min(imageSize, singleSlotBodyExtent) + (span.rows - 1) * (slotHeight + gridGap)
  return {
    footprintWidth,
    footprintHeight,
    bodyWidth: footprintWidth,
    bodyHeight,
    singleSlotBodyExtent,
    shapeWidth,
    shapeHeight,
    panelBase: Math.min(shapeWidth, shapeHeight),
    surfaceRadius: Math.min(16, imageSize / 4),
  }
}

export const ICON_TILE_RESIZE_TRANSITION =
  'width 280ms cubic-bezier(0.22,1,0.36,1), height 280ms cubic-bezier(0.22,1,0.36,1), border-radius 280ms cubic-bezier(0.22,1,0.36,1), translate 280ms cubic-bezier(0.22,1,0.36,1), transform 280ms cubic-bezier(0.22,1,0.36,1)'
export const ENLARGED_ICON_SURFACE_CLASS = `${DESKTOP_TILE_SURFACE_CLASS} border-0`
