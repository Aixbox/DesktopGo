import type { MediaSize, Point, Size } from 'react-easy-crop'

export const ICON_CROP_OUTPUT_SIZE = 512
export const ICON_CROP_MIN_ZOOM = 0.1
export const ICON_CROP_MAX_ZOOM = 3
export const ICON_CROP_WHEEL_ENLARGE_FACTOR = 1.2
export const ICON_CROP_WHEEL_SHRINK_FACTOR = 0.85

export type CropFrameSize = {
  width: number
  height: number
}

export type CropResizeHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'
export type UpscaledContainObjectFit = 'horizontal-cover' | 'vertical-cover'

export type CropViewport = {
  crop: Point
  cropSize: Size
  mediaSize: MediaSize
  zoom: number
  rotation: number
}

export const getImageBoundedSquareCropSize = (
  displayedWidth: number,
  displayedHeight: number
): CropFrameSize | null => {
  const size = Math.min(displayedWidth, displayedHeight)
  if (!Number.isFinite(size) || size <= 0) return null

  return { width: size, height: size }
}

export const getUpscaledContainObjectFit = (
  naturalWidth: number,
  naturalHeight: number
): UpscaledContainObjectFit =>
  naturalWidth >= naturalHeight ? 'horizontal-cover' : 'vertical-cover'

export const resizeSquareCrop = (
  startSize: number,
  deltaX: number,
  deltaY: number,
  handle: CropResizeHandle,
  minSize: number,
  maxSize: number
): CropFrameSize => {
  const horizontalDelta = handle.includes('w') ? -deltaX : deltaX
  const verticalDelta = handle === 'n' ? -deltaY : deltaY
  const delta = handle === 'n' || handle === 's' ? verticalDelta : horizontalDelta
  const size = Math.min(maxSize, Math.max(minSize, startSize + delta * 2))

  return { width: size, height: size }
}

export const normalizeRotation = (rotation: number): number => {
  const normalized = rotation % 360
  return normalized < 0 ? normalized + 360 : normalized
}

export const getRotatedImageSize = (
  width: number,
  height: number,
  rotation: number
): { width: number; height: number } => {
  const radians = (normalizeRotation(rotation) * Math.PI) / 180
  return {
    width: Math.abs(Math.cos(radians) * width) + Math.abs(Math.sin(radians) * height),
    height: Math.abs(Math.sin(radians) * width) + Math.abs(Math.cos(radians) * height),
  }
}

export const constrainMediaPositionToViewport = (
  position: Point,
  mediaWidth: number,
  mediaHeight: number,
  rotation: number,
  zoom: number,
  viewportWidth: number,
  viewportHeight: number
): Point => {
  const rotatedSize = getRotatedImageSize(mediaWidth, mediaHeight, rotation)
  const normalizeBoundary = (value: number) =>
    Math.abs(value - Math.round(value)) < 0.000001 ? Math.round(value) : value
  const availableX = normalizeBoundary(Math.abs(viewportWidth - rotatedSize.width * zoom) / 2)
  const availableY = normalizeBoundary(Math.abs(viewportHeight - rotatedSize.height * zoom) / 2)

  return {
    x: availableX === 0 ? 0 : Math.min(availableX, Math.max(-availableX, position.x)),
    y: availableY === 0 ? 0 : Math.min(availableY, Math.max(-availableY, position.y)),
  }
}

export const getNextIconCropWheelZoom = (currentZoom: number, direction: -1 | 1): number => {
  let nextZoom: number

  if (currentZoom > 1) {
    nextZoom =
      direction > 0
        ? currentZoom * ICON_CROP_WHEEL_ENLARGE_FACTOR
        : currentZoom / ICON_CROP_WHEEL_ENLARGE_FACTOR
    if (direction < 0 && nextZoom < 1) nextZoom = 1
  } else if (currentZoom < 1) {
    nextZoom =
      direction < 0
        ? currentZoom * ICON_CROP_WHEEL_SHRINK_FACTOR
        : currentZoom / ICON_CROP_WHEEL_SHRINK_FACTOR
    if (direction > 0 && nextZoom > 1) nextZoom = 1
  } else {
    nextZoom = direction > 0 ? ICON_CROP_WHEEL_ENLARGE_FACTOR : ICON_CROP_WHEEL_SHRINK_FACTOR
  }

  return Number(Math.min(ICON_CROP_MAX_ZOOM, Math.max(ICON_CROP_MIN_ZOOM, nextZoom)).toFixed(4))
}

export const constrainCropFramePosition = (
  position: Point,
  cropSize: Size,
  viewportWidth: number,
  viewportHeight: number
): Point => {
  const availableViewportX = Math.max(0, (viewportWidth - cropSize.width) / 2)
  const availableViewportY = Math.max(0, (viewportHeight - cropSize.height) / 2)

  return {
    x: Math.min(availableViewportX, Math.max(-availableViewportX, position.x)),
    y: Math.min(availableViewportY, Math.max(-availableViewportY, position.y)),
  }
}

const loadImage = (source: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Failed to load the icon for cropping'))
    image.src = source
  })

export const cropImageViewportDataUri = async (
  source: string,
  viewport: CropViewport,
  outputSize = ICON_CROP_OUTPUT_SIZE
): Promise<string> => {
  if (!source || typeof document === 'undefined') return ''

  const image = await loadImage(source)
  const { crop, cropSize, mediaSize, zoom, rotation } = viewport
  const outputCanvas = document.createElement('canvas')
  outputCanvas.width = outputSize
  outputCanvas.height = outputSize
  const outputContext = outputCanvas.getContext('2d')
  if (!outputContext) throw new Error('Unable to create the icon output canvas')

  const viewportScale = outputSize / Math.max(1, cropSize.width)
  const displayedScaleX = mediaSize.width / Math.max(1, image.naturalWidth)
  const displayedScaleY = mediaSize.height / Math.max(1, image.naturalHeight)

  outputContext.clearRect(0, 0, outputSize, outputSize)
  outputContext.imageSmoothingEnabled = true
  outputContext.imageSmoothingQuality = 'high'
  outputContext.translate(outputSize / 2, outputSize / 2)
  outputContext.scale(viewportScale, viewportScale)
  outputContext.translate(crop.x, crop.y)
  outputContext.rotate((normalizeRotation(rotation) * Math.PI) / 180)
  outputContext.scale(zoom * displayedScaleX, zoom * displayedScaleY)
  outputContext.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2)

  return outputCanvas.toDataURL('image/png')
}
