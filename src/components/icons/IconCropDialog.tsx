import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { invoke } from '@tauri-apps/api/core'
import Cropper, { type MediaSize, type Point, type Size } from 'react-easy-crop'
import {
  Check,
  Crop,
  Pipette,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Sparkles,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import {
  constrainCropFramePosition,
  constrainMediaPositionToViewport,
  clampCropCornerRadii,
  cropImageViewportDataUri,
  extractImageColorAtViewportPoint,
  getImageBoundedSquareCropSize,
  getNextIconCropWheelZoom,
  getUpscaledContainObjectFit,
  ICON_CROP_MAX_ZOOM,
  ICON_CROP_MIN_ZOOM,
  ICON_CROP_OUTPUT_SIZE,
  resizeCropCornerRadius,
  resizeSquareCrop,
  type CropCorner,
  type CropCornerRadii,
  type CropResizeHandle,
  type UpscaledContainObjectFit,
} from '@/lib/imageCrop'
import { translate } from '@/lib/i18n'
import {
  createIconWithBackgroundColorDataUri,
  ICON_COLOR_PRESETS,
  type IconColorId,
} from '@/lib/textIcon'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export type IconCropResult = {
  dataUri: string
  colorId: IconColorId
  cornerRadii: CropCornerRadii
}

type IconCropDialogProps = {
  open: boolean
  source: string
  initialColor: IconColorId
  onCancel: () => void
  onApply: (result: IconCropResult) => void
}

const INITIAL_CROP: Point = { x: 0, y: 0 }
const INITIAL_CORNER_RADII: CropCornerRadii = { nw: 0, ne: 0, se: 0, sw: 0 }
const MIN_CROP_SIZE = 10
const CORNER_RADIUS_HANDLE_MIN_INSET = 18
const TRANSPARENT_CHECKERBOARD =
  'conic-gradient(#94a3b8 25%, #cbd5e1 0 50%, #94a3b8 0 75%, #cbd5e1 0)'

type CropResizeSession = {
  pointerId: number
  handle: CropResizeHandle
  startX: number
  startY: number
  startSize: number
  maxSize: number
}

type CropFrameMoveSession = {
  pointerId: number
  startX: number
  startY: number
  startPosition: Point
}

type CropCornerRadiusSession = {
  pointerId: number
  corner: CropCorner
  startX: number
  startY: number
  startRadius: number
  maxRadius: number
  linked: boolean
}

const CROP_MOVE_EDGES = [
  '-top-1 left-3 right-3 h-2',
  '-right-1 bottom-3 top-3 w-2',
  '-bottom-1 left-3 right-3 h-2',
  '-left-1 bottom-3 top-3 w-2',
]

const CROP_RESIZE_POINTS: Array<{ handle: CropResizeHandle; className: string }> = [
  { handle: 'nw', className: '-left-1.5 -top-1.5 cursor-nwse-resize' },
  { handle: 'n', className: '-top-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize' },
  { handle: 'ne', className: '-right-1.5 -top-1.5 cursor-nesw-resize' },
  { handle: 'w', className: '-left-1.5 top-1/2 -translate-y-1/2 cursor-ew-resize' },
  { handle: 'e', className: '-right-1.5 top-1/2 -translate-y-1/2 cursor-ew-resize' },
  { handle: 'sw', className: '-bottom-1.5 -left-1.5 cursor-nesw-resize' },
  { handle: 's', className: '-bottom-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize' },
  { handle: 'se', className: '-bottom-1.5 -right-1.5 cursor-nwse-resize' },
]

const CROP_CORNER_RADIUS_POINTS: Array<{ corner: CropCorner; className: string }> = [
  { corner: 'nw', className: 'cursor-nwse-resize' },
  { corner: 'ne', className: 'cursor-nesw-resize' },
  { corner: 'se', className: 'cursor-nwse-resize' },
  { corner: 'sw', className: 'cursor-nesw-resize' },
]

function CornerRadiusIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M8 3H6a3 3 0 0 0-3 3v2" />
      <path d="M16 3h2a3 3 0 0 1 3 3v2" />
      <path d="M21 16v2a3 3 0 0 1-3 3h-2" />
      <path d="M8 21H6a3 3 0 0 1-3-3v-2" />
    </svg>
  )
}

