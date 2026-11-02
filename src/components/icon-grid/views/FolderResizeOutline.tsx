import { useLayoutEffect, useRef, type RefObject } from 'react'
import { motion, useTransform, type MotionValue } from 'framer-motion'
import type { FolderResizeVisualGeometry } from '../domain/folderResizePolicy'
import { getFolderResizeOutlinePaths } from '../domain/folderResizeOutlineGeometry'
import {
  folderResizeHitAreaClip,
  getFolderResizeHitArea,
  getFolderResizeHitInsets,
} from '../domain/folderResizeHitArea'
import type { FolderResizeInteraction } from '../hooks/useFolderResizeInteraction'
import { scaledRadius, type DesktopFolderTileMetrics } from './folderVisualPolicy'

interface FolderResizeOutlineProps {
  label?: string
  display: MotionValue<DesktopFolderTileMetrics>
  geometry: FolderResizeVisualGeometry
  rtl: boolean
  interaction: FolderResizeInteraction
}

function useOutlinePaths({ display, geometry, rtl }: FolderResizeOutlineProps) {
  const surfaceRef = useRef<HTMLSpanElement>(null)
  const frameRef = useRef<SVGPathElement>(null)
  const handleRef = useRef<SVGPathElement>(null)
  const hitAreaRef = useRef<HTMLButtonElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const { frameStrokeWidth, handleStrokeWidth, handleArcLength } = geometry
  const { x: hitInsetX, y: hitInsetY } = getFolderResizeHitInsets(geometry)
  useLayoutEffect(() => {
    if (!surfaceRef.current) return
    // Read resolved CSS so the SVG follows the app's compensated corners and round fallback.
    const style = window.getComputedStyle(surfaceRef.current)
    const shape =
      style.getPropertyValue('corner-bottom-right-shape') || style.getPropertyValue('corner-shape')
    const superellipse = /^superellipse\(([-\d.]+)\)$/.exec(shape.trim())
    const exponent =
      shape.trim() === 'squircle' ? 4 : superellipse ? 2 ** Number(superellipse[1]) : 2
    const radiusScale = Number.parseFloat(style.getPropertyValue('--ui-corner-radius-scale')) || 1
    const draw = (metrics: DesktopFolderTileMetrics) => {
      const { shapeWidth: width, shapeHeight: height, surfaceRadius: radius } = metrics
      const paths = getFolderResizeOutlinePaths({
        width,
        height,
        radius: radius * radiusScale,
        exponent,
        frameStrokeWidth,
        handleArcLength,
        rtl,
      })
      svgRef.current?.setAttribute('viewBox', `0 0 ${width} ${height}`)
      frameRef.current?.setAttribute('d', paths.frame)
      handleRef.current?.setAttribute('d', paths.handle)
      if (hitAreaRef.current) {
        hitAreaRef.current.style.clipPath = folderResizeHitAreaClip(
          getFolderResizeHitArea({
            points: paths.handlePoints,
            strokeWidth: handleStrokeWidth,
            offsetX: hitInsetX,
            offsetY: hitInsetY,
          })
        )
      }
    }
    draw(display.get())
    return display.on('change', draw)
  }, [display, frameStrokeWidth, handleStrokeWidth, handleArcLength, hitInsetX, hitInsetY, rtl])
  return { surfaceRef, frameRef, handleRef, hitAreaRef, svgRef }
}

function ResizeHitTarget({
  label = '调整文件夹大小',
  hitAreaRef,
  geometry,
  interaction,
}: Pick<FolderResizeOutlineProps, 'geometry' | 'interaction' | 'label'> & {
  hitAreaRef: RefObject<HTMLButtonElement | null>
}) {
  const insets = getFolderResizeHitInsets(geometry)
  return (
    <button
      ref={hitAreaRef}
      data-folder-resize-hit-area
      type="button"
      aria-label={label}
      title={`拖动${label}`}
      className="pointer-events-auto absolute touch-none rounded-none border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      style={{
        inset: `${-insets.y}px ${-insets.x}px`,
        clipPath: 'polygon(0 0, 0 0, 0 0)',
      }}
      onPointerDown={interaction.startPointerResize}
      onPointerMove={interaction.movePointerResize}
      onPointerUp={interaction.finishPointerResize}
      onPointerCancel={event => interaction.finishPointerResize(event, true)}
      onClick={event => event.stopPropagation()}
    />
  )
}

export function FolderResizeOutline(props: FolderResizeOutlineProps) {
  const { display, geometry, interaction } = props
  const { surfaceRef, frameRef, handleRef, hitAreaRef, svgRef } = useOutlinePaths(props)
  const borderRadius = useTransform(display, m => scaledRadius(m.surfaceRadius))
  return (
    <motion.span
      ref={surfaceRef}
      className="pointer-events-none absolute overflow-visible"
      style={{
        inset: `${geometry.backgroundPaddingY}px ${geometry.backgroundPaddingX}px`,
        borderRadius,
      }}
    >
      <svg
        data-item-focus-part
        ref={svgRef}
        aria-hidden="true"
        className="absolute inset-0 h-full w-full overflow-visible"
      >
        <path
          ref={frameRef}
          data-folder-resize-stroke
          className="text-white dark:text-black"
          fill="none"
          stroke="currentColor"
          strokeWidth={geometry.frameStrokeWidth}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <path
          ref={handleRef}
          data-folder-resize-arc
          className="text-white dark:text-black"
          fill="none"
          stroke="currentColor"
          strokeWidth={geometry.handleStrokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <ResizeHitTarget
        label={props.label}
        hitAreaRef={hitAreaRef}
        geometry={geometry}
        interaction={interaction}
      />
    </motion.span>
  )
}
