import { AppWindow, FolderClosed, X } from 'lucide-react'
import { translate } from '@/lib/i18n'
import { Input } from '@/components/ui/input'
import { normalizeAiFolderSize } from '@/lib/aiOrganize'
import type { AiOrganizeSnapshot } from '@/lib/aiOrganizeSessions'
import type { DesktopIcon } from '@/types'
import type { FolderSize } from '@/components/icon-grid/model'
import { DESKTOP_FOLDER_SURFACE_CLASS } from '@/components/icon-grid/views/folderVisualPolicy'
import {
  formatSessionTime,
  type AiOrganizePhase,
  type EditableAiGroup,
} from './aiOrganizePanelModel'

interface AiOrganizeSnapshotPreviewProps {
  snapshot: AiOrganizeSnapshot
  snapshotIndex: number
  activeSnapshotId: string | null
  editingSnapshotId: string | null
  groups: EditableAiGroup[]
  phase: AiOrganizePhase
  iconByKey: Map<string, DesktopIcon>
  resolveIconName: (key: string) => string
  onPreviewSnapshot: (snapshot: AiOrganizeSnapshot) => void
  onInsertEditCommand: (snapshot: AiOrganizeSnapshot) => void | Promise<void>
  onExitEditSnapshot: (snapshotId: string) => void
  onRenameGroup: (groupId: string, name: string) => void
  onDropGroup: (groupId: string) => void
  onRemoveIcon: (groupId: string, key: string) => void
}

const FOLDER_GRID_PREVIEW: Record<
  FolderSize,
  { cols: number; rows: number; visible: number; width: number; height: number; iconSize: number }
> = {
  '1x1': { cols: 2, rows: 2, visible: 4, width: 44, height: 44, iconSize: 15 },
  '1x2': { cols: 1, rows: 3, visible: 3, width: 36, height: 56, iconSize: 13 },
  '2x1': { cols: 3, rows: 1, visible: 3, width: 56, height: 36, iconSize: 13 },
  '2x2': { cols: 3, rows: 3, visible: 9, width: 56, height: 56, iconSize: 13 },
}

interface AiFolderGridPreviewProps {
  group: EditableAiGroup
  iconByKey: Map<string, DesktopIcon>
}

