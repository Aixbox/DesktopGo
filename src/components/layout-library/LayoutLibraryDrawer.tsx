import { useEffect, useMemo, useState } from 'react'
import type { WheelEvent } from 'react'
import {
  ChevronDown,
  ChevronUp,
  History,
  LayoutTemplate,
  Loader2,
  Pencil,
  Trash2,
} from 'lucide-react'
import { translate } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { NativeScrollArea } from '@/components/ui/native-scroll-area'
import { useToast } from '@/components/ui/toast'
import { LAYOUT_PAGE_STEP_EVENT } from '@/components/icon-grid/constants'
import { useIconStore } from '@/stores/iconStore'
import {
  formatLayoutVersionTime,
  listLayoutVersions,
  type LayoutVersionMeta,
} from './layoutLibrary'
import { LayoutHoverPreview } from './LayoutHoverPreview'
import { LayoutThumbnailView } from './LayoutThumbnailView'
import { useLayoutHoverPreview } from './useLayoutHoverPreview'

interface LayoutLibraryDrawerProps {
  currentGeometryKey: string
  previewId: string | null
  refreshToken: number
  collapsed: boolean
  onToggleCollapsed: () => void
  onPreview: (version: LayoutVersionMeta) => void | Promise<void>
  onApply: () => void | Promise<void>
  onCancel: () => void | Promise<void>
  onSaveCurrent: () => void
  onRename: (version: LayoutVersionMeta) => void
  onDelete: (version: LayoutVersionMeta) => void | Promise<void>
}

type DrawerTab = 'saved' | 'history'

const versionLabel = (version: LayoutVersionMeta) =>
  version.name?.trim() || formatLayoutVersionTime(version.createdAt)

const pageCount = (version: LayoutVersionMeta) => version.thumbnail?.pageTotal ?? 0

/** 卡片和悬停浮层共用的一行摘要：图标数 · 页数 · 保存时间。 */
const versionSummary = (version: LayoutVersionMeta) => {
  const parts = [translate('{count} 个图标', { count: version.iconCount })]
  const pages = pageCount(version)
  if (pages > 1) parts.push(translate('{count} 页', { count: pages }))
  if (version.name) parts.push(formatLayoutVersionTime(version.createdAt))
  return parts.join(' · ')
}

interface VersionCardProps {
  version: LayoutVersionMeta
  active: boolean
  geometryMatched: boolean
  iconImages: Map<string, string>
  onSelect: () => void
  onRename: () => void
  onDelete: () => void
}

/* 卡片本身是按钮，重命名/删除不能塞进它里面（按钮不能嵌套），
   所以两个动作做成浮在缩略图上的兄弟节点，只在悬停或键盘聚焦时露出来。 */
function VersionCard({
  version,
  active,
  geometryMatched,
  iconImages,
  onSelect,
  onRename,
  onDelete,
}: VersionCardProps) {
  const manageable = version.kind === 'saved'
  const hoverPreview = useLayoutHoverPreview()

  // 鼠标停在卡片上或键盘聚焦时弹放大图，延时由 hook 控，划过一排卡片不会闪。
  const openPreview = (element: HTMLElement) => hoverPreview.show(element, version.thumbnail)

  return (
    <div
      className="group relative shrink-0"
      onMouseEnter={event => openPreview(event.currentTarget)}
      onMouseLeave={hoverPreview.hide}
      onFocus={event => openPreview(event.currentTarget)}
      onBlur={hoverPreview.hide}
    >
      <button
        type="button"
        onClick={() => {
          hoverPreview.hide()
          onSelect()
        }}
        className={cn(
          'flex h-[116px] w-[136px] flex-col gap-1.5 rounded-xl border p-1.5 text-left transition-colors',
          active
            ? 'border-primary/55 bg-primary/10'
            : 'border-border/70 bg-card/70 hover:border-border hover:bg-accent/60'
        )}
      >
        <div className="relative h-[64px] w-full overflow-hidden rounded-[5px] bg-foreground/[0.05] p-1">
          <LayoutThumbnailView thumbnail={version.thumbnail} iconImages={iconImages} />
          {geometryMatched ? null : (
            <span className="absolute left-1 top-1 rounded bg-background/85 px-1 text-[9px] leading-4 text-muted-foreground">
              {translate('重排')}
            </span>
          )}
        </div>
        <span className="truncate text-xs font-medium">{versionLabel(version)}</span>
        <span className="truncate text-[10px] leading-3 text-muted-foreground">
          {versionSummary(version)}
        </span>
      </button>

      {manageable ? (
        <div className="pointer-events-none absolute right-1 top-1 flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
          <button
            type="button"
            aria-label={translate('重命名布局')}
            title={translate('重命名布局')}
            onClick={() => {
              hoverPreview.hide()
              onRename()
            }}
            className="flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border border-border/70 bg-background/90 text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:text-foreground"
          >
            <Pencil className="h-2.5 w-2.5" />
          </button>
          <button
            type="button"
            aria-label={translate('删除布局')}
            title={translate('删除布局')}
            onClick={() => {
              hoverPreview.hide()
              onDelete()
            }}
            className="flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border border-border/70 bg-background/90 text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:border-destructive/40 hover:text-destructive"
          >
            <Trash2 className="h-2.5 w-2.5" />
          </button>
        </div>
      ) : null}

      {hoverPreview.anchor ? (
        <LayoutHoverPreview anchor={hoverPreview.anchor} iconImages={iconImages} />
      ) : null}
    </div>
  )
}

