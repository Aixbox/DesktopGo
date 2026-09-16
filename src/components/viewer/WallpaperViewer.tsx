import {
  useCallback,
  useEffect,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import {
  Copy,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Minus,
  Scan,
  Square,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { translate } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useZoomableViewport } from '@/lib/useZoomableViewport'
import { Button } from '@/components/ui/button'

interface ViewerPayload {
  src: string
  title: string
  subtitle?: string
}

function readInitialPayload(): ViewerPayload | null {
  const params = new URLSearchParams(window.location.search)
  const src = params.get('src')
  if (!src) return null
  return { src, title: params.get('title') ?? '', subtitle: params.get('subtitle') ?? '' }
}

function ViewerControlButton({
  label,
  danger = false,
  onClick,
  children,
}: {
  label: string
  danger?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onPointerDown={event => event.stopPropagation()}
      onDoubleClick={event => event.stopPropagation()}
      onClick={onClick}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-button text-white/60 transition-colors duration-150 cursor-pointer hover:bg-white/12 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
        danger && 'hover:bg-red-500/70 hover:text-white'
      )}
    >
      <span className="flex h-4 w-4 items-center justify-center">{children}</span>
    </button>
  )
}

/**
 * 独立壁纸查看窗口（由 Rust 侧以与设置窗口一致的无边框样式创建，创建时不可见）：
 * 自绘标题栏（拖动 / 双击最大化 / 最小化 / 最大化 / 关闭）、纯黑底全分辨率显示，
 * 支持滚轮缩放 / 拖动平移 / 双击图片全屏 / F 键全屏 / Esc 退出全屏或关闭窗口。
 * 前端渲染就绪后自行 show + 聚焦；设置窗口通过全局事件 `wallpaper-viewer:update` 换图。
 */
