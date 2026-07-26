import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SettingCard, SettingGroup, ToggleRow } from '@/components/ui/setting-components'
import { useToast } from '@/components/ui/toast'
import { translate } from '@/lib/i18n'
import { useShortcutUsage } from '@/lib/search/useShortcutUsage'

export function ShortcutUsageSettings() {
  const { state, loading, loadError, reload, setEnabled, clear } = useShortcutUsage()
  const [savingEnabled, setSavingEnabled] = useState(false)
  const [clearing, setClearing] = useState(false)
  const toast = useToast()
  const trackedCount = Object.keys(state.entries).length

  useEffect(() => {
    if (!loadError) return
    toast.error(translate('加载快捷入口使用数据失败，请重试。'), {
      key: 'shortcut-usage-load',
      title: translate('快捷入口排序'),
      duration: 8000,
      action: { label: translate('重试'), onClick: () => void reload() },
    })
  }, [loadError, reload, toast])

  const handleEnabledChange = async (enabled: boolean) => {
    setSavingEnabled(true)
    try {
      await setEnabled(enabled)
      toast.success(translate('快捷入口排序偏好已保存。'), {
        key: 'shortcut-usage-setting',
        title: translate('快捷入口排序'),
        duration: 1800,
      })
    } catch (error) {
      console.error('Failed to save shortcut usage preference:', error)
      toast.error(translate('保存快捷入口排序偏好失败，请重试。'), {
        key: 'shortcut-usage-setting',
        title: translate('快捷入口排序'),
      })
    } finally {
      setSavingEnabled(false)
    }
  }

  const handleClear = async () => {
    setClearing(true)
    try {
      await clear()
      toast.success(translate('快捷入口使用数据已清空。'), {
        key: 'shortcut-usage-clear',
        title: translate('快捷入口排序'),
      })
    } catch (error) {
      console.error('Failed to clear shortcut usage:', error)
      toast.error(translate('清空快捷入口使用数据失败，请重试。'), {
        key: 'shortcut-usage-clear',
        title: translate('快捷入口排序'),
      })
    } finally {
      setClearing(false)
    }
  }

  return (
    <SettingGroup title={translate('快捷入口排序')}>
      <ToggleRow
        title={translate('使用启动记录优化排序')}
        description={translate(
          '记录从搜索结果打开快捷入口的次数和最近启动时间；数据仅保存在本机。'
        )}
        checked={state.enabled}
        onChange={next => void handleEnabledChange(next)}
        disabled={loading || savingEnabled}
      />
      <SettingCard
        label={translate('快捷入口使用数据')}
        desc={translate('关闭后会停止记录并忽略已有数据，重新开启后可以继续使用。')}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {translate('已记录 {count} 个快捷入口。', { count: trackedCount })}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading || clearing || trackedCount === 0}
            onClick={() => void handleClear()}
          >
            <Trash2 />
            {clearing ? translate('清空中...') : translate('清空使用数据')}
          </Button>
        </div>
      </SettingCard>
    </SettingGroup>
  )
}