/** 布局抽屉：顶部一条工具栏，展开时横向排缩略图卡片，折叠后只留工具栏以便看全网格。 */
export function LayoutLibraryDrawer({
  currentGeometryKey,
  previewId,
  refreshToken,
  collapsed,
  onToggleCollapsed,
  onPreview,
  onApply,
  onCancel,
  onSaveCurrent,
  onRename,
  onDelete,
}: LayoutLibraryDrawerProps) {
  const toast = useToast()
  const icons = useIconStore(state => state.icons)
  const [versions, setVersions] = useState<LayoutVersionMeta[] | null>(null)
  const [tab, setTab] = useState<DrawerTab>('saved')
  const loading = versions === null

  // 缩略图按图标 id 取图；图标库变动时才重建，不跟着刷新令牌走。
  const iconImages = useMemo(() => new Map(icons.map(icon => [icon.id, icon.icon_base64])), [icons])

  useEffect(() => {
    let disposed = false
    void listLayoutVersions('paged')
      .then(list => {
        if (!disposed) setVersions(list)
      })
      .catch(error => {
        console.error('Failed to load layout versions:', error)
        // 落成空列表：停在加载态会让人以为一直在读，重开抽屉就能重试。
        if (!disposed) setVersions([])
        toast.error(translate('加载布局失败，请重试。'), {
          key: 'layout-library',
          title: translate('布局'),
        })
      })
    return () => {
      disposed = true
    }
  }, [refreshToken, toast])

  /* 抽屉盖在网格上方，落在抽屉上的滚轮到不了网格，翻页就断了。
     这里把增量原样转给网格，阈值累积和冷却都由网格那边统一处理。 */
  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    const primaryDelta =
      Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX
    if (Math.abs(primaryDelta) < 0.1) return
    window.dispatchEvent(new CustomEvent(LAYOUT_PAGE_STEP_EVENT, { detail: primaryDelta }))
  }

  const allVersions = versions ?? []
  const savedVersions = allVersions.filter(version => version.kind === 'saved')
  const historyVersions = allVersions.filter(version => version.kind === 'auto')
  const visibleVersions = tab === 'saved' ? savedVersions : historyVersions
  const previewed = allVersions.find(version => version.id === previewId) ?? null

  const tabs: { key: DrawerTab; label: string; count: number }[] = [
    { key: 'saved', label: translate('已保存'), count: savedVersions.length },
    { key: 'history', label: translate('历史'), count: historyVersions.length },
  ]

  return (
    <div className="absolute inset-x-0 bottom-0 z-[60]">
      <div
        data-layout-drawer
        className="launchpad-layout-drawer overflow-hidden rounded-t-2xl border-t border-border/80 bg-card/92 shadow-[0_-18px_48px_rgba(15,23,42,0.24)] backdrop-blur-xl"
        onWheel={handleWheel}
      >
        <div className="flex h-12 items-center gap-2 px-4">
          <div className="accent-tonal flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border">
            <LayoutTemplate className="h-3.5 w-3.5" />
          </div>
          <p className="min-w-0 truncate text-sm font-medium">
            {previewed
              ? translate('正在预览：{name}', { name: versionLabel(previewed) })
              : translate('预览布局')}
          </p>

          <div className="ml-3 flex shrink-0 items-center gap-1">
            {tabs.map(item => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs transition-colors',
                  tab === item.key
                    ? 'bg-foreground/10 font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
                )}
              >
                {item.label}
                <span className="ml-1 text-[10px] tabular-nums opacity-70">{item.count}</span>
              </button>
            ))}
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onSaveCurrent}>
              {translate('保存当前')}
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => void onCancel()}>
              {translate('取消')}
            </Button>
            <Button
              size="sm"
              className="h-7 px-3"
              disabled={!previewId}
              onClick={() => void onApply()}
            >
              {translate('应用布局')}
            </Button>
            <button
              type="button"
              aria-label={collapsed ? translate('展开布局库') : translate('收起布局库')}
              onClick={onToggleCollapsed}
              className="flex h-7 w-7 items-center justify-center rounded-button text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {collapsed ? null : (
          /* 用项目统一的 native-scroll-area，滚动条样式跟设置页、弹窗里一致；
             `pb-3` 去掉，卡片区和滚动条轨道挤在同一段高度里。 */
          <NativeScrollArea asChild gutter="auto">
            <div className="h-[136px] overflow-x-auto overflow-y-hidden px-4">
              {loading ? (
                <div className="flex h-full items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {translate('正在加载...')}
                </div>
              ) : visibleVersions.length === 0 ? (
                <div className="flex h-full items-center gap-2 text-xs text-muted-foreground">
                  <History className="h-3.5 w-3.5" />
                  {tab === 'saved'
                    ? translate('还没有保存的布局。用「保存当前」记下现在的摆放。')
                    : translate('还没有历史快照，改动布局后会自动记录。')}
                </div>
              ) : (
                <div className="flex h-full w-max gap-2">
                  {visibleVersions.map(version => (
                    <VersionCard
                      key={version.id}
                      version={version}
                      active={version.id === previewId}
                      geometryMatched={version.geometryKey === currentGeometryKey}
                      iconImages={iconImages}
                      onSelect={() => void onPreview(version)}
                      onRename={() => onRename(version)}
                      onDelete={() => void onDelete(version)}
                    />
                  ))}
                </div>
              )}
            </div>
          </NativeScrollArea>
        )}
      </div>
    </div>
  )
}
