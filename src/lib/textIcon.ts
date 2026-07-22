export const ICON_COLOR_PRESETS = [
  { id: 'none', color: 'transparent', foreground: '#334155' },
  { id: 'ocean', color: '#2563EB', foreground: '#F8FAFC' },
  { id: 'cyan', color: '#0E7490', foreground: '#ECFEFF' },
  { id: 'emerald', color: '#059669', foreground: '#F8FAFC' },
  { id: 'lime', color: '#4D7C0F', foreground: '#F7FEE7' },
  { id: 'amber', color: '#D97706', foreground: '#FFFBEB' },
  { id: 'coral', color: '#DC4C64', foreground: '#FFF1F2' },
  { id: 'pink', color: '#BE185D', foreground: '#FDF2F8' },
  { id: 'plum', color: '#7C3AED', foreground: '#FAF5FF' },
  { id: 'graphite', color: '#475569', foreground: '#F8FAFC' },
] as const

export type IconColorId = (typeof ICON_COLOR_PRESETS)[number]['id']

const COLORED_ICON_PRESETS = ICON_COLOR_PRESETS.filter(preset => preset.id !== 'none')
const MAX_TEXT_ICON_CHARACTERS = 6
const TEXT_ICON_MAX_WIDTH_RATIO = 0.78

export const normalizeTextIconText = (value: string): string =>
  Array.from(value.trim()).slice(0, MAX_TEXT_ICON_CHARACTERS).join('')

export const pickRandomIconColor = (random = Math.random): IconColorId => {
  const randomValue = random()
  const normalizedRandom = Number.isFinite(randomValue) ? randomValue : 0
  const index = Math.min(
    COLORED_ICON_PRESETS.length - 1,
    Math.max(0, Math.floor(normalizedRandom * COLORED_ICON_PRESETS.length))
  )
  return COLORED_ICON_PRESETS[index].id
}

const drawRoundedSquare = (context: CanvasRenderingContext2D, size: number, radius: number) => {
  context.beginPath()
  context.moveTo(radius, 0)
  context.lineTo(size - radius, 0)
  context.quadraticCurveTo(size, 0, size, radius)
  context.lineTo(size, size - radius)
  context.quadraticCurveTo(size, size, size - radius, size)
  context.lineTo(radius, size)
  context.quadraticCurveTo(0, size, 0, size - radius)
  context.lineTo(0, radius)
  context.quadraticCurveTo(0, 0, radius, 0)
  context.closePath()
}

export const createTextIconDataUri = (value: string, colorId: IconColorId, size = 256): string => {
  const text = normalizeTextIconText(value)
  if (typeof document === 'undefined') return ''

  const preset =
    ICON_COLOR_PRESETS.find(candidate => candidate.id === colorId) ?? ICON_COLOR_PRESETS[0]
  if (!text && preset.id === 'none') return ''

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) return ''

  context.clearRect(0, 0, size, size)
  if (preset.id !== 'none') {
    drawRoundedSquare(context, size, Math.round(size * 0.22))
    context.fillStyle = preset.color
    context.fill()
  }

  if (text) {
    let fontSize = Math.round(size * (Array.from(text).length === 1 ? 0.54 : 0.41))
    context.font = `700 ${fontSize}px "Segoe UI", sans-serif`
    const measuredWidth = context.measureText(text).width
    const maxTextWidth = size * TEXT_ICON_MAX_WIDTH_RATIO
    if (measuredWidth > maxTextWidth) {
      fontSize = Math.max(1, Math.floor((fontSize * maxTextWidth) / measuredWidth))
      context.font = `700 ${fontSize}px "Segoe UI", sans-serif`
    }
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.lineJoin = 'round'

    if (preset.id === 'none') {
      context.lineWidth = Math.max(8, Math.round(size * 0.055))
      context.strokeStyle = '#F8FAFC'
      context.strokeText(text, size / 2, size / 2 + size * 0.025)
    }

    context.fillStyle = preset.foreground
    context.fillText(text, size / 2, size / 2 + size * 0.025)
  }

  return canvas.toDataURL('image/png')
}

export const createColoredIconDataUri = async (
  source: string,
  colorId: IconColorId,
  size = 256
): Promise<string> => {
  if (!source || colorId === 'none' || typeof document === 'undefined') return source

  const preset = ICON_COLOR_PRESETS.find(candidate => candidate.id === colorId)
  if (!preset) return source

  return createIconWithBackgroundColorDataUri(source, preset.color, size)
}

export const createIconWithBackgroundColorDataUri = async (
  source: string,
  color: string,
  size = 256
): Promise<string> => {
  if (!source || !color || typeof document === 'undefined') return source

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const nextImage = new Image()
    nextImage.onload = () => resolve(nextImage)
    nextImage.onerror = () => reject(new Error('Failed to load icon preview'))
    nextImage.src = source
  })

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) return ''

  drawRoundedSquare(context, size, Math.round(size * 0.22))
  context.fillStyle = color
  context.fill()

  const availableSize = size
  const scale = Math.min(availableSize / image.naturalWidth, availableSize / image.naturalHeight)
  const width = image.naturalWidth * scale
  const height = image.naturalHeight * scale
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height)
  return canvas.toDataURL('image/png')
}
