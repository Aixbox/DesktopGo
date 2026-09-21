import { useCallback, useEffect, useState, type UIEvent } from 'react'
import { ArrowLeft, LoaderCircle, Maximize2, RefreshCw, X } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { emit } from '@tauri-apps/api/event'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { translate } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useZoomableViewport } from '@/lib/useZoomableViewport'
import {
  WALLPAPER_SOURCES,
  downloadWallpaperBlob,
  loadWallpaperPage,
  type WallpaperItem,
  type WallpaperSourceId,
} from '@/lib/wallpaperSources'
import { Button } from '@/components/ui/button'
import { NativeScrollArea } from '@/components/ui/native-scroll-area'
import { useToast } from '@/components/ui/toast'
import { WallpaperThumb } from '@/components/settings/WallpaperThumb'

type PickerLoadStatus = 'loading' | 'ready' | 'loading-more' | 'error'

const VIEWER_WINDOW_LABEL = 'wallpaper-viewer'

/**
 * 预览大图：直接加载原图（fullUrl），缩略图作为占位层在原图就绪后淡出——
 * 各图源的 previewUrl 只是中等/小尺寸缩略图，放大后发糊。
 * 交互（滚轮缩放、按住拖动、双击复位）由共享的 useZoomableViewport 提供。
 */
function ZoomablePreviewImage({ item }: { item: WallpaperItem }) {
  const [fullLoaded, setFullLoaded] = useState(false)
  const { view, viewportRef, dragging, pointerHandlers, reset } = useZoomableViewport()
  const hasPlaceholder = Boolean(item.thumbUrl && item.thumbUrl !== item.fullUrl)

  return (
    <div
      ref={viewportRef}
      className="relative flex h-full w-full items-center justify-center overflow-hidden"
    >
      {hasPlaceholder ? (
        <img
          src={item.thumbUrl}
          alt=""
          aria-hidden
          draggable={false}
          className={cn(
            'pointer-events-none absolute inset-0 h-full w-full object-contain transition-opacity duration-300',
            fullLoaded ? 'opacity-0' : 'opacity-100'
          )}
        />
      ) : null}
      <img
        src={item.fullUrl}
        alt={item.title}
        draggable={false}
        onLoad={() => setFullLoaded(true)}
        onDoubleClick={reset}
        {...pointerHandlers}
        className={cn(
          'relative max-h-full max-w-full touch-none select-none object-contain',
          view.scale > 1 ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
        )}
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
      />
      <span className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-black/45 px-2 py-0.5 text-[10px] leading-4 text-white">
        {translate('滚轮缩放 · 拖动查看 · 双击复位')}
      </span>
    </div>
  )
}

interface WallpaperPickerDialogProps {
  /** 上层正在处理壁纸（编码/落盘）时禁用选择。 */
  disabled: boolean
  selectedSource: string
  /** 打开时直接进入该壁纸的预览（设置卡片缩略图点击进入），为空则显示网格。 */
  initialPreview?: WallpaperItem | null
  /** 确认应用后的回调：拿到原始图片 Blob。 */
  onPick: (source: string, blob: Blob) => void | Promise<void>
  onClose: () => void
}

/**
 * 壁纸库「更多」弹窗：多源切换 + 分类筛选 + 触底分页加载。
 * 点击缩略图进入大图预览（可缩放/拖动查看），在预览里点「应用壁纸」才真正下载并应用；
 * 由父级条件渲染挂载（打开即挂载、关闭即卸载），挂载后立即加载默认源，
 * 切换源/分类与重试都从事件处理器触发，加载函数内不做同步 setState。
 */
