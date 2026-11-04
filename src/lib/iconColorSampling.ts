import { extractIconDominantColor } from './iconDominantColor'

const SAMPLE_SIZE = 32
const CACHE_LIMIT = 128
type ColorEntry = { color: string | null; pending: Promise<string | null> }
const colorCache = new Map<string, ColorEntry>()

export function readCachedIconColor(source: string | undefined): string | null {
  return source ? (colorCache.get(source)?.color ?? null) : null
}

function sampleIconColor(source: string): Promise<string | null> {
  return new Promise(resolve => {
    const image = new Image()
    const finish = (color: string | null) => {
      clearTimeout(timeout)
      image.onload = null
      image.onerror = null
      resolve(color)
    }
    const timeout = setTimeout(() => finish(null), 10000)
    image.onerror = () => finish(null)
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        const ratio = SAMPLE_SIZE / Math.max(image.naturalWidth, image.naturalHeight, 1)
        canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio))
        canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio))
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) return finish(null)
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        finish(
          extractIconDominantColor(context.getImageData(0, 0, canvas.width, canvas.height).data)
        )
      } catch {
        finish(null)
      }
    }
    image.src = source
  })
}

/** 图标编辑、大图标及拖拽预览共用采样结果，避免重复解码。 */
export function loadIconColor(source: string): Promise<string | null> {
  if (!source.startsWith('data:image/')) return Promise.resolve(null)
  const cached = colorCache.get(source)
  if (cached) return cached.pending
  const pending = sampleIconColor(source).catch(() => null)
  const entry: ColorEntry = { color: null, pending }
  colorCache.set(source, entry)
  if (colorCache.size > CACHE_LIMIT) colorCache.delete(colorCache.keys().next().value!)
  void pending.then(color => {
    entry.color = color
    if (!color && colorCache.get(source) === entry) colorCache.delete(source)
  })
  return pending
}