export function IconCropDialog({
  open,
  source,
  initialColor,
  onCancel,
  onApply,
}: IconCropDialogProps) {
  if (!open || !source) return null

  return (
    <IconCropDialogContent
      key={source}
      open={open}
      source={source}
      initialColor={initialColor}
      onCancel={onCancel}
      onApply={onApply}
    />
  )
}

function IconCropDialogContent({ source, initialColor, onCancel, onApply }: IconCropDialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef<HTMLDivElement | null>(null)
  const cropViewportRef = useRef<HTMLDivElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const initialCropSizeRef = useRef<Size | null>(null)
  const resizeSessionRef = useRef<CropResizeSession | null>(null)
  const frameMoveSessionRef = useRef<CropFrameMoveSession | null>(null)
  const cornerRadiusSessionRef = useRef<CropCornerRadiusSession | null>(null)
  const suppressCropChangeRef = useRef(false)
  const cropChangeUnlockFrameRef = useRef<number | null>(null)
  const preserveViewportOnMediaLoadRef = useRef(false)
  const [crop, setCrop] = useState<Point>(INITIAL_CROP)
  const [cropFramePosition, setCropFramePosition] = useState<Point>(INITIAL_CROP)
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [cropSize, setCropSize] = useState<Size | undefined>()
  const [cornerRadii, setCornerRadii] = useState<CropCornerRadii>(INITIAL_CORNER_RADII)
  const [cornerRadiiLinked, setCornerRadiiLinked] = useState(true)
  const [mediaSize, setMediaSize] = useState<MediaSize | null>(null)
  const [mediaObjectFit, setMediaObjectFit] = useState<UpscaledContainObjectFit | null>(null)
  const [viewportSize, setViewportSize] = useState(0)
  const [colorId, setColorId] = useState<IconColorId>(initialColor)
  const [customColor, setCustomColor] = useState<string | null>(null)
  const [usingCustomColor, setUsingCustomColor] = useState(false)
  const [extractingColor, setExtractingColor] = useState(false)
  const [samplingColor, setSamplingColor] = useState(false)
  const [editorSource, setEditorSource] = useState(source)
  const [optimizedSource, setOptimizedSource] = useState('')
  const [optimizing, setOptimizing] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')

  const constrainCropPosition = (
    nextCrop: Point,
    nextZoom = zoom,
    nextRotation = rotation
  ): Point => {
    if (!mediaSize || viewportSize <= 0) return nextCrop
    return constrainMediaPositionToViewport(
      nextCrop,
      mediaSize.width,
      mediaSize.height,
      nextRotation,
      nextZoom,
      viewportSize,
      viewportSize
    )
  }

  const constrainFramePosition = (nextPosition: Point): Point => {
    if (!cropSize || viewportSize <= 0) return nextPosition
    return constrainCropFramePosition(nextPosition, cropSize, viewportSize, viewportSize)
  }

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus())

    return () => {
      window.cancelAnimationFrame(focusFrame)
      window.requestAnimationFrame(() => previousFocusRef.current?.focus())
    }
  }, [])

  useEffect(() => {
    let active = true
    const image = new Image()
    image.onload = () => {
      if (active) {
        setMediaObjectFit(getUpscaledContainObjectFit(image.naturalWidth, image.naturalHeight))
      }
    }
    image.onerror = () => {
      if (active) setMediaObjectFit('horizontal-cover')
    }
    image.src = editorSource

    return () => {
      active = false
    }
  }, [editorSource])

  const resetCrop = () => {
    const nextCropSize = initialCropSizeRef.current ?? undefined
    setCrop(INITIAL_CROP)
    setCropFramePosition(INITIAL_CROP)
    setCornerRadii(INITIAL_CORNER_RADII)
    setCornerRadiiLinked(true)
    setZoom(1)
    setRotation(0)
    setCropSize(nextCropSize)
    setError('')
  }

  const rotateBy = (amount: number) => {
    const nextRotation = rotation + amount
    setRotation(nextRotation)
    setCrop(current => constrainCropPosition(current, zoom, nextRotation))
    setError('')
  }

  const handleCropChange = (nextCrop: Point) => {
    if (suppressCropChangeRef.current) return
    setCrop(constrainCropPosition(nextCrop))
  }

  const handleZoomChange = (nextZoom: number) => {
    const constrainedZoom = Math.min(ICON_CROP_MAX_ZOOM, Math.max(ICON_CROP_MIN_ZOOM, nextZoom))
    setZoom(constrainedZoom)
    setCrop(current => constrainCropPosition(current, constrainedZoom))
  }

  const changeZoom = (amount: number) => {
    handleZoomChange(Number((zoom + amount).toFixed(2)))
  }

  const handleCropWheelRequest = (event: WheelEvent) => {
    if (event.deltaY === 0) return false
    event.preventDefault()
    event.stopPropagation()
    handleZoomChange(getNextIconCropWheelZoom(zoom, event.deltaY < 0 ? 1 : -1))
    return false
  }

  const updateCropSize = (
    handle: CropResizeHandle,
    startSize: number,
    deltaX: number,
    deltaY: number,
    maxSize: number
  ) => {
    suppressCropChangeRef.current = true
    if (cropChangeUnlockFrameRef.current !== null) {
      window.cancelAnimationFrame(cropChangeUnlockFrameRef.current)
    }
    cropChangeUnlockFrameRef.current = window.requestAnimationFrame(() => {
      cropChangeUnlockFrameRef.current = null
      if (!resizeSessionRef.current) suppressCropChangeRef.current = false
    })
    const nextCropSize = resizeSquareCrop(startSize, deltaX, deltaY, handle, MIN_CROP_SIZE, maxSize)
    setCropSize(nextCropSize)
    setCornerRadii(current => clampCropCornerRadii(current, nextCropSize.width / 2))
    setCropFramePosition(current =>
      constrainCropFramePosition(current, nextCropSize, viewportSize, viewportSize)
    )
    setError('')
  }

  const startCropResize = (handle: CropResizeHandle, event: ReactPointerEvent<HTMLElement>) => {
    if (!cropSize || applying) return
    event.preventDefault()
    event.stopPropagation()
    const maxSize = viewportSize > 0 ? viewportSize : cropSize.width
    resizeSessionRef.current = {
      pointerId: event.pointerId,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      startSize: cropSize.width,
      maxSize,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const continueCropResize = (event: ReactPointerEvent<HTMLElement>) => {
    const session = resizeSessionRef.current
    if (!session || session.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    updateCropSize(
      session.handle,
      session.startSize,
      event.clientX - session.startX,
      event.clientY - session.startY,
      session.maxSize
    )
  }

  const finishCropResize = (event: ReactPointerEvent<HTMLElement>) => {
    if (resizeSessionRef.current?.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    resizeSessionRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (cropChangeUnlockFrameRef.current !== null) {
      window.cancelAnimationFrame(cropChangeUnlockFrameRef.current)
    }
    cropChangeUnlockFrameRef.current = window.requestAnimationFrame(() => {
      cropChangeUnlockFrameRef.current = null
      suppressCropChangeRef.current = false
    })
  }

  const startCropFrameMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!cropSize || !mediaSize || applying) return
    event.preventDefault()
    event.stopPropagation()
    frameMoveSessionRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPosition: cropFramePosition,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const continueCropFrameMove = (event: ReactPointerEvent<HTMLElement>) => {
    const session = frameMoveSessionRef.current
    if (!session || session.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    setCropFramePosition(
      constrainFramePosition({
        x: session.startPosition.x + event.clientX - session.startX,
        y: session.startPosition.y + event.clientY - session.startY,
      })
    )
    setError('')
  }

  const finishCropFrameMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (frameMoveSessionRef.current?.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    frameMoveSessionRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const updateCornerRadius = (
    corner: CropCorner,
    startRadius: number,
    deltaX: number,
    deltaY: number,
    maxRadius: number,
    linked: boolean
  ) => {
    const nextRadius = resizeCropCornerRadius(startRadius, deltaX, deltaY, corner, maxRadius)
    setCornerRadii(current =>
      linked
        ? { nw: nextRadius, ne: nextRadius, se: nextRadius, sw: nextRadius }
        : { ...current, [corner]: nextRadius }
    )
    setError('')
  }

  const startCornerRadiusResize = (
    corner: CropCorner,
    event: ReactPointerEvent<HTMLButtonElement>
  ) => {
    if (!cropSize || applying) return
    event.preventDefault()
    event.stopPropagation()
    cornerRadiusSessionRef.current = {
      pointerId: event.pointerId,
      corner,
      startX: event.clientX,
      startY: event.clientY,
      startRadius: cornerRadii[corner],
      maxRadius: cropSize.width / 2,
      linked: cornerRadiiLinked,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const continueCornerRadiusResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const session = cornerRadiusSessionRef.current
    if (!session || session.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    updateCornerRadius(
      session.corner,
      session.startRadius,
      event.clientX - session.startX,
      event.clientY - session.startY,
      session.maxRadius,
      session.linked
    )
  }

  const finishCornerRadiusResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (cornerRadiusSessionRef.current?.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    cornerRadiusSessionRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const handleCornerRadiusKeyDown = (
    corner: CropCorner,
    event: KeyboardEvent<HTMLButtonElement>
  ) => {
    if (!cropSize || applying) return
    const step = event.shiftKey ? 10 : 2
    const amount =
      event.key === 'ArrowUp' || event.key === 'ArrowRight'
        ? step
        : event.key === 'ArrowDown' || event.key === 'ArrowLeft'
          ? -step
          : 0
    if (amount === 0) return

    event.preventDefault()
    event.stopPropagation()
    setCornerRadii(current => {
      const nextRadius = Math.min(cropSize.width / 2, Math.max(0, current[corner] + amount))
      return cornerRadiiLinked
        ? { nw: nextRadius, ne: nextRadius, se: nextRadius, sw: nextRadius }
        : { ...current, [corner]: nextRadius }
    })
    setError('')
  }

  const handleResizeKeyDown = (
    handle: CropResizeHandle,
    event: KeyboardEvent<HTMLButtonElement>
  ) => {
    if (!cropSize || applying) return
    const step = event.shiftKey ? 10 : 2
    const keyboardDelta = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    }[event.key]
    if (!keyboardDelta) return

    event.preventDefault()
    event.stopPropagation()
    updateCropSize(
      handle,
      cropSize.width,
      keyboardDelta.x,
      keyboardDelta.y,
      viewportSize > 0 ? viewportSize : cropSize.width
    )
  }

  const handleApply = async () => {
    if (!cropSize || !mediaSize || applying || optimizing) return
    setApplying(true)
    setError('')
    try {
      const dataUri = await cropImageViewportDataUri(editorSource, {
        crop: {
          x: crop.x - cropFramePosition.x,
          y: crop.y - cropFramePosition.y,
        },
        cropSize,
        mediaSize,
        zoom,
        rotation,
        cornerRadii,
      })
      if (!dataUri) throw new Error('The cropped icon is empty')
      const outputRadiusScale = ICON_CROP_OUTPUT_SIZE / Math.max(1, cropSize.width)
      const outputCornerRadii: CropCornerRadii = {
        nw: cornerRadii.nw * outputRadiusScale,
        ne: cornerRadii.ne * outputRadiusScale,
        se: cornerRadii.se * outputRadiusScale,
        sw: cornerRadii.sw * outputRadiusScale,
      }
      const outputDataUri =
        usingCustomColor && customColor
          ? await createIconWithBackgroundColorDataUri(
              dataUri,
              customColor,
              ICON_CROP_OUTPUT_SIZE,
              outputCornerRadii
            )
          : dataUri
      onApply({
        dataUri: outputDataUri,
        colorId: usingCustomColor ? 'none' : colorId,
        cornerRadii: outputCornerRadii,
      })
    } catch {
      setError(translate('无法生成裁剪后的图标，请重试。'))
      setApplying(false)
    }
  }

  const switchEditorSource = (nextSource: string) => {
    preserveViewportOnMediaLoadRef.current = Boolean(mediaSize)
    setEditorSource(nextSource)
    setError('')
  }

  const handleOptimizeImage = async () => {
    if (applying || optimizing || !mediaSize) return
    if (optimizedSource && editorSource === optimizedSource) {
      switchEditorSource(source)
      return
    }
    if (optimizedSource) {
      switchEditorSource(optimizedSource)
      return
    }

    setOptimizing(true)
    setError('')
    try {
      const nextSource = await invoke<string>('optimize_icon_image', { dataUri: source })
      if (!nextSource) throw new Error('The optimized icon is empty')
      setOptimizedSource(nextSource)
      switchEditorSource(nextSource)
    } catch {
      setError(translate('无法优化图片，请重试。'))
    } finally {
      setOptimizing(false)
    }
  }

  const handleColorSample = async (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!extractingColor || !cropSize || !mediaSize || samplingColor || applying) return
    event.preventDefault()
    event.stopPropagation()
    const bounds = event.currentTarget.getBoundingClientRect()
    setSamplingColor(true)
    setError('')

    try {
      const sampledColor = await extractImageColorAtViewportPoint(
        editorSource,
        { crop, cropSize, mediaSize, zoom, rotation },
        {
          x: event.clientX - bounds.left - bounds.width / 2,
          y: event.clientY - bounds.top - bounds.height / 2,
        }
      )
      if (!sampledColor) {
        setError(translate('此处没有可提取的颜色，请选择图片中的其他位置。'))
        return
      }

      setCustomColor(sampledColor)
      setUsingCustomColor(true)
      setColorId('none')
      setExtractingColor(false)
    } catch {
      setError(translate('无法提取颜色，请重试。'))
    } finally {
      setSamplingColor(false)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation()
    if (event.key === 'Escape') {
      event.preventDefault()
      if (extractingColor) {
        setExtractingColor(false)
        return
      }
      if (!applying) onCancel()
      return
    }
    if (event.key !== 'Tab' || !panelRef.current) return

    const focusable = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    )
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const selectedColor = ICON_COLOR_PRESETS.find(preset => preset.id === colorId)
  const visibleBackgroundColor = usingCustomColor ? customColor : selectedColor?.color
  const imageOptimized = Boolean(optimizedSource && editorSource === optimizedSource)

  return createPortal(
    <div
      className="fixed inset-0 z-[360] flex items-center justify-center bg-black/35 p-3 backdrop-blur-[3px] dark:bg-black/65 sm:p-5"
      onMouseDown={event => {
        event.stopPropagation()
        if (event.target === event.currentTarget && !applying) onCancel()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative flex max-h-[calc(100vh-1.5rem)] w-full max-w-[25rem] flex-col overflow-hidden rounded-lg border border-border bg-background shadow-2xl sm:max-h-[calc(100vh-2.5rem)]"
        onKeyDown={handleKeyDown}
      >
        <Button
          ref={closeButtonRef}
          type="button"
          variant="ghost"
          size="icon"
          aria-label={translate('关闭')}
          title={translate('关闭')}
          onClick={onCancel}
          disabled={applying}
          className="absolute right-0 top-0 z-20 h-10 w-10 rounded-none text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </Button>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-5 sm:px-[58px] sm:pb-10">
          <h2 id={titleId} className="mb-2.5 text-center text-xl font-semibold text-foreground">
            {translate('裁剪图标')}
          </h2>
          <p id={descriptionId} className="sr-only">
            {translate('拖动图标调整位置，拖动裁剪框边缘移动或调整大小。')}
          </p>

          <div
            className="relative mx-auto aspect-square w-full bg-muted/60"
            style={
              !usingCustomColor && colorId === 'none'
                ? {
                    backgroundColor: '#cbd5e1',
                    backgroundImage: TRANSPARENT_CHECKERBOARD,
                    backgroundSize: '16px 16px',
                  }
                : { backgroundColor: visibleBackgroundColor ?? undefined }
            }
          >
            <div
              ref={cropViewportRef}
              className="relative isolate h-full w-full overflow-hidden [contain:paint]"
            >
              {mediaObjectFit ? (
                <Cropper
                  image={editorSource}
                  crop={crop}
                  cropSize={cropSize}
                  zoom={zoom}
                  rotation={rotation}
                  aspect={1}
                  minZoom={ICON_CROP_MIN_ZOOM}
                  maxZoom={ICON_CROP_MAX_ZOOM}
                  objectFit={mediaObjectFit}
                  showGrid
                  zoomWithScroll
                  onWheelRequest={handleCropWheelRequest}
                  restrictPosition={false}
                  style={{
                    cropAreaStyle: {
                      left: `calc(50% + ${cropFramePosition.x}px)`,
                      top: `calc(50% + ${cropFramePosition.y}px)`,
                      borderRadius: `${cornerRadii.nw}px ${cornerRadii.ne}px ${cornerRadii.se}px ${cornerRadii.sw}px`,
                    },
                  }}
                  onCropChange={handleCropChange}
                  onZoomChange={handleZoomChange}
                  onMediaLoaded={nextMediaSize => {
                    const nextViewportSize = cropViewportRef.current?.clientWidth ?? 0
                    setMediaSize(nextMediaSize)
                    setViewportSize(nextViewportSize)
                    if (preserveViewportOnMediaLoadRef.current) {
                      preserveViewportOnMediaLoadRef.current = false
                      setCrop(current =>
                        constrainMediaPositionToViewport(
                          current,
                          nextMediaSize.width,
                          nextMediaSize.height,
                          rotation,
                          zoom,
                          nextViewportSize,
                          nextViewportSize
                        )
                      )
                      return
                    }
                    const nextCropSize =
                      nextViewportSize > 0
                        ? { width: nextViewportSize, height: nextViewportSize }
                        : getImageBoundedSquareCropSize(nextMediaSize.width, nextMediaSize.height)
                    setZoom(1)
                    setCrop(INITIAL_CROP)
                    setCropFramePosition(INITIAL_CROP)
                    setCornerRadii(INITIAL_CORNER_RADII)
                    setCornerRadiiLinked(true)
                    initialCropSizeRef.current = nextCropSize
                    setCropSize(nextCropSize ?? undefined)
                  }}
                  mediaProps={{ draggable: false, alt: '' }}
                  classes={{ cropAreaClassName: '!border-2 !border-foreground' }}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>

            {cropSize ? (
              <div
                className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
                style={{
                  width: cropSize.width,
                  height: cropSize.height,
                  left: `calc(50% + ${cropFramePosition.x}px)`,
                  top: `calc(50% + ${cropFramePosition.y}px)`,
                  borderRadius: `${cornerRadii.nw}px ${cornerRadii.ne}px ${cornerRadii.se}px ${cornerRadii.sw}px`,
                }}
              >
                {CROP_MOVE_EDGES.map(className => (
                  <span
                    key={className}
                    aria-hidden="true"
                    className={cn('pointer-events-auto absolute touch-none cursor-move', className)}
                    onPointerDown={startCropFrameMove}
                    onPointerMove={continueCropFrameMove}
                    onPointerUp={finishCropFrameMove}
                    onPointerCancel={finishCropFrameMove}
                  />
                ))}
                {CROP_RESIZE_POINTS.map(({ handle, className }) => (
                  <button
                    key={handle}
                    type="button"
                    aria-label={translate('调整裁剪框大小')}
                    title={translate('调整裁剪框大小')}
                    onKeyDown={event => handleResizeKeyDown(handle, event)}
                    onPointerDown={event => startCropResize(handle, event)}
                    onPointerMove={continueCropResize}
                    onPointerUp={finishCropResize}
                    onPointerCancel={finishCropResize}
                    disabled={applying}
                    className={cn(
                      'pointer-events-auto absolute z-10 h-3 w-3 touch-none rounded-full border-2 border-background bg-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none',
                      className
                    )}
                  />
                ))}
                {CROP_CORNER_RADIUS_POINTS.map(({ corner, className }) => {
                  const maxInset = Math.max(5, cropSize.width / 2 - 6)
                  const inset = Math.min(
                    maxInset,
                    Math.max(
                      CORNER_RADIUS_HANDLE_MIN_INSET,
                      cornerRadii[corner] + CORNER_RADIUS_HANDLE_MIN_INSET
                    )
                  )
                  const verticalSide = corner.startsWith('n') ? 'top' : 'bottom'
                  const horizontalSide = corner.endsWith('w') ? 'left' : 'right'
                  const translateX = corner.endsWith('w') ? -50 : 50
                  const translateY = corner.startsWith('n') ? -50 : 50

                  return (
                    <button
                      key={corner}
                      type="button"
                      aria-label={translate('调整裁剪框圆角')}
                      title={translate('调整裁剪框圆角')}
                      onKeyDown={event => handleCornerRadiusKeyDown(corner, event)}
                      onPointerDown={event => startCornerRadiusResize(corner, event)}
                      onPointerMove={continueCornerRadiusResize}
                      onPointerUp={finishCornerRadiusResize}
                      onPointerCancel={finishCornerRadiusResize}
                      disabled={applying}
                      className={cn(
                        'pointer-events-auto absolute z-20 h-2.5 w-2.5 touch-none rounded-full border-2 border-foreground bg-background shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none',
                        className
                      )}
                      style={{
                        [verticalSide]: inset,
                        [horizontalSide]: inset,
                        transform: `translate(${translateX}%, ${translateY}%)`,
                      }}
                    />
                  )
                })}
              </div>
            ) : null}

            {extractingColor && cropSize && mediaSize ? (
              <div
                aria-hidden="true"
                title={translate('点击图片提取颜色')}
                onPointerDown={event => void handleColorSample(event)}
                className="absolute inset-0 z-30 cursor-crosshair touch-none"
              >
                <span className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap rounded-md border border-border/70 bg-background/90 px-2.5 py-1 text-xs font-medium text-foreground shadow-sm backdrop-blur-sm">
                  {samplingColor ? (
                    <RefreshCw className="mr-1.5 inline h-3 w-3 animate-spin" />
                  ) : (
                    <Pipette className="mr-1.5 inline h-3 w-3" />
                  )}
                  {translate('点击图片提取颜色')}
                </span>
              </div>
            ) : null}

            <div
              role="group"
              aria-label={translate('图像工具')}
              className="absolute right-2 top-2 z-40 flex flex-col gap-2 sm:left-full sm:right-auto sm:top-0 sm:ml-3"
            >
              <Button
                type="button"
                variant={cornerRadiiLinked ? 'secondary' : 'outline'}
                size="icon"
                aria-label={
                  cornerRadiiLinked ? translate('四角圆角同步调整') : translate('四角圆角独立调整')
                }
                aria-pressed={cornerRadiiLinked}
                title={
                  cornerRadiiLinked ? translate('四角圆角同步调整') : translate('四角圆角独立调整')
                }
                onClick={() => setCornerRadiiLinked(current => !current)}
                disabled={applying}
                className="h-9 w-9"
              >
                <CornerRadiusIcon className="h-4 w-4" />
              </Button>

              <Button
                type="button"
                variant={imageOptimized ? 'secondary' : 'outline'}
                size="icon"
                aria-label={imageOptimized ? translate('取消清晰优化') : translate('清晰优化')}
                aria-pressed={imageOptimized}
                title={imageOptimized ? translate('取消清晰优化') : translate('清晰优化')}
                onClick={() => void handleOptimizeImage()}
                disabled={applying || optimizing || !mediaSize}
                className="h-9 w-9"
              >
                {optimizing ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="mt-[18px] flex items-center justify-between text-muted-foreground">
            <div className="flex items-center gap-4">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={translate('向右旋转')}
                title={translate('向右旋转')}
                onClick={() => rotateBy(90)}
                disabled={applying}
                className="h-8 w-8 hover:text-foreground"
              >
                <RotateCw className="h-5 w-5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={translate('向左旋转')}
                title={translate('向左旋转')}
                onClick={() => rotateBy(-90)}
                disabled={applying}
                className="h-8 w-8 hover:text-foreground"
              >
                <RotateCcw className="h-5 w-5" />
              </Button>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={translate('复位')}
              title={translate('复位')}
              onClick={resetCrop}
              disabled={applying}
              className="h-8 w-8 hover:text-foreground"
            >
              <RefreshCw className="h-5 w-5" />
            </Button>

            <div className="flex items-center gap-4">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={translate('缩小')}
                title={translate('缩小')}
                onClick={() => changeZoom(-0.1)}
                disabled={applying || zoom <= ICON_CROP_MIN_ZOOM}
                className="h-8 w-8 hover:text-foreground"
              >
                <ZoomOut className="h-5 w-5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={translate('放大')}
                title={translate('放大')}
                onClick={() => changeZoom(0.1)}
                disabled={applying || zoom >= ICON_CROP_MAX_ZOOM}
                className="h-8 w-8 hover:text-foreground"
              >
                <ZoomIn className="h-5 w-5" />
              </Button>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-foreground">{translate('图标背景')}</span>
            <Button
              type="button"
              variant={extractingColor ? 'secondary' : 'ghost'}
              size="sm"
              aria-pressed={extractingColor}
              onClick={() => {
                setExtractingColor(current => !current)
                setError('')
              }}
              disabled={applying || !cropSize || !mediaSize}
              className="h-8 gap-1.5 px-2.5 text-xs"
            >
              {samplingColor ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Pipette className="h-3.5 w-3.5" />
              )}
              {translate('提取颜色')}
            </Button>
          </div>

          <div
            role="radiogroup"
            aria-label={translate('图标背景')}
            className="mt-3 grid grid-cols-6 justify-items-center gap-x-2 gap-y-2"
          >
            {ICON_COLOR_PRESETS.map(preset => {
              const selected = !usingCustomColor && preset.id === colorId
              return (
                <button
                  key={preset.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={translate(preset.id === 'none' ? '透明背景' : '选择图标背景')}
                  title={translate(preset.id === 'none' ? '透明背景' : '选择图标背景')}
                  onClick={() => {
                    setColorId(preset.id)
                    setUsingCustomColor(false)
                    setExtractingColor(false)
                    setError('')
                  }}
                  disabled={applying}
                  className={cn(
                    'relative flex h-7 w-7 items-center justify-center rounded-full border transition-[border-color,box-shadow,transform] duration-150 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 motion-reduce:transform-none',
                    selected
                      ? 'border-foreground ring-2 ring-foreground/15'
                      : 'border-border hover:border-foreground/40'
                  )}
                  style={
                    preset.id === 'none'
                      ? {
                          backgroundColor: '#cbd5e1',
                          backgroundImage: TRANSPARENT_CHECKERBOARD,
                          backgroundSize: '8px 8px',
                        }
                      : { backgroundColor: preset.color }
                  }
                >
                  {preset.id === 'none' ? (
                    <X className="h-3.5 w-3.5 text-slate-600 drop-shadow-[0_1px_1px_rgba(255,255,255,0.9)]" />
                  ) : selected ? (
                    <Check className="h-3.5 w-3.5 text-white" />
                  ) : null}
                </button>
              )
            })}
            {customColor ? (
              <button
                type="button"
                role="radio"
                aria-checked={usingCustomColor}
                aria-label={translate('选择提取的颜色')}
                title={`${translate('选择提取的颜色')} ${customColor}`}
                onClick={() => {
                  setUsingCustomColor(true)
                  setColorId('none')
                  setExtractingColor(false)
                  setError('')
                }}
                disabled={applying}
                className={cn(
                  'relative flex h-7 w-7 items-center justify-center rounded-full border transition-[border-color,box-shadow,transform] duration-150 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 motion-reduce:transform-none',
                  usingCustomColor
                    ? 'border-foreground ring-2 ring-foreground/15'
                    : 'border-border hover:border-foreground/40'
                )}
                style={{ backgroundColor: customColor }}
              >
                {usingCustomColor ? (
                  <Check className="h-3.5 w-3.5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]" />
                ) : null}
              </button>
            ) : null}
          </div>

          {error ? (
            <p role="alert" className="mt-3 text-xs leading-5 text-destructive">
              {error}
            </p>
          ) : null}

          <Button
            type="button"
            onClick={() => void handleApply()}
            disabled={applying || optimizing || !cropSize || !mediaSize}
            className="mt-6 w-full"
          >
            {applying ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Crop className="h-4 w-4" />
            )}
            {applying ? translate('正在生成...') : translate('完成')}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
