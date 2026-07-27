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
  onPreviewSnapshot: (snapshot: AiOrganizeSnapshot) => void | Promise<void>
  onInsertEditCommand: (snapshot: AiOrganizeSnapshot) => void | Promise<void>
  onExitEditSnapshot: (snapshotId: string) => void
  onRenameGroup: (groupId: string, name: string) => void
  onDropGroup: (groupId: string) => void
  onRemoveIcon: (groupId: string, key: string) => void
}

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

  return (
    <div className="mt-2 w-[min(100%,390px)] rounded-md border border-border/80 bg-background/82 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
          <FolderClosed className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300" />
          <span className="truncate">{translate('布局预览')}</span>
          <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {translate('第 {index} 版', { index: snapshotIndex + 1 })}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">
            {formatSessionTime(snapshot.createdAt)}
          </span>
          {!isActiveSnapshot ? (
            <>
              <button
                type="button"
                onClick={() => void onPreviewSnapshot(snapshot)}
                disabled={previewDisabled}
                className="rounded-md border border-border/75 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {translate('预览此版')}
              </button>
              <button
                type="button"
                onClick={() => void onInsertEditCommand(snapshot)}
                disabled={previewDisabled}
                title={translate('将此布局加入修改上下文')}
                className="rounded-md border border-blue-500/25 bg-blue-500/10 px-2 py-1 text-[11px] text-blue-700 transition-colors hover:bg-blue-500/15 disabled:cursor-not-allowed disabled:opacity-50 dark:text-blue-200"
              >
                {translate('修改布局')}
              </button>
            </>
          ) : isEditingSnapshot ? (
            <>
              <span className="rounded-md bg-blue-500/10 px-2 py-1 text-[11px] text-blue-700 dark:text-blue-200">
                {translate('修改中')}
              </span>
              <button
                type="button"
                onClick={() => onExitEditSnapshot(snapshot.id)}
                disabled={previewDisabled}
                className="rounded-md border border-border/75 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
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
              className="rounded-md border border-blue-500/25 bg-blue-500/10 px-2 py-1 text-[11px] text-blue-700 transition-colors hover:bg-blue-500/15 disabled:cursor-not-allowed disabled:opacity-50 dark:text-blue-200"
            >
              {translate('修改布局')}
            </button>
          )}
        </div>
      </div>

      {previewGroups.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/75 bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground">
          {translate('这次没有生成可用分组。')}
        </div>
      ) : (
        <div className="space-y-2">
          {previewGroups.map(group => (
            <div key={group.id} className="rounded-md border border-border/75 bg-card/70 p-2.5">
              <div className="mb-2 flex items-center gap-2">
                <FolderClosed className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300" />
                {canEdit ? (
                  <Input
                    value={group.folderName}
                    onChange={event => onRenameGroup(group.id, event.target.value)}
                    maxLength={64}
                    className="h-8 min-w-0 flex-1"
                    aria-label={translate('分组名称')}
                  />
                ) : (
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {group.folderName}
                  </span>
                )}
                <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                  {group.folderSize} / {group.iconKeys.length}
                </span>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => onDropGroup(group.id)}
                    className="shrink-0 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-300"
                  >
                    {translate('解散')}
                  </button>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {group.iconKeys.map(key => {
                  const icon = iconByKey.get(key)
                  return (
                    <span
                      key={key}
                      className="group inline-flex min-w-0 items-center gap-1.5 rounded-md border border-border/70 bg-background py-1 pl-1.5 pr-1 text-xs"
                    >
                      {icon?.icon_base64 ? (
                        <img
                          src={icon.icon_base64}
                          alt=""
                          className="h-4 w-4 shrink-0 object-contain"
                        />
                      ) : null}
                      <span className="max-w-[138px] truncate">{resolveIconName(key)}</span>
                      {canEdit ? (
                        <button
                          type="button"
                          aria-label={translate('移出分组')}
                          onClick={() => onRemoveIcon(group.id, key)}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-red-500/15 hover:text-red-600 dark:hover:text-red-300"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </span>
                  )
                })}
              </div>
              {group.iconKeys.length < 2 ? (
                <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-300">
                  {translate('不足 2 个图标，应用时会被忽略。')}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
