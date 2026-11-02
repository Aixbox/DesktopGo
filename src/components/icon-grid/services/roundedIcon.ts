import { getIconVisibleBounds } from '../domain/iconVisibleBounds'

const CACHE_LIMIT = 128
const MAX_SIDE = 512
type Entry = { image: string | null; pending: Promise<string | null> }
const cache = new Map<string, Entry>()

export function readCachedRoundedIcon(source: string | undefined): string | null {
  return source ? (cache.get(source)?.image ?? null) : null
}

function renderRoundedIcon(image: HTMLImageElement): string | null {
  if (!image.naturalWidth || !image.naturalHeight) return null
  const scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
  const bounds = getIconVisibleBounds(data, canvas.width, canvas.height)
  if (!bounds) return null
  // Preserve padding and aspect ratio. Only remove pixels outside the rounded visible bounds.
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.beginPath()
  context.roundRect(
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    Math.min(bounds.width, bounds.height) / 4
  )
  context.clip()
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}

function decodeRoundedIcon(source: string): Promise<string | null> {
  return new Promise(resolve => {
    const image = new Image()
    const finish = (result: string | null) => {
      clearTimeout(timeout)
      image.onload = null
      image.onerror = null
      resolve(result)
    }
    const timeout = setTimeout(() => finish(null), 10000)
    image.onerror = () => finish(null)
    image.onload = () => {
      try {
        finish(renderRoundedIcon(image))
      } catch {
        finish(null)
      }
    }
    image.src = source
  })
}

/** Share processed pixels across workspace, drag and landing; never change the persisted source. */
export function loadRoundedIcon(source: string): Promise<string | null> {
  if (!source.startsWith('data:image/')) return Promise.resolve(null)
  const existing = cache.get(source)
  if (existing) return existing.pending
  const pending = decodeRoundedIcon(source).catch(() => null)
  const entry: Entry = { image: null, pending }
  cache.set(source, entry)
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!)
  void pending.then(result => {
    entry.image = result
    if (!result && cache.get(source) === entry) cache.delete(source)
  })
  return pending
}
