import { useState } from 'react'
import { Check, ImageOff, LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WallpaperItem } from '@/lib/wallpaperSources'
import { formControlFocusWithinClassName } from '@/components/ui/inputStyles'

interface WallpaperThumbProps {
  item: WallpaperItem
  isSelected: boolean
  isPicking: boolean
  disabled: boolean
  /** 底部渐变标题条（必应/图库类远程壁纸使用）。 */
  showCaption?: boolean
  onSelect: () => void
}

/**
 * 壁纸网格缩略图：缩略图地址加载失败时自动降级到备用地址（通常是原图），
 * 再失败则显示占位图标，避免远程存档偶发 404 出现破图。
 */
export function WallpaperThumb({
  item,
  isSelected,
  isPicking,
  disabled,
  showCaption = false,
  onSelect,
}: WallpaperThumbProps) {
  const [thumbSrc, setThumbSrc] = useState(item.thumbUrl)
  const [failed, setFailed] = useState(false)

  const handleThumbError = () => {
    const fallback = item.thumbFallbackUrl
    if (fallback && thumbSrc !== fallback) {
      setThumbSrc(fallback)
      return
    }
    setFailed(true)
  }

  return (
    <button
      key={item.key}
      type="button"
      disabled={disabled || isPicking}
      aria-pressed={isSelected}
      title={item.subtitle ? `${item.title} · ${item.subtitle}` : item.title}
      onClick={onSelect}
      className={cn(
        'group relative aspect-video cursor-pointer overflow-hidden rounded-xl border bg-muted transition',
        isSelected ? 'border-ring ring-2 ring-ring' : 'border-border/70 hover:border-foreground/30',
        formControlFocusWithinClassName
      )}
    >
      {failed ? (
        <span className="flex h-full w-full items-center justify-center text-muted-foreground">
          <ImageOff className="size-4" />
        </span>
      ) : (
        <img
          src={thumbSrc}
          alt={item.title}
          loading="lazy"
          draggable={false}
          onError={handleThumbError}
          className="h-full w-full object-cover"
        />
      )}
      {showCaption ? (
        <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-1.5 pb-1 pt-3 text-left text-[10px] leading-3 text-white">
          {item.title}
        </span>
      ) : null}
      {isPicking ? (
        <span className="absolute inset-0 flex items-center justify-center bg-black/40">
          <LoaderCircle className="size-5 animate-spin text-white" />
        </span>
      ) : isSelected ? (
        <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-3" />
        </span>
      ) : null}
    </button>
  )
}
