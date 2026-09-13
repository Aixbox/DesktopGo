import { invoke } from '@tauri-apps/api/core'
import { translate } from '@/lib/i18n'
import { useToast } from '@/components/ui/toast'
import type { IconManagerItem, IconMutationTarget } from '@/types'

interface UseIconManagerBulkActionsOptions {
  filteredIcons: IconManagerItem[]
  selectedIconIdSet: Set<string>
  busy: boolean
  setMutating: (value: boolean) => void
  refreshIconManagerList: () => Promise<void>
  notifyMainWindow: () => Promise<void>
}

/** 图标库批量隐藏/显示/删除：目标取自当前筛选下勾选的项，隐藏/显示支持整体撤销。 */
export function useIconManagerBulkActions({
  filteredIcons,
  selectedIconIdSet,
  busy,
  setMutating,
  refreshIconManagerList,
  notifyMainWindow,
}: UseIconManagerBulkActionsOptions) {
  const toast = useToast()

  const undoBulkVisibilityMutation = async (prior: Array<{ id: string; hidden: boolean }>) => {
    if (prior.length === 0) return
    setMutating(true)
    try {
      // 撤销按每项勾选前的可见状态还原：混选时分组回滚。
      const toHide = prior.filter(item => item.hidden).map(item => ({ id: item.id }))
      const toShow = prior.filter(item => !item.hidden).map(item => ({ id: item.id }))
      if (toHide.length > 0) await invoke('hide_icons', { targets: toHide })
      if (toShow.length > 0) await invoke('unhide_icons', { targets: toShow })
      await refreshIconManagerList()
      await notifyMainWindow()
      toast.success(translate('操作已撤销。'), {
        key: 'icon-library-action',
        title: translate('图标库'),
      })
    } catch (error) {
      console.error('Failed to undo bulk icon visibility change:', error)
      toast.error(translate('撤销失败，请刷新图标库后重试。'), {
        key: 'icon-library-action',
        title: translate('图标库'),
      })
    } finally {
      setMutating(false)
    }
  }

  const handleBulkMutation = async (type: 'hide' | 'unhide' | 'delete') => {
    if (busy) return
    const targets: IconMutationTarget[] = filteredIcons
      .filter(icon => selectedIconIdSet.has(icon.id))
      .map(icon => ({ id: icon.id }))
    if (targets.length === 0) return

    if (type === 'delete') {
      const confirmed = window.confirm(
        translate('确定将选中的 {count} 项移出图标库吗？不会删除原始程序、文件或文件夹。', {
          count: targets.length,
        })
      )
      if (!confirmed) return
    }

    setMutating(true)
    try {
      const command =
        type === 'unhide' ? 'unhide_icons' : type === 'delete' ? 'delete_icons' : 'hide_icons'
      const affected = await invoke<number>(command, { targets })
      const actionLabel = type === 'unhide' ? '显示' : type === 'delete' ? '删除' : '隐藏'
      // 记录勾选项操作前的可见状态，供 toast 撤销（仅隐藏/显示）。
      const priorStates = filteredIcons
        .filter(icon => selectedIconIdSet.has(icon.id))
        .map(icon => ({ id: icon.id, hidden: icon.hidden }))
      const visibilityUndo = type === 'delete' ? null : priorStates
      await refreshIconManagerList()
      await notifyMainWindow()
      toast.success(
        translate('{action}完成，影响 {count} 项。', {
          action: translate(actionLabel),
          count: affected,
        }),
        {
          key: 'icon-library-action',
          title: translate('图标库'),
          duration: visibilityUndo ? 8000 : undefined,
          action: visibilityUndo
            ? {
                label: translate('撤销'),
                onClick: () => void undoBulkVisibilityMutation(visibilityUndo),
              }
            : undefined,
        }
      )
    } catch (e) {
      console.error('Failed to bulk update icon library items:', e)
      toast.error(translate('操作失败，请稍后重试。'), {
        key: 'icon-library-action',
        title: translate('图标库'),
      })
    } finally {
      setMutating(false)
    }
  }

  return { handleBulkMutation }
}
