import { useCallback, useEffect, useRef, useState } from 'react'
import { Grid2x2Check, RefreshCw } from 'lucide-react'
import { translate } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import {
  WALLPAPER_SOURCES,
  loadWallpaperPage,
  type WallpaperItem,
  type WallpaperSourceId,
} from '@/lib/wallpaperSources'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { WallpaperThumb } from '@/components/settings/WallpaperThumb'
import { WallpaperPickerDialog } from '@/components/settings/WallpaperPickerDialog'

const PREVIEW_COUNT = 6

interface WallpaperGalleryProps {
  /** 上层正在处理壁纸（编码/落盘）时禁用选择。 */
  disabled: boolean
  /** 当前选中的壁纸来源标识，如 `builtin:starry-sky`、`bing:<id>`。 */
  selectedSource: string
  /**
   * 确认应用某张壁纸并拿到原始图片 Blob。onPick 内部自行消化错误并提示，
   * 不向外抛出，避免与本组件的加载错误提示重复。
   */
  onPick: (source: string, blob: Blob) => void | Promise<void>
}

/**
 * 设置卡片内的紧凑壁纸库：源切换 + 当前源前 6 张预览 + 「更多」弹窗
 * （弹窗内支持分类筛选与触底分页加载）。缩略图点击行为是打开弹窗预览，
 * 在弹窗里点「应用壁纸」才真正应用；卡片缩略图点击则直接定位到该图预览。
 */
export function WallpaperGallery({ disabled, selectedSource, onPick }: WallpaperGalleryProps) {
  const [activeSource, setActiveSource] = useState<WallpaperSourceId>('builtin')
  const [previewItems, setPreviewItems] = useState<WallpaperItem[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogPreview, setDialogPreview] = useState<WallpaperItem | null>(null)
  const loadSeqRef = useRef(0)
  const toast = useToast()

  // 只含异步 setState：同步的 loading 重置由调用方（事件）负责，请求序号防切源竞态。
  const runPreviewLoad = useCallback(
    async (source: WallpaperSourceId) => {
      const seq = ++loadSeqRef.current
      try {
        const page = await loadWallpaperPage(source, 1)
        if (seq !== loadSeqRef.current) return
        setPreviewItems(page.items.slice(0, PREVIEW_COUNT))
      } catch (error) {
        console.error('Failed to load wallpaper preview:', error)
        if (seq !== loadSeqRef.current) return
        setPreviewItems([])
        toast.error(translate('加载壁纸失败：{error}', { error: String(error) }), {
          key: 'wallpaper-gallery',
          title: translate('壁纸库'),
        })
      } finally {
        if (seq === loadSeqRef.current) setLoading(false)
      }
    },
    [toast]
  )

  // 挂载时加载默认源；切换源由事件处理器重置 loading 后触发加载。
  useEffect(() => {
    // 加载函数内的 setState 均发生在 Promise 回调之后，不会在渲染期同步触发，属规则误报。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void runPreviewLoad('builtin')
  }, [runPreviewLoad])

  const switchSource = (source: WallpaperSourceId) => {
    if (source === activeSource) return
    setActiveSource(source)
    setLoading(true)
    void runPreviewLoad(source)
  }

  const retryPreview = () => {
    setLoading(true)
    void runPreviewLoad(activeSource)
  }

  /** 打开弹窗：传入壁纸时直接进入其预览页，传 null 则显示网格。 */
  const openDialog = (initialPreview: WallpaperItem | null) => {
    setDialogPreview(initialPreview)
    setDialogOpen(true)
  }

  const activeMeta = WALLPAPER_SOURCES.find(source => source.id === activeSource)

  return (
    <div className="space-y-2 border-t border-border/70 pt-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-foreground">{translate('壁纸库')}</p>
        <div className="flex flex-wrap items-center gap-1" role="tablist">
          {WALLPAPER_SOURCES.map(source => (
            <button
              key={source.id}
              type="button"
              role="tab"
              aria-selected={activeSource === source.id}
              onClick={() => switchSource(source.id)}
              className={cn(
                'cursor-pointer rounded-full px-2.5 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                activeSource === source.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/60 text-muted-foreground hover:text-foreground'
              )}
            >
              {translate(source.label)}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        {activeMeta ? translate(activeMeta.description) : ''}
      </p>

      {loading ? (
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: PREVIEW_COUNT }, (_, index) => (
            <div key={index} className="aspect-video animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : previewItems.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {previewItems.map(item => (
            <WallpaperThumb
              key={item.key}
              item={item}
              isSelected={selectedSource === item.key}
              isPicking={false}
              disabled={disabled}
              showCaption={item.source !== 'builtin'}
              onSelect={() => openDialog(item)}
            />
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/40 px-3 py-2.5">
          <p className="text-xs text-muted-foreground">{translate('加载壁纸失败。')}</p>
          <Button type="button" variant="outline" size="sm" onClick={retryPreview}>
            <RefreshCw />
            {translate('重试')}
          </Button>
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        disabled={disabled}
        onClick={() => openDialog(null)}
      >
        <Grid2x2Check />
        {translate('更多壁纸')}
      </Button>

      {dialogOpen ? (
        <WallpaperPickerDialog
          disabled={disabled}
          selectedSource={selectedSource}
          initialPreview={dialogPreview}
          onPick={onPick}
          onClose={() => setDialogOpen(false)}
        />
      ) : null}
    </div>
  )
}
