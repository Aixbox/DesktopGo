import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { cn } from '@/lib/utils'
import { translate, useI18n } from '@/lib/i18n'
import { NativeScrollArea } from '@/components/ui/native-scroll-area'
import { UpdatePanel } from '@/components/settings/UpdatePanel'
import { Logo } from '@/components/Logo'
import { SearchSettingsPanel } from '@/components/search/SearchSettingsPanel'
import {
  Settings as SettingsIcon,
  RefreshCw,
  Info,
  Images,
  Search,
  Minus,
  Square,
  Bot,
  Copy,
  X,
} from 'lucide-react'
import { AboutPanel } from '@/components/settings/AboutPanel'
import { AiSettingsPanel } from '@/components/settings/AiSettingsPanel'
import { GeneralSettingsPanel } from '@/components/settings/GeneralSettingsPanel'
import { IconManagerPanel } from '@/components/settings/IconManagerPanel'
import {
  shouldSkipReturnToMainOnClose,
  waitForWindowPersistentSync,
} from '@/components/settings/windowPersistentSync'

type NavItem = 'settings' | 'search' | 'iconManager' | 'ai' | 'update' | 'about'

const NAV_ITEMS: { key: NavItem; label: string; icon: ReactNode }[] = [
  { key: 'settings', label: '设置', icon: <SettingsIcon className="w-4 h-4" /> },
  { key: 'search', label: '搜索', icon: <Search className="w-4 h-4" /> },
  { key: 'iconManager', label: '图标库', icon: <Images className="w-4 h-4" /> },
  { key: 'ai', label: 'AI 助手', icon: <Bot className="w-4 h-4" /> },
  { key: 'update', label: '更新', icon: <RefreshCw className="w-4 h-4" /> },
  { key: 'about', label: '关于', icon: <Info className="w-4 h-4" /> },
]

const NAV_CONTENT_WIDTH: Record<NavItem, string> = {
  settings: 'max-w-[1120px]',
  search: 'max-w-[1180px]',
  iconManager: 'max-w-[1240px]',
  ai: 'max-w-[1120px]',
  update: 'max-w-[1240px]',
  about: 'max-w-[1360px]',
}