export function WallpaperViewer() {
  const [payload, setPayload] = useState<ViewerPayload | null>(readInitialPayload)
  const [fullscreen, setFullscreen] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const { view, viewportRef, dragging, pointerHandlers, reset, zoomIn, zoomOut } =
    useZoomableViewport({ maxScale: 8, minScale: 0.25 })
  const expanded = maximized || fullscreen

  // 窗口由 Rust 侧隐藏创建：标题、显示与聚焦都在前端就绪后进行，避免透明空窗闪现。
  useEffect(() => {
    const webviewWindow = getCurrentWebviewWindow()
    void webviewWindow
      .setTitle(translate('壁纸预览'))
      .catch(error => console.error('Failed to set wallpaper viewer title:', error))
    void webviewWindow
      .show()
      .then(() => webviewWindow.setFocus())
      .catch(error => console.error('Failed to show wallpaper viewer window:', error))
  }, [])

  const syncWindowState = useCallback(async () => {
    const webviewWindow = getCurrentWebviewWindow()
    try {
      const [isMaximized, isFullscreen] = await Promise.all([
        webviewWindow.isMaximized(),
        webviewWindow.isFullscreen(),
      ])
      setMaximized(isMaximized)
      setFullscreen(isFullscreen)
    } catch (error) {
      console.error('Failed to sync wallpaper viewer window state:', error)
    }
  }, [])

  useEffect(() => {
    let disposed = false
    let unlistenResize: (() => void) | undefined
    void getCurrentWebviewWindow()
      .onResized(() => {
        void syncWindowState()
      })
      .then(fn => {
        if (disposed) {
          fn()
          return
        }
        unlistenResize = fn
      })
    return () => {
      disposed = true
      unlistenResize?.()
    }
  }, [syncWindowState])

  // 后续换图走全局事件（窗口已打开时设置窗口不再重建，直接更新内容）。
  useEffect(() => {
    const subscription = listen<ViewerPayload>('wallpaper-viewer:update', event => {
      setLoaded(false)
      setLoadFailed(false)
      reset()
      setPayload(event.payload)
    })
    return () => {
      void subscription.then(unlisten => unlisten())
    }
  }, [reset])

  const closeWindow = useCallback(() => {
    void getCurrentWebviewWindow()
      .close()
      .catch(error => console.error('Failed to close wallpaper viewer:', error))
  }, [])

  const toggleFullscreen = useCallback(async () => {
    const webviewWindow = getCurrentWebviewWindow()
    try {
      const next = !(await webviewWindow.isFullscreen())
      await webviewWindow.setFullscreen(next)
      setFullscreen(next)
    } catch (error) {
      console.error('Failed to toggle wallpaper viewer fullscreen:', error)
    }
  }, [])

  const toggleMaximize = useCallback(() => {
    void getCurrentWebviewWindow()
      .toggleMaximize()
      .then(() => syncWindowState())
      .catch(error => console.error('Failed to toggle wallpaper viewer maximize:', error))
  }, [syncWindowState])

  const minimizeWindow = useCallback(() => {
    void getCurrentWebviewWindow()
      .minimize()
      .catch(error => console.error('Failed to minimize wallpaper viewer:', error))
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (fullscreen) {
          void toggleFullscreen()
        } else {
          closeWindow()
        }
      } else if (event.key.toLowerCase() === 'f') {
        void toggleFullscreen()
      } else if (event.key === '+' || event.key === '=') {
        zoomIn()
      } else if (event.key === '-') {
        zoomOut()
      } else if (event.key === '0') {
        reset()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closeWindow, fullscreen, reset, toggleFullscreen, zoomIn, zoomOut])

  const handleTitlebarInteraction = (
    event: ReactPointerEvent<HTMLElement> | ReactMouseEvent<HTMLElement>
  ): boolean => {
    const target = event.target
    const element = target instanceof Element ? target : null
    return Boolean(element?.closest('button, a, input, [role="button"]'))
  }

  const handleTitlebarDragStart = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || handleTitlebarInteraction(event)) return
    void getCurrentWebviewWindow()
      .startDragging()
      .catch(error => console.error('Failed to drag wallpaper viewer window:', error))
  }

  const handleTitlebarDoubleClick = (event: ReactMouseEvent<HTMLElement>) => {
    if (handleTitlebarInteraction(event)) return
    toggleMaximize()
  }

  const titlebar = (
    <header
      onPointerDown={handleTitlebarDragStart}
      onDoubleClick={handleTitlebarDoubleClick}
      className="flex h-11 shrink-0 cursor-grab items-center gap-3 border-b border-white/10 px-3 active:cursor-grabbing"
    >
      <p className="min-w-0 flex-1 truncate text-xs text-white/50">{translate('壁纸预览')}</p>
      <div className="flex items-center gap-0.5">
        <div className="mr-1 flex items-center rounded-button border border-white/10 px-0.5">
          <ViewerControlButton label={translate('缩小')} onClick={zoomOut}>
            <ZoomOut className="h-4 w-4" />
          </ViewerControlButton>
          <button
            type="button"
            aria-label={translate('适应窗口')}
            title={translate('适应窗口')}
            onPointerDown={event => event.stopPropagation()}
            onDoubleClick={event => event.stopPropagation()}
            onClick={reset}
            className="w-11 cursor-pointer text-center text-[11px] leading-4 tabular-nums text-white/60 transition-colors duration-150 hover:text-white focus-visible:outline-none"
          >
            {Math.round(view.scale * 100)}%
          </button>
          <ViewerControlButton label={translate('放大')} onClick={zoomIn}>
            <ZoomIn className="h-4 w-4" />
          </ViewerControlButton>
        </div>
        <ViewerControlButton label={translate('适应窗口')} onClick={reset}>
          <Scan className="h-4 w-4" />
        </ViewerControlButton>
        <ViewerControlButton
          label={translate(fullscreen ? '退出全屏' : '全屏')}
          onClick={() => void toggleFullscreen()}
        >
          {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </ViewerControlButton>
        <ViewerControlButton label={translate('最小化')} onClick={minimizeWindow}>
          <Minus className="h-4 w-4" />
        </ViewerControlButton>
        <ViewerControlButton
          label={translate(maximized ? '还原窗口' : '最大化')}
          onClick={toggleMaximize}
        >
          {maximized ? <Copy className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
        </ViewerControlButton>
        <ViewerControlButton label={translate('关闭')} danger onClick={closeWindow}>
          <X className="h-4 w-4" />
        </ViewerControlButton>
      </div>
    </header>
  )

  if (!payload) {
    return (
      <div
        className="wallpaper-viewer-shell flex h-full w-full flex-col overflow-hidden bg-black"
        data-window-expanded={expanded}
      >
        {titlebar}
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <p className="text-sm text-white/60">{translate('未指定要查看的图片。')}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={closeWindow}
            className="border-white/25 bg-transparent text-white/80 hover:bg-white/15 hover:text-white"
          >
            <X />
            {translate('关闭窗口')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="wallpaper-viewer-shell flex h-full w-full flex-col overflow-hidden bg-black"
      data-window-expanded={expanded}
    >
      {fullscreen ? null : titlebar}
      <div
        ref={viewportRef}
        {...pointerHandlers}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden"
        onDoubleClick={() => void toggleFullscreen()}
      >
        {!loaded ? (
          <div className="pointer-events-none absolute flex flex-col items-center gap-2 text-white/50">
            <LoaderCircle className="h-6 w-6 animate-spin" />
            {loadFailed ? <span className="text-xs">{translate('图片加载失败。')}</span> : null}
          </div>
        ) : null}
        <img
          key={payload.src}
          src={payload.src}
          alt={payload.title}
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(false)
            setLoadFailed(true)
          }}
          className={cn(
            'max-h-full max-w-full touch-none select-none object-contain',
            view.scale > 1 ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
          )}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
        />
        {!fullscreen ? (
          <span className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-white/10 px-2 py-0.5 text-[10px] leading-4 text-white/70">
            {translate('滚轮缩放 · 拖动查看 · 双击全屏')}
          </span>
        ) : null}
      </div>
    </div>
  )
}