export function WallpaperPickerDialog({
  disabled,
  selectedSource,
  initialPreview = null,
  onPick,
  onClose,
}: WallpaperPickerDialogProps) {
  const toast = useToast()
  const [activeSource, setActiveSource] = useState<WallpaperSourceId>('builtin')
  const [activeCategory, setActiveCategory] = useState('')
  const [items, setItems] = useState<WallpaperItem[]>([])
  const [status, setStatus] = useState<PickerLoadStatus>('loading')
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(1)
  const [preview, setPreview] = useState<WallpaperItem | null>(initialPreview)
  const [applyingKey, setApplyingKey] = useState<string | null>(null)

  const runFirstLoad = useCallback(
    async (source: WallpaperSourceId, category: string) => {
      try {
        const page = await loadWallpaperPage(source, 1, { categoryId: category })
        setItems(page.items)
        setHasMore(page.hasMore)
        setStatus('ready')
      } catch (error) {
        console.error('Failed to load wallpaper source:', error)
        setStatus('error')
        toast.error(translate('加载壁纸失败：{error}', { error: String(error) }), {
          key: 'wallpaper-picker',
          title: translate('壁纸库'),
        })
      }
    },
    [toast]
  )

  // 挂载即加载默认源（供「返回」回到网格）；后续的切换/重试全部由事件触发。
  useEffect(() => {
    // 加载函数内的 setState 均发生在 Promise 回调之后，不会在渲染期同步触发，属规则误报。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void runFirstLoad('builtin', '')
  }, [runFirstLoad])

  const startFirstLoad = (source: WallpaperSourceId, category: string) => {
    if (source === activeSource && category === activeCategory && status !== 'error') return
    setActiveSource(source)
    setActiveCategory(category)
    setItems([])
    setHasMore(false)
    setPage(1)
    setStatus('loading')
    void runFirstLoad(source, category)
  }

  const loadMore = async () => {
    if (status !== 'ready' || !hasMore) return
    // 各源每页条数不同（如 Wallhaven 匿名请求固定 24 条），页码需单独维护，
    // 不能由 items.length 反推。
    const nextPage = page + 1
    setStatus('loading-more')
    try {
      const result = await loadWallpaperPage(activeSource, nextPage, { categoryId: activeCategory })
      setItems(current => [...current, ...result.items])
      setHasMore(result.hasMore)
      setPage(nextPage)
      setStatus('ready')
    } catch (error) {
      console.error('Failed to load more wallpapers:', error)
      setStatus('ready')
      toast.error(translate('加载更多壁纸失败：{error}', { error: String(error) }), {
        key: 'wallpaper-picker-more',
        title: translate('壁纸库'),
      })
    }
  }

  /** 预览页的「应用壁纸」：下载原图走统一压缩管线，成功后回到网格继续挑选。 */
  const handleApply = async (item: WallpaperItem) => {
    if (disabled || applyingKey) return
    setApplyingKey(item.key)
    try {
      const blob = await downloadWallpaperBlob(item)
      await onPick(item.key, blob)
      setPreview(null)
    } catch (error) {
      console.error('Failed to download wallpaper:', error)
      toast.error(translate('加载壁纸失败：{error}', { error: String(error) }), {
        key: 'wallpaper-picker',
        title: translate('壁纸库'),
      })
    } finally {
      setApplyingKey(null)
    }
  }

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget
    if (element.scrollTop + element.clientHeight >= element.scrollHeight - 240) {
      void loadMore()
    }
  }

  /** 在独立窗口查看原图：窗口已开时通过全局事件换图并聚焦，否则由 Rust 侧建窗。 */
  const openViewerWindow = async (item: WallpaperItem) => {
    const payload = { src: item.fullUrl, title: item.title, subtitle: item.subtitle ?? '' }
    try {
      const existing = await WebviewWindow.getByLabel(VIEWER_WINDOW_LABEL)
      if (existing) {
        await emit('wallpaper-viewer:update', payload)
        // 不用 existing.setFocus()：tao 前台切换失败时会向其他程序注入 ALT 按键。
        await invoke('activate_window', { label: VIEWER_WINDOW_LABEL })
        return
      }
    } catch (error) {
      console.error('Failed to query wallpaper viewer window:', error)
    }
    try {
      await invoke('open_wallpaper_viewer', {
        src: payload.src,
        title: payload.title,
        subtitle: payload.subtitle,
      })
    } catch (error) {
      console.error('Failed to create wallpaper viewer window:', error)
      toast.error(translate('打开独立窗口失败：{error}', { error: String(error) }), {
        key: 'wallpaper-viewer',
        title: translate('壁纸库'),
      })
    }
  }

  const activeMeta = WALLPAPER_SOURCES.find(source => source.id === activeSource)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4 backdrop-blur-[1px] dark:bg-black/45"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallpaper-picker-title"
        onClick={event => event.stopPropagation()}
        className="flex max-h-[min(46rem,calc(100vh-2rem))] w-full max-w-3xl flex-col overflow-hidden rounded-card border border-border bg-card shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border/80 px-4 py-4 sm:px-5">
          <div className="min-w-0 space-y-1">
            <h3 id="wallpaper-picker-title" className="text-base font-semibold">
              {translate('壁纸库')}
            </h3>
            <p className="truncate text-xs leading-5 text-muted-foreground">
              {activeMeta && !preview ? translate(activeMeta.description) : ''}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={translate('关闭')}
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {preview ? (
          <div className="flex min-h-0 flex-1 flex-col px-4 py-3 sm:px-5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{preview.title}</p>
                {preview.subtitle ? (
                  <p className="truncate text-xs leading-5 text-muted-foreground">
                    {preview.subtitle}
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void openViewerWindow(preview)}
              >
                <Maximize2 />
                {translate('独立窗口')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!!applyingKey}
                onClick={() => setPreview(null)}
              >
                <ArrowLeft />
                {translate('返回')}
              </Button>
            </div>
            <div className="mt-2 flex min-h-72 flex-1 items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-muted/40">
              <ZoomablePreviewImage key={preview.key} item={preview} />
            </div>
            <Button
              type="button"
              className="mt-3 w-full"
              disabled={disabled || !!applyingKey}
              onClick={() => void handleApply(preview)}
            >
              {applyingKey === preview.key ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : null}
              {translate('应用壁纸')}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1.5 border-b border-border/70 px-4 py-2.5 sm:px-5">
              {WALLPAPER_SOURCES.map(source => (
                <button
                  key={source.id}
                  type="button"
                  role="tab"
                  aria-selected={activeSource === source.id}
                  onClick={() => startFirstLoad(source.id, '')}
                  className={cn(
                    'cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    activeSource === source.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/60 text-muted-foreground hover:text-foreground'
                  )}
                >
                  {translate(source.label)}
                </button>
              ))}
            </div>

            {activeMeta?.categories?.length ? (
              <div
                className="flex flex-wrap items-center gap-1 border-b border-border/70 px-4 py-2 sm:px-5"
                role="tablist"
                aria-label={translate('分类')}
              >
                {activeMeta.categories.map(category => (
                  <button
                    key={category.id}
                    type="button"
                    role="tab"
                    aria-selected={activeCategory === category.id}
                    onClick={() => startFirstLoad(activeSource, category.id)}
                    className={cn(
                      'cursor-pointer rounded-full px-2 py-1 text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      activeCategory === category.id
                        ? 'bg-secondary text-secondary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {translate(category.label)}
                  </button>
                ))}
              </div>
            ) : null}

            <NativeScrollArea asChild>
              <div
                className="min-h-64 flex-1 overflow-y-auto px-4 py-3 sm:px-5"
                onScroll={handleScroll}
              >
                {status === 'loading' ? (
                  <div className="grid grid-cols-4 gap-3">
                    {Array.from({ length: 12 }, (_, index) => (
                      <div key={index} className="aspect-video animate-pulse rounded-xl bg-muted" />
                    ))}
                  </div>
                ) : status === 'error' ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-12">
                    <p className="text-xs text-muted-foreground">{translate('加载壁纸失败。')}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => startFirstLoad(activeSource, activeCategory)}
                    >
                      <RefreshCw />
                      {translate('重试')}
                    </Button>
                  </div>
                ) : items.length === 0 ? (
                  <div className="flex min-h-48 items-center justify-center text-xs text-muted-foreground">
                    {translate('暂无壁纸。')}
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-4 gap-3">
                      {items.map(item => (
                        <WallpaperThumb
                          key={item.key}
                          item={item}
                          isSelected={selectedSource === item.key}
                          isPicking={applyingKey === item.key}
                          disabled={disabled}
                          showCaption
                          onSelect={() => setPreview(item)}
                        />
                      ))}
                    </div>
                    <div className="py-3 text-center">
                      {status === 'loading-more' ? (
                        <span className="text-xs text-muted-foreground">
                          {translate('加载中...')}
                        </span>
                      ) : hasMore ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void loadMore()}
                        >
                          {translate('加载更多')}
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {translate('已加载全部壁纸')}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            </NativeScrollArea>
          </>
        )}
      </div>
    </div>
  )
}