function WindowControlButton({
  label,
  onClick,
  tone = 'default',
  children,
}: {
  label: string
  onClick: () => void
  tone?: 'default' | 'danger'
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-no-window-drag="true"
      onPointerDown={event => event.stopPropagation()}
      onDoubleClick={event => event.stopPropagation()}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-sm transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
        tone === 'danger'
          ? 'text-muted-foreground hover:bg-red-500/12 hover:text-red-500 dark:hover:text-red-300'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      }`}
    >
      <span className="flex h-4 w-4 items-center justify-center">{children}</span>
    </button>
  )
}

export function Settings() {
  const { language } = useI18n()
  const [activeNav, setActiveNav] = useState<NavItem>('settings')
  const openIconManager = useCallback(() => setActiveNav('iconManager'), [])
  const [isMaximized, setIsMaximized] = useState(false)
  const isClosingRef = useRef(false)
  const shouldReturnToMainOnClose = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('returnToMain') === '1'
  }, [])
  const navItems = useMemo(
    () =>
      NAV_ITEMS.map(item => ({
        ...item,
        label: translate(item.label, undefined, language),
      })),
    [language]
  )

  const activeNavItem = navItems.find(item => item.key === activeNav) ?? navItems[0]

  const syncWindowState = useCallback(async () => {
    try {
      setIsMaximized(await getCurrentWindow().isMaximized())
    } catch (e) {
      console.error('Failed to sync settings window state:', e)
    }
  }, [])

  const closeSettingsWindow = useCallback(async () => {
    if (isClosingRef.current) return

    isClosingRef.current = true
    try {
      await waitForWindowPersistentSync()
      await invoke('close_settings_window', {
        returnToMain: shouldReturnToMainOnClose && !shouldSkipReturnToMainOnClose(),
      })
    } catch (e) {
      console.error('Failed to close settings window:', e)
    } finally {
      isClosingRef.current = false
    }
  }, [shouldReturnToMainOnClose])

  useEffect(() => {
    let disposed = false
    let unlistenResize: (() => void) | null = null
    let unlistenClose: (() => void) | null = null

    void getCurrentWindow()
      .isMaximized()
      .then(maximized => {
        if (!disposed) {
          setIsMaximized(maximized)
        }
      })
      .catch(e => console.error('Failed to sync settings window state:', e))

    void getCurrentWindow()
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

    void getCurrentWindow()
      .onCloseRequested(event => {
        if (isClosingRef.current) return
        event.preventDefault()
        void closeSettingsWindow()
      })
      .then(fn => {
        if (disposed) {
          fn()
          return
        }
        unlistenClose = fn
      })

    return () => {
      disposed = true
      unlistenResize?.()
      unlistenClose?.()
    }
  }, [closeSettingsWindow, syncWindowState])

  const isTitlebarInteractiveTarget = (target: EventTarget | null) => {
    const element =
      target instanceof Element ? target : target instanceof Node ? target.parentElement : null

    return Boolean(
      element?.closest(
        'button, a, input, textarea, select, [role="button"], [data-no-window-drag="true"]'
      )
    )
  }

  const handleWindowDragStart = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    if (isTitlebarInteractiveTarget(event.target)) return
    void getCurrentWindow()
      .startDragging()
      .catch(e => console.error('Failed to start dragging settings window:', e))
  }

  const handleTitlebarDoubleClick = (event: ReactMouseEvent<HTMLElement>) => {
    if (isTitlebarInteractiveTarget(event.target)) return
    handleToggleMaximizeWindow()
  }

  const handleMinimizeWindow = () => {
    void getCurrentWindow()
      .minimize()
      .catch(e => console.error('Failed to minimize settings window:', e))
  }

  const handleToggleMaximizeWindow = () => {
    void getCurrentWindow()
      .toggleMaximize()
      .then(() => syncWindowState())
      .catch(e => console.error('Failed to toggle settings window size:', e))
  }

  return (
    <div className="settings-shell flex h-screen w-screen bg-card text-foreground">
      <aside className="flex w-48 shrink-0 flex-col bg-card">
        <div
          onPointerDown={handleWindowDragStart}
          onDoubleClick={handleTitlebarDoubleClick}
          className="flex h-12 shrink-0 cursor-grab items-center px-4 active:cursor-grabbing"
        >
          <Logo iconSize={20} textSize="sm" className="shrink-0" />
        </div>

        <nav className="flex min-h-0 flex-1 flex-col px-3 py-3">
          <ul className="flex flex-col gap-1">
            {navItems.map(item => (
              <li key={item.key}>
                <button
                  onClick={() => setActiveNav(item.key)}
                  className={`settings-nav-item flex w-full items-center gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors cursor-pointer ${
                    activeNav === item.key
                      ? 'settings-nav-item-active border-transparent text-foreground font-medium'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col bg-card">
        <header
          onPointerDown={handleWindowDragStart}
          onDoubleClick={handleTitlebarDoubleClick}
          className="flex h-12 shrink-0 cursor-grab items-center gap-3 px-4 active:cursor-grabbing"
        >
          <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            {translate('设置 / {label}', { label: activeNavItem.label })}
          </p>

          <div data-no-window-drag="true" className="flex items-center gap-1">
            <WindowControlButton label={translate('最小化')} onClick={handleMinimizeWindow}>
              <Minus className="h-4 w-4" />
            </WindowControlButton>
            <WindowControlButton
              label={isMaximized ? translate('还原窗口') : translate('最大化')}
              onClick={handleToggleMaximizeWindow}
            >
              {isMaximized ? <Copy className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
            </WindowControlButton>
            <WindowControlButton
              label={translate('关闭')}
              tone="danger"
              onClick={() => void closeSettingsWindow()}
            >
              <X className="h-4 w-4" />
            </WindowControlButton>
          </div>
        </header>

        <NativeScrollArea asChild>
          <main className="settings-content-surface settings-main-scroll min-h-0 flex-1 overflow-y-auto rounded-tl-xl border-l border-t border-border/80 bg-background px-6 py-6 xl:px-8">
            <div className={cn('mx-auto w-full', NAV_CONTENT_WIDTH[activeNav])}>
              {activeNav === 'settings' && <GeneralSettingsPanel />}
              {activeNav === 'search' && (
                <SearchSettingsPanel onOpenIconLibrary={openIconManager} />
              )}
              {activeNav === 'iconManager' && <IconManagerPanel />}
              {activeNav === 'ai' && <AiSettingsPanel />}
              {activeNav === 'update' && <UpdatePanel />}
              {activeNav === 'about' && <AboutPanel />}
            </div>
          </main>
        </NativeScrollArea>
      </div>
    </div>
  )
}
