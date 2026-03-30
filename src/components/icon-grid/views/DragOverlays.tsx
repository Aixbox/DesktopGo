import { AppWindow } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, type MutableRefObject } from 'react'
import type { DesktopIcon } from '../../../types'
import {
  ICON_GRID_TILE_PADDING_Y,
  ICON_GRID_TITLE_GAP,
  ICON_GRID_TITLE_HEIGHT,
} from '../../../types'
import type { FolderItem, GridItem } from '../model'
import { getGridItemSpan } from '../model'
import type { FolderDropFlight, MultiDropFlightItem } from '../state/types'
import { DESKTOP_FOLDER_SURFACE_CLASS, FolderIconVisual } from './FolderVisuals'

interface DragGhostPointer {
  pointerX: number
  pointerY: number
}

interface DragOverlaysProps {
  dragPointerRef: MutableRefObject<DragGhostPointer | null>
  ghostItem: GridItem | null
  iconImageSize: number
  slotWidth: number
  slotHeight: number
  gridGap: number
  dragSessionId: number | null
  stackedIcons: Array<{
    id: string
    icon: DesktopIcon
    sourceCenter: { x: number; y: number }
  }>
  folderDropFlight: FolderDropFlight | null
  multiDropFlight: MultiDropFlightItem[] | null
  reorderAnimationMs: number
  folderPreviewEasing: string
}

const GHOST_FOLDER_INNER_PADDING = 8
const GHOST_FOLDER_INNER_GAP = 6
const GHOST_PREVIEW_ICON_SCALE = 0.84
const GHOST_PREVIEW_ICON_FALLBACK_SCALE = 0.68

const clampNumber = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const getGhostFolderSurfaceRadius = (panelBase: number) =>
  Math.round(clampNumber(panelBase * 0.2, 16, 24))

const getSingleSlotGhostPreviewInset = (panelBase: number) =>
  Math.round(clampNumber(panelBase * 0.06, 3, 5))

interface StackGhostPosition {
  left: number
  top: number
}

interface PointerTrailSample extends StackGhostPosition {
  timestamp: number
}

const STACK_TRAIL_HISTORY_MS = 280
const STACK_TRAIL_DELAY_MS = 34
const STACK_IDLE_RETURN_MS = 28
const STACK_REST_OFFSET_Y = 0
const STACK_REST_STEP_Y = 0
const STACK_FOLLOW_EPSILON = 0.1
const STACK_RETURN_BLEND_BASE = 0.16
const STACK_RETURN_BLEND_STEP = 0.03
const STACK_RETURN_SETTLE_DISTANCE = 0.18

function sampleTrailPosition(
  samples: PointerTrailSample[],
  targetTimestamp: number
): StackGhostPosition | null {
  if (samples.length === 0) return null
  if (targetTimestamp <= samples[0].timestamp) {
    return { left: samples[0].left, top: samples[0].top }
  }

  for (let index = samples.length - 1; index > 0; index -= 1) {
    const current = samples[index]
    const previous = samples[index - 1]
    if (targetTimestamp < previous.timestamp) continue
    if (current.timestamp <= previous.timestamp) {
      return { left: current.left, top: current.top }
    }

    const progress = clampNumber(
      (targetTimestamp - previous.timestamp) / (current.timestamp - previous.timestamp),
      0,
      1
    )
    return {
      left: previous.left + (current.left - previous.left) * progress,
      top: previous.top + (current.top - previous.top) * progress,
    }
  }

  const latest = samples[samples.length - 1]
  return { left: latest.left, top: latest.top }
}

function hasStackPositionChanged(
  previous: StackGhostPosition[],
  next: StackGhostPosition[]
): boolean {
  if (previous.length !== next.length) return true

  return next.some((position, index) => {
    const before = previous[index]
    if (!before) return true
    return (
      Math.abs(before.left - position.left) > STACK_FOLLOW_EPSILON ||
      Math.abs(before.top - position.top) > STACK_FOLLOW_EPSILON
    )
  })
}

interface GhostPreviewIconProps {
  iconBase64: string
  name: string
  size: number
}

