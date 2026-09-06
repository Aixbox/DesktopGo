import { ChatTool } from '@/components/chat/ChatTool'
import { translate } from '@/lib/i18n'
import type { AiOrganizeSnapshot } from '@/lib/aiOrganizeSessions'
import type { DesktopIcon } from '@/types'
import { AiOrganizeSnapshotPreview } from './AiOrganizeSnapshotPreview'
import type { AiOrganizePhase, EditableAiGroup } from './aiOrganizePanelModel'

interface AiOrganizeMessagePreviewProps {
  /** 参与折叠态重置的 key：激活版本变化时重新挂载以更新默认展开。 */
  messageKey: string
  snapshot: AiOrganizeSnapshot
  snapshotIndex: number
  isActive: boolean
  isLatestMessage: boolean
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

/** 会话回复里的整理结果卡片：ChatTool 折叠头 + 版本预览内容。 */
export function AiOrganizeMessagePreview({
  messageKey,
  snapshot,
  snapshotIndex,
  isActive,
  isLatestMessage,
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
}: AiOrganizeMessagePreviewProps) {
  const iconCount = snapshot.groups.reduce((total, group) => total + group.icon_keys.length, 0)

  return (
    <ChatTool
      key={`${messageKey}-tool-${isActive ? 'active' : 'idle'}`}
      title={translate('已生成布局预览')}
      meta={
        snapshot.groups.length > 0
          ? translate('{count} 个分组 · {icons} 个图标', {
              count: snapshot.groups.length,
              icons: iconCount,
            })
          : undefined
      }
      defaultExpanded={isActive || isLatestMessage}
    >
      <AiOrganizeSnapshotPreview
        snapshot={snapshot}
        snapshotIndex={snapshotIndex}
        activeSnapshotId={activeSnapshotId}
        editingSnapshotId={editingSnapshotId}
        groups={groups}
        phase={phase}
        iconByKey={iconByKey}
        resolveIconName={resolveIconName}
        onPreviewSnapshot={onPreviewSnapshot}
        onInsertEditCommand={onInsertEditCommand}
        onExitEditSnapshot={onExitEditSnapshot}
        onRenameGroup={onRenameGroup}
        onDropGroup={onDropGroup}
        onRemoveIcon={onRemoveIcon}
      />
    </ChatTool>
  )
}
