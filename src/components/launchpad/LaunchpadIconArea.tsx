import { Suspense, lazy } from 'react'
import { Import, Plus, RefreshCw, Wand2 } from 'lucide-react'
import { translate } from '@/lib/i18n'
import type { DesktopIcon, LaunchpadGridViewMode } from '@/types'
import type { LaunchpadImportPlacementRequest } from '@/components/launchpad/useLaunchpadIconImportController'
import { loadIconGrid, loadScrollableIconGrid } from '@/components/launchpad/launchpadGridChunks'
import { Button } from '@/components/ui/button'

const ScrollableIconGrid = lazy(() =>
  loadScrollableIconGrid().then(module => ({ default: module.ScrollableIconGrid }))
)
const IconGrid = lazy(() => loadIconGrid().then(module => ({ default: module.IconGrid })))

interface LaunchpadIconAreaProps {
  loading: boolean
  /** 图标库加载错误（icons 为空且出错时展示重试界面）。 */
  error: string | null
  icons: DesktopIcon[]
  onRetry: () => void
  gridViewMode: LaunchpadGridViewMode
  layoutResetToken: number
  sidebarCompact: boolean
  onToggleSidebarCompact: () => void
  importPlacementRequest: LaunchpadImportPlacementRequest | null
  addIconDisabled: boolean
  onAddIcon: () => void
  onQuickImport: () => void
}

/**
 * 启动台主区的内容状态机：加载中 / 加载失败重试 / 空态引导 / 滚动布局 / 分页布局。
 */
export function LaunchpadIconArea({
  loading,
  error,
  icons,
  onRetry,
  gridViewMode,
  layoutResetToken,
  sidebarCompact,
  onToggleSidebarCompact,
  importPlacementRequest,
  addIconDisabled,
  onAddIcon,
  onQuickImport,
}: LaunchpadIconAreaProps) {
  return (
    <div className="flex h-full min-h-0 items-center justify-center">
      {loading ? (
        <div className="flex items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-foreground/40 border-t-foreground" />
          <span className="launchpad-wallpaper-text text-lg text-foreground/70">
            {translate('Loading...')}
          </span>
        </div>
      ) : error && icons.length === 0 ? (
        <div
          role="alert"
          className="flex max-w-md flex-col items-center gap-3 px-6 text-center"
        >
          <div className="space-y-1">
            <p className="launchpad-wallpaper-text text-sm font-medium text-foreground">
              {translate('图标库加载失败，请重试。')}
            </p>
            <p
              className="launchpad-wallpaper-text break-words text-xs leading-5 text-muted-foreground"
              title={error}
            >
              {translate('现有布局不会被修改。')}
            </p>
          </div>
          <Button type="button" size="sm" onClick={onRetry}>
            <RefreshCw className="h-4 w-4" />
            {translate('重试')}
          </Button>
        </div>
      ) : icons.length === 0 ? (
        <div className="flex max-w-md flex-col items-center gap-4 px-6 text-center">
          <div className="flex h-28 w-44 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-foreground/30 bg-background/35 text-foreground/55 backdrop-blur-sm">
            <Import className="h-6 w-6" />
            <span className="launchpad-wallpaper-text text-xs">
              {translate('把图标拖到这里导入')}
            </span>
          </div>
          <div className="space-y-1">
            <p className="launchpad-wallpaper-text text-sm font-medium text-foreground">
              {translate('启动台还是空的')}
            </p>
            <p className="launchpad-wallpaper-text text-xs leading-5 text-muted-foreground">
              {translate(
                '从桌面或资源管理器把应用、快捷方式或文件拖进窗口即可导入，也可以手动添加。'
              )}
            </p>
            <p className="launchpad-wallpaper-text text-xs leading-5 text-muted-foreground">
              {translate('还可以一键扫描已安装的应用，批量导入常用软件。')}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={onQuickImport}
              disabled={addIconDisabled}
            >
              <Wand2 className="h-4 w-4" />
              {translate('快捷导入')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onAddIcon}
              disabled={addIconDisabled}
            >
              <Plus className="h-4 w-4" />
              {translate('添加图标')}
            </Button>
          </div>
        </div>
      ) : gridViewMode === 'scroll' ? (
        <Suspense
          fallback={
            <div className="flex items-center gap-3">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-foreground/40 border-t-foreground" />
              <span className="launchpad-wallpaper-text text-lg text-foreground/70">
                {translate('Loading...')}
              </span>
            </div>
          }
        >
          <ScrollableIconGrid
            icons={icons}
            layoutResetToken={layoutResetToken}
            sidebarCompact={sidebarCompact}
            onToggleSidebarCompact={onToggleSidebarCompact}
            importPlacementRequest={importPlacementRequest}
            addIconDisabled={addIconDisabled}
            onAddIcon={onAddIcon}
          />
        </Suspense>
      ) : (
        <Suspense
          fallback={
            <span className="launchpad-wallpaper-text text-sm text-foreground/70">
              {translate('Loading...')}
            </span>
          }
        >
          <IconGrid
            icons={icons}
            layoutResetToken={layoutResetToken}
            importPlacementRequest={importPlacementRequest}
          />
        </Suspense>
      )}
    </div>
  )
}