function GhostPreviewIcon({ iconBase64, name, size }: GhostPreviewIconProps) {
  return (
    <div
      className="flex items-center justify-center rounded-2xl"
      style={{ width: `${size}px`, height: `${size}px` }}
    >
      {iconBase64 ? (
        <img
          src={iconBase64}
          alt={name}
          className="object-contain"
          style={{
            width: `${Math.max(20, Math.floor(size * GHOST_PREVIEW_ICON_SCALE))}px`,
            height: `${Math.max(20, Math.floor(size * GHOST_PREVIEW_ICON_SCALE))}px`,
          }}
          draggable={false}
        />
      ) : (
        <AppWindow
          className="text-foreground/55 dark:text-white/70"
          style={{
            width: `${Math.max(16, Math.floor(size * GHOST_PREVIEW_ICON_FALLBACK_SCALE))}px`,
            height: `${Math.max(16, Math.floor(size * GHOST_PREVIEW_ICON_FALLBACK_SCALE))}px`,
          }}
        />
      )}
    </div>
  )
}

function FolderGhost({
  folder,
  slotWidth,
  slotHeight,
  gridGap,
}: {
  folder: FolderItem
  slotWidth: number
  slotHeight: number
  gridGap: number
}) {
  const span = getGridItemSpan(folder)
  const footprintWidth = span.cols * slotWidth + Math.max(0, span.cols - 1) * gridGap
  const footprintHeight = span.rows * slotHeight + Math.max(0, span.rows - 1) * gridGap
  const bodyWidth = Math.max(40, footprintWidth - ICON_GRID_TILE_PADDING_Y * 2)
  const bodyHeight = Math.max(
    32,
    footprintHeight - ICON_GRID_TILE_PADDING_Y * 2 - ICON_GRID_TITLE_HEIGHT - ICON_GRID_TITLE_GAP
  )
  const singleSlotBodyExtent = Math.max(
    32,
    slotHeight - ICON_GRID_TILE_PADDING_Y * 2 - ICON_GRID_TITLE_HEIGHT - ICON_GRID_TITLE_GAP
  )
  const shapeWidth =
    folder.size === '1x2'
      ? Math.min(bodyWidth, singleSlotBodyExtent)
      : folder.size === '2x2' || folder.size === '1x1'
        ? Math.min(bodyWidth, bodyHeight)
        : bodyWidth
  const shapeHeight =
    folder.size === '2x1'
      ? Math.min(bodyHeight, singleSlotBodyExtent)
      : folder.size === '2x2' || folder.size === '1x1'
        ? shapeWidth
        : bodyHeight
  const panelBase = Math.max(32, Math.min(shapeWidth, shapeHeight))
  const surfaceRadius = getGhostFolderSurfaceRadius(panelBase)
  const innerPadding = Math.min(GHOST_FOLDER_INNER_PADDING, Math.max(4, Math.floor(panelBase / 8)))
  const innerGap = Math.min(GHOST_FOLDER_INNER_GAP, Math.max(4, Math.floor(panelBase / 16)))

  if (folder.size === '1x1') {
    const previewInset = getSingleSlotGhostPreviewInset(panelBase)
    const previewSize = Math.max(24, shapeWidth - previewInset * 2)

    return (
      <div
        className="flex items-center justify-center"
        style={{ width: `${bodyWidth}px`, height: `${bodyHeight}px` }}
      >
        <div
          className={`${DESKTOP_FOLDER_SURFACE_CLASS} flex items-center justify-center`}
          style={{
            width: `${shapeWidth}px`,
            height: `${shapeHeight}px`,
            borderRadius: `${surfaceRadius}px`,
          }}
        >
          <FolderIconVisual
            icons={folder.children.map(child => child.icon)}
            imgSize={previewSize}
            withSurface={false}
          />
        </div>
      </div>
    )
  }

  const previewIcons =
    folder.size === '2x2' ? folder.children.slice(0, 9) : folder.children.slice(0, 3)
  const rows = folder.size === '2x2' ? 3 : folder.size === '1x2' ? 3 : 1
  const cols = folder.size === '2x2' ? 3 : folder.size === '2x1' ? 3 : 1
  const iconSize = Math.max(
    14,
    Math.floor(
      Math.min(
        (shapeWidth - innerPadding * 2 - innerGap * Math.max(0, cols - 1)) / cols,
        (shapeHeight - innerPadding * 2 - innerGap * Math.max(0, rows - 1)) / rows
      )
    )
  )

  return (
    <div
      className="flex items-center justify-center"
      style={{ width: `${bodyWidth}px`, height: `${bodyHeight}px` }}
    >
      <div
        className={`${DESKTOP_FOLDER_SURFACE_CLASS}`}
        style={{
          width: `${shapeWidth}px`,
          height: `${shapeHeight}px`,
          borderRadius: `${surfaceRadius}px`,
        }}
      >
        <div
          className="absolute inset-0 grid place-items-center"
          style={{
            padding: `${innerPadding}px`,
            gap: `${innerGap}px`,
            gridTemplateColumns: `repeat(${cols}, minmax(0, ${iconSize}px))`,
            gridTemplateRows: `repeat(${rows}, minmax(0, ${iconSize}px))`,
          }}
        >
          {previewIcons.map(icon => (
            <GhostPreviewIcon
              key={icon.key}
              iconBase64={icon.icon.icon_base64}
              name={icon.icon.name}
              size={iconSize}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function applyGhostTransform(node: HTMLDivElement | null, left: number, top: number) {
  if (!node) return
  node.style.transform = `translate3d(${left}px, ${top}px, 0)`
}

export function DragOverlays({
  dragPointerRef,
  ghostItem,
  iconImageSize,
  slotWidth,
  slotHeight,
  gridGap,
  dragSessionId,
  stackedIcons,
  folderDropFlight,
  multiDropFlight,
  reorderAnimationMs,
  folderPreviewEasing,
}: DragOverlaysProps) {
  const pointerAnimationFrameRef = useRef<number | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const leaderNodeRef = useRef<HTMLDivElement | null>(null)
  const stackNodeRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const trailSamplesRef = useRef<PointerTrailSample[]>([])
  const stackPositionsRef = useRef<StackGhostPosition[]>([])
  const stackedIconsRef = useRef(stackedIcons)
  const lastMoveAtRef = useRef(0)
  const stackedIconSignature = stackedIcons.map(entry => entry.id).join('|')

  stackedIconsRef.current = stackedIcons

  const folderSpan = ghostItem?.kind === 'folder' ? getGridItemSpan(ghostItem) : null
  const folderFootprintWidth = folderSpan
    ? folderSpan.cols * slotWidth + Math.max(0, folderSpan.cols - 1) * gridGap
    : 0
  const folderFootprintHeight = folderSpan
    ? folderSpan.rows * slotHeight + Math.max(0, folderSpan.rows - 1) * gridGap
    : 0
  const ghostWidth = ghostItem?.kind === 'folder' ? folderFootprintWidth : iconImageSize
  const ghostHeight = ghostItem?.kind === 'folder' ? folderFootprintHeight : iconImageSize
  const initialDragPointer = dragPointerRef.current

  const setStackNodeRef = (id: string, node: HTMLDivElement | null) => {
    if (node) {
      stackNodeRefs.current.set(id, node)
      return
    }

    stackNodeRefs.current.delete(id)
  }

  useLayoutEffect(() => {
    const currentPointer = dragPointerRef.current
    if (!currentPointer || !ghostItem) return
    applyGhostTransform(
      leaderNodeRef.current,
      currentPointer.pointerX - ghostWidth / 2,
      currentPointer.pointerY - ghostHeight / 2
    )
  }, [dragSessionId, ghostHeight, ghostItem?.kind, ghostWidth])

  useLayoutEffect(() => {
    if (ghostItem?.kind !== 'icon' || stackedIcons.length === 0) return

    stackedIcons.forEach((entry, index) => {
      const position = stackPositionsRef.current[index]
      if (position) {
        applyGhostTransform(
          stackNodeRefs.current.get(entry.id) ?? null,
          position.left,
          position.top
        )
        return
      }

      applyGhostTransform(
        stackNodeRefs.current.get(entry.id) ?? null,
        entry.sourceCenter.x - iconImageSize / 2,
        entry.sourceCenter.y - iconImageSize / 2
      )
    })
  }, [dragSessionId, ghostItem?.kind, iconImageSize, stackedIconSignature])

  useEffect(() => {
    if (!dragSessionId || !ghostItem) {
      if (pointerAnimationFrameRef.current !== null) {
        cancelAnimationFrame(pointerAnimationFrameRef.current)
        pointerAnimationFrameRef.current = null
      }
      return
    }

    const tick = () => {
      const latestPointer = dragPointerRef.current
      if (latestPointer) {
        applyGhostTransform(
          leaderNodeRef.current,
          latestPointer.pointerX - ghostWidth / 2,
          latestPointer.pointerY - ghostHeight / 2
        )
      }
      pointerAnimationFrameRef.current = requestAnimationFrame(tick)
    }

    tick()
    return () => {
      if (pointerAnimationFrameRef.current !== null) {
        cancelAnimationFrame(pointerAnimationFrameRef.current)
        pointerAnimationFrameRef.current = null
      }
    }
  }, [dragPointerRef, dragSessionId, ghostHeight, ghostItem?.kind, ghostWidth])

  useEffect(() => {
    const initialPointer = dragPointerRef.current
    if (
      !dragSessionId ||
      ghostItem?.kind !== 'icon' ||
      stackedIcons.length === 0 ||
      !initialPointer
    ) {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      trailSamplesRef.current = []
      stackPositionsRef.current = []
      lastMoveAtRef.current = 0
      return
    }

    const initialPositions = stackedIcons.map(entry => ({
      left: entry.sourceCenter.x - iconImageSize / 2,
      top: entry.sourceCenter.y - iconImageSize / 2,
    }))
    const leaderLeft = initialPointer.pointerX - iconImageSize / 2
    const leaderTop = initialPointer.pointerY - iconImageSize / 2
    const startedAt = performance.now()

    stackedIcons.forEach((entry, index) => {
      const position = initialPositions[index]
      if (!position) return
      applyGhostTransform(stackNodeRefs.current.get(entry.id) ?? null, position.left, position.top)
    })
    trailSamplesRef.current = [{ left: leaderLeft, top: leaderTop, timestamp: startedAt }]
    stackPositionsRef.current = initialPositions
    lastMoveAtRef.current = Number.NEGATIVE_INFINITY

    const tick = (now: number) => {
      const latestPointer = dragPointerRef.current
      const latestIcons = stackedIconsRef.current
      if (!latestPointer || latestIcons.length === 0) {
        animationFrameRef.current = null
        return
      }

      const currentLeaderLeft = latestPointer.pointerX - iconImageSize / 2
      const currentLeaderTop = latestPointer.pointerY - iconImageSize / 2
      const trailSamples = trailSamplesRef.current
      const latestSample = trailSamples[trailSamples.length - 1] ?? null
      const deltaDistance = latestSample
        ? Math.hypot(currentLeaderLeft - latestSample.left, currentLeaderTop - latestSample.top)
        : Number.POSITIVE_INFINITY

      if (!latestSample || deltaDistance > 0.75 || now - latestSample.timestamp > 16) {
        trailSamples.push({
          left: currentLeaderLeft,
          top: currentLeaderTop,
          timestamp: now,
        })
        if (deltaDistance > 0.75) {
          lastMoveAtRef.current = now
        }
      }

      while (trailSamples.length > 2 && now - trailSamples[0].timestamp > STACK_TRAIL_HISTORY_MS) {
        trailSamples.shift()
      }

      const isMoving = now - lastMoveAtRef.current < STACK_IDLE_RETURN_MS
      const previousPositions = stackPositionsRef.current
      const nextPositions = latestIcons.map((_, index) => {
        const restTarget = {
          left: currentLeaderLeft,
          top: currentLeaderTop + STACK_REST_OFFSET_Y + index * STACK_REST_STEP_Y,
        }
        const target = isMoving
          ? (sampleTrailPosition(trailSamples, now - STACK_TRAIL_DELAY_MS * (index + 1)) ??
            restTarget)
          : restTarget
        const current = previousPositions[index] ?? initialPositions[index] ?? restTarget
        if (!isMoving) {
          const settleBlend = Math.max(
            0.1,
            STACK_RETURN_BLEND_BASE - index * STACK_RETURN_BLEND_STEP
          )
          const nextPosition = {
            left: current.left + (restTarget.left - current.left) * settleBlend,
            top: current.top + (restTarget.top - current.top) * settleBlend,
          }
          const settled =
            Math.abs(restTarget.left - nextPosition.left) <= STACK_RETURN_SETTLE_DISTANCE &&
            Math.abs(restTarget.top - nextPosition.top) <= STACK_RETURN_SETTLE_DISTANCE

          return settled ? restTarget : nextPosition
        }

        const blend = Math.max(0.18, 0.36 - index * 0.04)

        return {
          left: current.left + (target.left - current.left) * blend,
          top: current.top + (target.top - current.top) * blend,
        }
      })

      stackPositionsRef.current = nextPositions
      if (hasStackPositionChanged(previousPositions, nextPositions)) {
        latestIcons.forEach((entry, index) => {
          const position = nextPositions[index]
          if (!position) return
          applyGhostTransform(
            stackNodeRefs.current.get(entry.id) ?? null,
            position.left,
            position.top
          )
        })
      }

      animationFrameRef.current = requestAnimationFrame(tick)
    }

    animationFrameRef.current = requestAnimationFrame(tick)
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [dragPointerRef, dragSessionId, ghostItem?.kind, iconImageSize, stackedIconSignature])

  return (
    <>
      {initialDragPointer && ghostItem ? (
        <>
          {ghostItem.kind === 'icon' && stackedIcons.length > 0
            ? stackedIcons.map((entry, index) => {
                const scale = Math.max(0.82, 0.96 - index * 0.04)

                return (
                  <div
                    key={entry.id}
                    ref={node => setStackNodeRef(entry.id, node)}
                    className="pointer-events-none fixed"
                    style={{
                      zIndex: 48 - index,
                      width: iconImageSize,
                      height: iconImageSize,
                      left: 0,
                      top: 0,
                      willChange: 'transform',
                    }}
                  >
                    <div
                      className="flex h-full w-full items-center justify-center"
                      style={{ transform: `scale(${scale})` }}
                    >
                      {entry.icon.icon_base64 ? (
                        <img
                          src={entry.icon.icon_base64}
                          alt={entry.icon.name}
                          className="object-contain"
                          style={{ width: iconImageSize, height: iconImageSize }}
                          draggable={false}
                        />
                      ) : (
                        <AppWindow className="h-8 w-8 text-foreground/70" />
                      )}
                    </div>
                  </div>
                )
              })
            : null}

          <div
            ref={leaderNodeRef}
            className="pointer-events-none fixed z-50"
            style={{
              width: ghostWidth,
              height: ghostHeight,
              left: 0,
              top: 0,
              willChange: 'transform',
            }}
          >
            <div
              className="flex items-center justify-center"
              style={{ width: ghostWidth, height: ghostHeight }}
            >
              {ghostItem.kind === 'icon' ? (
                ghostItem.icon.icon_base64 ? (
                  <img
                    src={ghostItem.icon.icon_base64}
                    alt={ghostItem.icon.name}
                    className="object-contain"
                    style={{ width: iconImageSize, height: iconImageSize }}
                    draggable={false}
                  />
                ) : (
                  <AppWindow className="h-8 w-8 text-foreground/70" />
                )
              ) : (
                <FolderGhost
                  folder={ghostItem}
                  slotWidth={slotWidth}
                  slotHeight={slotHeight}
                  gridGap={gridGap}
                />
              )}
            </div>
          </div>
        </>
      ) : null}

      {multiDropFlight
        ? multiDropFlight.map(item => (
            <div
              key={item.id}
              className="pointer-events-none fixed"
              style={{
                zIndex: item.zIndex,
                width: iconImageSize,
                height: iconImageSize,
                left: item.animate ? item.endLeft : item.startLeft,
                top: item.animate ? item.endTop : item.startTop,
                opacity: item.animate ? item.endOpacity : item.startOpacity,
                transform: `scale(${item.animate ? item.endScale : item.startScale})`,
                transition: `left ${reorderAnimationMs}ms ${folderPreviewEasing}, top ${reorderAnimationMs}ms ${folderPreviewEasing}, transform ${reorderAnimationMs}ms ${folderPreviewEasing}, opacity ${reorderAnimationMs}ms ease-out`,
              }}
            >
              {item.icon.icon_base64 ? (
                <img
                  src={item.icon.icon_base64}
                  alt={item.icon.name}
                  className="object-contain"
                  style={{ width: iconImageSize, height: iconImageSize }}
                  draggable={false}
                />
              ) : (
                <AppWindow className="h-8 w-8 text-foreground/70" />
              )}
            </div>
          ))
        : null}

      {folderDropFlight ? (
        <div
          className="pointer-events-none fixed z-[55]"
          style={{
            left:
              (folderDropFlight.animate ? folderDropFlight.endX : folderDropFlight.startX) -
              (folderDropFlight.animate ? folderDropFlight.endSize : folderDropFlight.startSize) /
                2,
            top:
              (folderDropFlight.animate ? folderDropFlight.endY : folderDropFlight.startY) -
              (folderDropFlight.animate ? folderDropFlight.endSize : folderDropFlight.startSize) /
                2,
            width: folderDropFlight.animate ? folderDropFlight.endSize : folderDropFlight.startSize,
            height: folderDropFlight.animate
              ? folderDropFlight.endSize
              : folderDropFlight.startSize,
            opacity: folderDropFlight.animate ? 0.92 : 1,
            transition: `left ${reorderAnimationMs}ms ${folderPreviewEasing}, top ${reorderAnimationMs}ms ${folderPreviewEasing}, width ${reorderAnimationMs}ms ${folderPreviewEasing}, height ${reorderAnimationMs}ms ${folderPreviewEasing}, opacity ${reorderAnimationMs}ms ease-out`,
          }}
        >
          {folderDropFlight.icon.icon_base64 ? (
            <img
              src={folderDropFlight.icon.icon_base64}
              alt={folderDropFlight.icon.name}
              className="h-full w-full object-contain"
              draggable={false}
            />
          ) : (
            <AppWindow className="h-full w-full text-foreground/70" />
          )}
        </div>
      ) : null}
    </>
  )
}
