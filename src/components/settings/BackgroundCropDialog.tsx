import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import Cropper, { type Area, type Point } from 'react-easy-crop'
import { Crop, LoaderCircle, RotateCcw, X } from 'lucide-react'
import { translate } from '@/lib/i18n'
import { Button } from '@/components/ui/button'

const CROP_ZOOM_MAX = 3

async function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('image decode failed'))
    image.src = src
  })
}

/** 按取景区域从源图裁出原始像素，编码为 JPEG 交给统一压缩管线。 */
async function cropImageToBlob(source: string, area: Area): Promise<Blob> {
  const image = await loadHtmlImage(source)
  const width = Math.max(1, Math.round(area.width))
  const height = Math.max(1, Math.round(area.height))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('canvas unavailable')
  context.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, width, height)
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92))
  if (!blob) throw new Error('encode failed')
  return blob
}

interface BackgroundCropDialogProps {
  /** 裁剪源图（用户所选图片的 object URL，或已保存背景的 data URI）。 */
  source: string
  /** 源图类型：原图（可无损重取景）或已压缩背景（旧设置兜底）。 */
  sourceKind: 'original' | 'compressed'
  /** 取景框宽高比：跟随主窗口实际比例，所见即所得。 */
  aspect: number
  /** 确认取景：拿到裁剪出的原始 Blob，由父级走压缩与落盘；内部 catch 所有错误并提示，不抛出。 */
  onApply: (blob: Blob) => Promise<void> | void
  onClose: () => void
}

/**
 * 自定义背景取景弹窗：react-easy-crop 固定比例取景框，
 * 拖动平移 + 滚轮缩放选择图片中显示为窗口背景的区域。
 * zoom=1 即源图完整视野（放大后可一键重置回初始），由父级条件渲染挂载，
 * source 变化时用 key 重挂复位。
 */
export function BackgroundCropDialog({
  source,
  sourceKind,
  aspect,
  onApply,
  onClose,
}: BackgroundCropDialogProps) {
  const croppedAreaRef = useRef<Area | null>(null)
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')
  const [sourceSize, setSourceSize] = useState<{ width: number; height: number } | null>(null)

  // 读取源图分辨率展示，方便确认当前编辑的是原图还是已压缩的背景。
  useEffect(() => {
    let cancelled = false
    void loadHtmlImage(source)
      .then(image => {
        if (cancelled) return
        setSourceSize({ width: image.naturalWidth, height: image.naturalHeight })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [source])

  const resetCropView = () => {
    setCrop({ x: 0, y: 0 })
    setZoom(1)
  }

  const handleApply = async () => {
    const area = croppedAreaRef.current
    if (!area || applying) return
    setApplying(true)
    setError('')
    try {
      const blob = await cropImageToBlob(source, area)
      await onApply(blob)
      onClose()
    } catch (error) {
      console.error('Failed to apply cropped background:', error)
      setError(translate('无法将裁剪结果设为背景，请重试。'))
      setApplying(false)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && !applying) {
      event.stopPropagation()
      onClose()
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4 backdrop-blur-[1px] dark:bg-black/45"
      onClick={applying ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="background-crop-title"
        onClick={event => event.stopPropagation()}
        onKeyDown={handleKeyDown}
        className="flex max-h-[min(46rem,calc(100vh-2rem))] w-full max-w-xl flex-col overflow-hidden rounded-card border border-border bg-card shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border/80 px-4 py-4 sm:px-5">
          <div className="min-w-0 space-y-1">
            <h3 id="background-crop-title" className="text-base font-semibold">
              {translate('调整背景取景')}
            </h3>
            <p className="truncate text-xs leading-5 text-muted-foreground">
              {translate(
                sourceKind === 'original'
                  ? '正在编辑原图，重新取景不影响画质。'
                  : '正在编辑已压缩的背景，重新应用一次壁纸可恢复原图画质。'
              )}
              {sourceSize
                ? translate('源图 {width}×{height}', {
                    width: sourceSize.width,
                    height: sourceSize.height,
                  })
                : ''}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={translate('重置缩放')}
              title={translate('重置缩放')}
              disabled={applying}
              onClick={resetCropView}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={translate('关闭')}
              disabled={applying}
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-4 py-3 sm:px-5">
          {/* 宽度=min(容器宽, 上限高×比例) 且 aspectRatio 定比，保证渲染比例恒等于取景比例。 */}
          <div
            className="relative mx-auto w-full overflow-hidden rounded-xl border border-border/70 bg-muted/40"
            style={{
              aspectRatio: String(aspect),
              width: `min(100%, calc(min(52vh, 30rem) * ${aspect}))`,
            }}
          >
            <Cropper
              image={source}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              minZoom={1}
              maxZoom={CROP_ZOOM_MAX}
              zoomWithScroll
              showGrid
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_area, areaPixels) => {
                croppedAreaRef.current = areaPixels
              }}
              mediaProps={{ draggable: false, alt: '' }}
            />
          </div>

          {error ? (
            <p role="alert" className="mt-2 text-xs leading-5 text-destructive">
              {error}
            </p>
          ) : null}

          <Button
            type="button"
            className="mt-3 w-full"
            disabled={applying}
            onClick={() => void handleApply()}
          >
            {applying ? <LoaderCircle className="size-4 animate-spin" /> : <Crop />}
            {applying ? translate('正在生成...') : translate('使用这张图片')}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
