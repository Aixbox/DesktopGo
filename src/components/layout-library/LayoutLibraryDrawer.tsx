import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, History, LayoutTemplate, Loader2 } from 'lucide-react'
import { translate } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import {
  formatLayoutVersionTime,
  listLayoutVersions,
  type LayoutVersionMeta,
} from './layoutLibrary'
import { LayoutThumbnailView } from './LayoutThumbnailView'

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
}

type DrawerTab = 'saved' | 'history'

const versionLabel = (version: LayoutVersionMeta) =>
  version.name?.trim() || formatLayoutVersionTime(version.createdAt)

const pageCount = (version: LayoutVersionMeta) =>
  version.thumbnail ? version.thumbnail.pages.length + version.thumbnail.morePages : 0

interface VersionCardProps {
  version: LayoutVersionMeta
  active: boolean
  geometryMatched: boolean
  onSelect: () => void
}

function VersionCard({ version, active, geometryMatched, onSelect }: VersionCardProps) {
  const pages = pageCount(version)
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex h-[104px] w-[136px] shrink-0 flex-col gap-1.5 rounded-xl border p-1.5 text-left transition-colors',
        active
          ? 'border-primary/55 bg-primary/10'
          : 'border-border/70 bg-card/70 hover:border-border hover:bg-accent/60'
      )}
    >
      <div className="relative h-[52px] w-full rounded-md bg-foreground/[0.04] p-1">
        <LayoutThumbnailView thumbnail={version.thumbnail} />
        {geometryMatched ? null : (
          <span className="absolute right-1 top-1 rounded bg-background/85 px-1 text-[9px] leading-4 text-muted-foreground">
            {translate('重排')}
          </span>
        )}
      </div>
      <span className="truncate text-xs font-medium">{versionLabel(version)}</span>
      <span className="truncate text-[10px] leading-3 text-muted-foreground">
        {translate('{count} 个图标', { count: version.iconCount })}
        {pages > 1 ? ` · ${translate('{count} 页', { count: pages })}` : ''}
        {version.name ? ` · ${formatLayoutVersionTime(version.createdAt)}` : ''}
      </span>
    </button>
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
}: LayoutLibraryDrawerProps) {
  const toast = useToast()
  const [versions, setVersions] = useState<LayoutVersionMeta[] | null>(null)
  const [tab, setTab] = useState<DrawerTab>('saved')
  const loading = versions === null

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
        className="launchpad-layout-drawer border-t border-border/80 bg-card/92 shadow-[0_-18px_48px_rgba(15,23,42,0.24)] backdrop-blur-xl"
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
          <div className="h-[124px] overflow-x-auto overflow-y-hidden px-4 pb-3">
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
                    onSelect={() => void onPreview(version)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