function AiFolderGridPreview({ group, iconByKey }: AiFolderGridPreviewProps) {
  const layout = FOLDER_GRID_PREVIEW[group.folderSize]
  const previewKeys = group.iconKeys.slice(0, layout.visible)
  const overflowCount = Math.max(0, group.iconKeys.length - previewKeys.length)

  return (
    <div className="flex w-16 shrink-0 flex-col items-center gap-1" title={translate('文件夹预览')}>
      <div
        className={`${DESKTOP_FOLDER_SURFACE_CLASS} grid shrink-0 place-items-center rounded-xl p-1.5`}
        style={{
          width: `${layout.width}px`,
          height: `${layout.height}px`,
          gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))`,
          gap: '3px',
        }}
        aria-hidden="true"
      >
        {previewKeys.map(key => {
          const icon = iconByKey.get(key)
          return icon?.icon_base64 ? (
            <img
              key={key}
              src={icon.icon_base64}
              alt=""
              className="h-full w-full min-w-0 object-contain"
              style={{ maxWidth: `${layout.iconSize}px`, maxHeight: `${layout.iconSize}px` }}
            />
          ) : (
            <AppWindow
              key={key}
              className="h-full w-full text-foreground/45"
              style={{ maxWidth: `${layout.iconSize}px`, maxHeight: `${layout.iconSize}px` }}
            />
          )
        })}
      </div>
      <span className="text-[10px] leading-3 text-muted-foreground">
        {group.folderSize}
        {overflowCount > 0 ? ` +${overflowCount}` : ''}
      </span>
    </div>
  )
}

// 整理结果在对话里的呈现：分组列表即正文，版本/时间/操作收进底部一行。
export function AiOrganizeSnapshotPreview({
  snapshot,
  snapshotIndex,
  activeSnapshotId,
  editingSnapshotId,
  groups,
  phase,
  iconByKey,
  resolveIconName,
  onPreviewSnapshot,
  onInsertEditCommand,
  onExitEditSnapshot,
  onRenameGroup,
  onDropGroup,
  onRemoveIcon,
}: AiOrganizeSnapshotPreviewProps) {
  const isActiveSnapshot = snapshot.id === activeSnapshotId
  const previewGroups: EditableAiGroup[] = isActiveSnapshot
    ? groups
    : snapshot.groups.map((group, index) => ({
        id: `snapshot-${snapshot.id}-${index}`,
        folderName: group.folder_name,
        iconKeys: group.icon_keys,
        folderSize: normalizeAiFolderSize(group.folder_size, group.icon_keys.length),
      }))
  const previewDisabled = phase === 'loading' || phase === 'applying'
  const isEditingSnapshot = isActiveSnapshot && editingSnapshotId === snapshot.id
  const canEdit = isEditingSnapshot && !previewDisabled

  if (previewGroups.length === 0) {
    return (
      <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
        {translate('这次没有生成可用分组。')}
      </p>
    )
  }

  const groupedIconKeys = new Set(previewGroups.flatMap(group => group.iconKeys))
  const groupedIconCount = groupedIconKeys.size
  const ungroupedIconCount = Array.from(iconByKey.keys()).filter(
    key => !groupedIconKeys.has(key)
  ).length
  const applicableGroupCount = previewGroups.filter(group => group.iconKeys.length >= 2).length

  return (
    <div className="mt-2 w-full">
      <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border/50 pb-2 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">{translate('布局预览')}</span>
        <span>{translate('{count} 个分组', { count: applicableGroupCount })}</span>
        <span>{translate('{count} 个图标', { count: groupedIconCount })}</span>
        {ungroupedIconCount > 0 ? (
          <span>{translate('未整理 {count} 个图标', { count: ungroupedIconCount })}</span>
        ) : null}
      </div>

      <div className="space-y-3.5">
        {previewGroups.map(group => (
          <div
            key={group.id}
            className="min-w-0 border-t border-border/55 pt-3 first:border-t-0 first:pt-0"
          >
            <div className="flex min-w-0 gap-3">
              <AiFolderGridPreview group={group} iconByKey={iconByKey} />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <FolderClosed className="accent-foreground h-3.5 w-3.5 shrink-0" />
                  {canEdit ? (
                    <Input
                      value={group.folderName}
                      onChange={event => onRenameGroup(group.id, event.target.value)}
                      maxLength={64}
                      className="h-7 min-w-0 flex-1"
                      aria-label={translate('分组名称')}
                    />
                  ) : (
                    <span
                      className="min-w-0 truncate text-[13px] font-medium text-foreground"
                      title={group.folderName}
                    >
                      {group.folderName}
                    </span>
                  )}
                  <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                    {translate('{count} 个图标', { count: group.iconKeys.length })}
                  </span>
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => onDropGroup(group.id)}
                      className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-300"
                    >
                      {translate('解散')}
                    </button>
                  ) : null}
                </div>
                <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-1">
                  {group.iconKeys.map(key => {
                    const icon = iconByKey.get(key)
                    return (
                      <span
                        key={key}
                        title={resolveIconName(key)}
                        className="inline-flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-foreground/85 transition-colors hover:bg-accent"
                      >
                        {icon?.icon_base64 ? (
                          <img
                            src={icon.icon_base64}
                            alt=""
                            className="h-4 w-4 shrink-0 object-contain"
                          />
                        ) : (
                          <AppWindow className="h-4 w-4 shrink-0 text-foreground/45" />
                        )}
                        <span className="min-w-0 truncate">{resolveIconName(key)}</span>
                        {canEdit ? (
                          <button
                            type="button"
                            aria-label={translate('移出分组')}
                            onClick={() => onRemoveIcon(group.id, key)}
                            className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/70 transition-colors hover:bg-red-500/15 hover:text-red-600 dark:hover:text-red-300"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        ) : null}
                      </span>
                    )
                  })}
                </div>
                {group.iconKeys.length < 2 ? (
                  <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-300">
                    {translate('不足 2 个图标，应用时会被忽略。')}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="min-w-0 truncate">
          {translate('第 {index} 版', { index: snapshotIndex + 1 })} ·{' '}
          {formatSessionTime(snapshot.createdAt)}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {!isActiveSnapshot ? (
            <>
              <button
                type="button"
                onClick={() => onPreviewSnapshot(snapshot)}
                disabled={previewDisabled}
                className="rounded px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {translate('预览此版')}
              </button>
              <button
                type="button"
                onClick={() => void onInsertEditCommand(snapshot)}
                disabled={previewDisabled}
                title={translate('将此布局加入修改上下文')}
                className="accent-tonal rounded px-1.5 py-0.5 transition-colors hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {translate('修改布局')}
              </button>
            </>
          ) : isEditingSnapshot ? (
            <>
              <span className="accent-foreground rounded bg-primary/10 px-1.5 py-0.5">
                {translate('修改中')}
              </span>
              <button
                type="button"
                onClick={() => onExitEditSnapshot(snapshot.id)}
                disabled={previewDisabled}
                className="rounded px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {translate('退出修改')}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void onInsertEditCommand(snapshot)}
              disabled={previewDisabled}
              title={translate('将此布局加入修改上下文')}
              className="accent-tonal rounded px-1.5 py-0.5 transition-colors hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {translate('修改布局')}
            </button>
          )}
        </span>
      </div>
    </div>
  )
}
