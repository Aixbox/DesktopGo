import { useEffect, useState } from 'react'
import { SEARCH_FILTERS } from '@/lib/search/filters'
import {
  DEFAULT_SEARCH_SETTINGS,
  loadSearchSettings,
  saveSearchSetting,
  type SearchDefaultFilter,
  type SearchSettings,
} from '@/lib/search/settings'
import { SEARCH_SORT_OPTIONS } from '@/lib/search/sorts'
import type { SearchSort } from '@/lib/search/types'
import { Button } from '@/components/ui/button'
import { SettingCard, ToggleRow } from '@/components/ui/setting-components'

const fieldClassName =
  'rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500'

export function SearchSettingsPanel() {
  const [settings, setSettings] = useState<SearchSettings>(DEFAULT_SEARCH_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [statusText, setStatusText] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const next = await loadSearchSettings()
        setSettings(next)
      } catch (error) {
        setStatusText(`加载搜索设置失败：${String(error)}`)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const updateSetting = async <K extends keyof SearchSettings>(
    key: K,
    value: SearchSettings[K]
  ) => {
    try {
      const normalized = await saveSearchSetting(key, value)
      setSettings(prev => ({ ...prev, [key]: normalized }) as SearchSettings)
      setStatusText('已保存')
    } catch (error) {
      setStatusText(`保存设置失败：${String(error)}`)
    }
  }

  const resetDefaults = async () => {
    setStatusText('正在恢复默认设置...')
    for (const [key, value] of Object.entries(DEFAULT_SEARCH_SETTINGS) as Array<
      [keyof SearchSettings, SearchSettings[keyof SearchSettings]]
    >) {
      // eslint-disable-next-line no-await-in-loop
      await updateSetting(key, value)
    }
    setStatusText('默认设置已恢复')
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">正在加载搜索设置...</p>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">搜索设置</h2>
          <p className="text-sm text-muted-foreground">
            设置会保存到 SQLite，并在下次搜索时生效。
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void resetDefaults()}
        >
          恢复默认
        </Button>
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">基础交互</h3>
        <ToggleRow
          title="实时搜索"
          description="输入时立即搜索。关闭后仅在按下 Enter 时触发搜索。"
          checked={settings.liveOnType}
          onChange={next => void updateSetting('liveOnType', next)}
        />
        <ToggleRow
          title="自动选中首个结果"
          description="返回新结果页时，自动聚焦到第一个结果。"
          checked={settings.autoSelectFirst}
          onChange={next => void updateSetting('autoSelectFirst', next)}
        />
        <ToggleRow
          title="回车打开结果"
          description="允许按 Enter 打开当前选中的结果。"
          checked={settings.openOnEnter}
          onChange={next => void updateSetting('openOnEnter', next)}
        />
        <ToggleRow
          title="双击打开结果"
          description="允许通过鼠标双击打开结果项。"
          checked={settings.openOnDoubleClick}
          onChange={next => void updateSetting('openOnDoubleClick', next)}
        />

        <SettingCard label="防抖时间" desc="允许范围：50 - 500 毫秒。">
          <input
            type="number"
            min={50}
            max={500}
            value={settings.debounceMs}
            onChange={event => void updateSetting('debounceMs', Number(event.target.value))}
            className={`w-32 ${fieldClassName}`}
          />
        </SettingCard>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">搜索策略</h3>
        <SettingCard label="默认筛选器">
          <select
            value={settings.defaultFilter}
            onChange={event =>
              void updateSetting('defaultFilter', event.target.value as SearchDefaultFilter)
            }
            className={`w-full max-w-xs ${fieldClassName}`}
          >
            {SEARCH_FILTERS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </SettingCard>

        <SettingCard label="默认排序">
          <select
            value={settings.sortBy}
            onChange={event => void updateSetting('sortBy', event.target.value as SearchSort)}
            className={`w-full max-w-sm ${fieldClassName}`}
          >
            {SEARCH_SORT_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </SettingCard>

        <SettingCard label="每页最大结果数" desc="允许范围：10 - 200。">
          <input
            type="number"
            min={10}
            max={200}
            value={settings.maxResultsPerPage}
            onChange={event => void updateSetting('maxResultsPerPage', Number(event.target.value))}
            className={`w-32 ${fieldClassName}`}
          />
        </SettingCard>

        <ToggleRow
          title="记住上次筛选器"
          description="保存最近一次使用的筛选器，并在下次启动时恢复。"
          checked={settings.rememberLastFilter}
          onChange={next => void updateSetting('rememberLastFilter', next)}
        />
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">匹配与筛选</h3>
        <ToggleRow
          title="匹配路径"
          description="让关键字匹配包含完整路径片段。"
          checked={settings.matchPath}
          onChange={next => void updateSetting('matchPath', next)}
        />
        <ToggleRow
          title="区分大小写"
          description="使用区分大小写的匹配方式。"
          checked={settings.matchCase}
          onChange={next => void updateSetting('matchCase', next)}
        />
        <ToggleRow
          title="正则表达式"
          description="将关键字按正则表达式语法处理。"
          checked={settings.regex}
          onChange={next => void updateSetting('regex', next)}
        />
        <ToggleRow
          title="全字匹配"
          description="只匹配完整单词。"
          checked={settings.matchWholeWord}
          onChange={next => void updateSetting('matchWholeWord', next)}
        />
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">运行时</h3>
        <ToggleRow
          title="自动连接运行时"
          description="自动检测并连接已安装的 Everything 运行时。"
          checked={settings.autoStartRuntime}
          onChange={next => void updateSetting('autoStartRuntime', next)}
        />

        <SettingCard
          label="仅支持已安装的 Everything"
          desc="DesktopGo 的文件搜索目前仅支持已安装的 Everything 应用。"
        >
          <p className="text-sm leading-6 text-muted-foreground">
            如果搜索不可用，请重新安装 DesktopGo，并勾选 Everything 安装选项。
          </p>
        </SettingCard>
      </section>

      {statusText ? <p className="text-xs text-muted-foreground">{statusText}</p> : null}
    </div>
  )
}
