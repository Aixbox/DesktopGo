import { FolderClosed, X } from 'lucide-react'
import { translate } from '@/lib/i18n'
import { Input } from '@/components/ui/input'
import { normalizeAiFolderSize } from '@/lib/aiOrganize'
import type { AiOrganizeSnapshot } from '@/lib/aiOrganizeSessions'
import type { DesktopIcon } from '@/types'
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

  return (
    <div className="mt-1.5 w-full">
      <div className="space-y-3">
        {previewGroups.map(group => (
          <div key={group.id} className="min-w-0">
            <div className="flex items-center gap-1.5">
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
                <span className="min-w-0 truncate text-[13px] font-medium text-foreground">
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
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1 gap-y-0.5 pl-5">
              {group.iconKeys.map(key => {
                const icon = iconByKey.get(key)
                return (
                  <span
                    key={key}
                    className="inline-flex min-w-0 items-center gap-1 rounded px-1 py-0.5 text-xs text-foreground/85 transition-colors hover:bg-accent"
                  >
                    {icon?.icon_base64 ? (
                      <img
                        src={icon.icon_base64}
                        alt=""
                        className="h-4 w-4 shrink-0 object-contain"
                      />
                    ) : null}
                    <span className="max-w-[120px] truncate">{resolveIconName(key)}</span>
                    {canEdit ? (
                      <button
                        type="button"
                        aria-label={translate('移出分组')}
                        onClick={() => onRemoveIcon(group.id, key)}
                        className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground/70 transition-colors hover:bg-red-500/15 hover:text-red-600 dark:hover:text-red-300"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    ) : null}
                  </span>
                )
              })}
            </div>
            {group.iconKeys.length < 2 ? (
              <p className="mt-0.5 pl-5 text-[11px] text-amber-600 dark:text-amber-300">
                {translate('不足 2 个图标，应用时会被忽略。')}
              </p>
            ) : null}
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
