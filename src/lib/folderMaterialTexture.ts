import { getColorOsMaterialLayers, type FolderBackdropTone } from './folderMaterialPolicy'

export interface FolderTextureOptions {
  width: number
  height: number
  dark: boolean
  tone: FolderBackdropTone
  overlay: number
  backgroundBlur: number
  scrim: string
}

// Desktop CSS adaptation of the native 800 blur setting, not an Android-pixel conversion.
const MATERIAL_BLUR_PX = 32
const MAX_TEXTURE_EXTENT = 1024

function canvasWithContext(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Folder material canvas unavailable')
  return { canvas, context }
}

/** Edge clamping avoids translucent/dark seams at the wallpaper's four edges. */
function padTexture(source: HTMLCanvasElement, padding: number) {
  const { width, height } = source
  const { canvas, context } = canvasWithContext(width + padding * 2, height + padding * 2)
  const xBands = [
    [0, 1, 0, padding],
    [0, width, padding, width],
    [width - 1, 1, width + padding, padding],
  ]
  const yBands = [
    [0, 1, 0, padding],
    [0, height, padding, height],
    [height - 1, 1, height + padding, padding],
  ]
  for (const [sx, sw, dx, dw] of xBands) {
    for (const [sy, sh, dy, dh] of yBands) {
      context.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh)
    }
  }
  return canvas
}

/** Generate once per wallpaper/viewport/theme; folders only crop this shared bitmap. */
export function renderFolderMaterialTexture(
  image: HTMLImageElement,
  options: FolderTextureOptions
): string {
  const scale = Math.min(1, MAX_TEXTURE_EXTENT / Math.max(options.width, options.height))
  const width = Math.max(1, Math.round(options.width * scale))
  const height = Math.max(1, Math.round(options.height * scale))
  const { canvas: source, context: sourceContext } = canvasWithContext(width, height)
  sourceContext.fillStyle = options.dark ? '#18181b' : '#f4f4f5'
  sourceContext.fillRect(0, 0, width, height)
  const cover = Math.max(width / image.naturalWidth, height / image.naturalHeight)
  const imageWidth = image.naturalWidth * cover
  const imageHeight = image.naturalHeight * cover
  sourceContext.drawImage(
    image,
    (width - imageWidth) / 2,
    (height - imageHeight) / 2,
    imageWidth,
    imageHeight
  )
  sourceContext.fillStyle = `rgb(${options.scrim} / ${options.overlay})`
  sourceContext.fillRect(0, 0, width, height)

  const blur = Math.hypot(MATERIAL_BLUR_PX, options.backgroundBlur) * scale
  const padding = Math.ceil(blur * 3)
  const padded = padTexture(source, padding)
  const { canvas, context } = canvasWithContext(width, height)
  if (typeof context.filter !== 'string') throw new Error('Folder material blur unavailable')
  context.filter = `blur(${blur}px)`
  context.drawImage(padded, -padding, -padding)
  context.filter = 'none'

  const layers = getColorOsMaterialLayers(options.dark, options.tone)
  context.globalCompositeOperation = layers.mode
  context.fillStyle = layers.mix
  context.fillRect(0, 0, width, height)
  context.globalCompositeOperation = 'source-over'
  context.fillStyle = layers.blend
  context.fillRect(0, 0, width, height)
  const result = canvas.toDataURL('image/png')
  if (!result.startsWith('data:image/png;')) throw new Error('Folder material encoding failed')
  return result
}
