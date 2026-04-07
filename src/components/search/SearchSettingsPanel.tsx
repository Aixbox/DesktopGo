import { useEffect, useState } from 'react'
import { getSearchFilterOptions } from '@/lib/search/filters'
import { useMemo } from 'react'
import {
  DEFAULT_SEARCH_SETTINGS,
  loadSearchSettings,
  saveSearchSetting,
  type SearchDefaultFilter,
  type SearchSettings,
} from '@/lib/search/settings'
import { getSearchSortOptions } from '@/lib/search/sorts'
import type { SearchSort } from '@/lib/search/types'
import { Button } from '@/components/ui/button'
import { NumberInput } from '@/components/ui/number-input'
import { Select } from '@/components/ui/select'
import { SettingCard, ToggleRow } from '@/components/ui/setting-components'
import { useToast } from '@/components/ui/toast'
import { translate, useI18n } from '@/lib/i18n'

export function SearchSettingsPanel() {
  const { language } = useI18n()
  const [settings, setSettings] = useState<SearchSettings>(DEFAULT_SEARCH_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [resetting, setResetting] = useState(false)
  const toast = useToast()
  const filterOptions = useMemo(() => getSearchFilterOptions(), [language])
  const sortOptions = useMemo(() => getSearchSortOptions(), [language])

  useEffect(() => {
    void (async () => {
      try {
        const next = await loadSearchSettings()
        setSettings(next)
      } catch (error) {
        toast.error(translate('加载搜索设置失败：{error}', { error: String(error) }), {
          key: 'search-settings',
          title: translate('搜索设置'),
        })
      } finally {
        setLoading(false)
      }
    })()
  }, [toast])

  const persistSetting = async <K extends keyof SearchSettings>(
    key: K,
    value: SearchSettings[K]
  ): Promise<SearchSettings[K]> => {
    const normalized = await saveSearchSetting(key, value)
    setSettings(prev => ({ ...prev, [key]: normalized }) as SearchSettings)
    return normalized
  }

  const updateSetting = async <K extends keyof SearchSettings>(
    key: K,
    value: SearchSettings[K]
  ) => {
    try {
      await persistSetting(key, value)
      toast.success(translate('搜索设置已保存。'), {
        key: 'search-settings',
        title: translate('搜索设置'),
        duration: 1800,
      })
    } catch (error) {
      toast.error(translate('保存设置失败：{error}', { error: String(error) }), {
        key: 'search-settings',
        title: translate('搜索设置'),
      })
    }
  }

  const resetDefaults = async () => {
    if (resetting) {
      return
    }

    setResetting(true)
    try {
      for (const [key, value] of Object.entries(DEFAULT_SEARCH_SETTINGS) as Array<
        [keyof SearchSettings, SearchSettings[keyof SearchSettings]]
      >) {
        // eslint-disable-next-line no-await-in-loop
        await persistSetting(key, value)
      }
      toast.success(translate('默认设置已恢复。'), {
        key: 'search-settings',
        title: translate('搜索设置'),
      })
    } catch (error) {
      toast.error(translate('恢复默认设置失败：{error}', { error: String(error) }), {
        key: 'search-settings',
        title: translate('搜索设置'),
      })
    } finally {
      setResetting(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">{translate('正在加载搜索设置...')}</p>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{translate('搜索设置')}</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {translate('设置会保存到 SQLite，并在下次搜索时生效。')}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void resetDefaults()}
          disabled={resetting}
        >
          {resetting ? translate('恢复中...') : translate('恢复默认')}
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
        <div className="space-y-6">
          <section className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">
              {translate('基础交互')}
            </h3>
            <ToggleRow
              title={translate('实时搜索')}
              description={translate('输入时立即搜索。关闭后仅在按下 Enter 时触发搜索。')}
              checked={settings.liveOnType}
              onChange={next => void updateSetting('liveOnType', next)}
            />
            <ToggleRow
              title={translate('自动选中首个结果')}
              description={translate('返回新结果页时，自动聚焦到第一个结果。')}
              checked={settings.autoSelectFirst}
              onChange={next => void updateSetting('autoSelectFirst', next)}
            />
            <ToggleRow
              title={translate('回车打开结果')}
              description={translate('允许按 Enter 打开当前选中的结果。')}
              checked={settings.openOnEnter}
              onChange={next => void updateSetting('openOnEnter', next)}
            />
            <ToggleRow
              title={translate('双击打开结果')}
              description={translate('允许通过鼠标双击打开结果项。')}
              checked={settings.openOnDoubleClick}
              onChange={next => void updateSetting('openOnDoubleClick', next)}
            />

            <SettingCard
              label={translate('防抖时间')}
              desc={translate('允许范围：50 - 500 毫秒。')}
            >
              <NumberInput
                min={50}
                max={500}
                value={settings.debounceMs}
                onValueChange={value => void updateSetting('debounceMs', value)}
                aria-label={translate('防抖时间')}
                className="w-32"
              />
            </SettingCard>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">
              {translate('搜索策略')}
            </h3>
            <SettingCard label={translate('默认筛选器')}>
              <Select
                value={settings.defaultFilter}
                onValueChange={nextValue =>
                  void updateSetting('defaultFilter', nextValue as SearchDefaultFilter)
                }
                options={filterOptions}
                className="w-full max-w-xs"
              />
            </SettingCard>

            <SettingCard label={translate('默认排序')}>
              <Select
                value={settings.sortBy}
                onValueChange={nextValue => void updateSetting('sortBy', nextValue as SearchSort)}
                options={sortOptions}
                className="w-full max-w-sm"
              />
            </SettingCard>

            <SettingCard
              label={translate('每页最大结果数')}
              desc={translate('允许范围：10 - 200。')}
            >
              <NumberInput
                min={10}
                max={200}
                value={settings.maxResultsPerPage}
                onValueChange={value => void updateSetting('maxResultsPerPage', value)}
                aria-label={translate('每页最大结果数')}
                className="w-32"
              />
            </SettingCard>

            <ToggleRow
              title={translate('记住上次筛选器')}
              description={translate('保存最近一次使用的筛选器，并在下次启动时恢复。')}
              checked={settings.rememberLastFilter}
              onChange={next => void updateSetting('rememberLastFilter', next)}
            />
          </section>
        </div>

        <div className="space-y-6">
          <section className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">
              {translate('匹配与筛选')}
            </h3>
            <ToggleRow
              title={translate('匹配路径')}
              description={translate('让关键字匹配包含完整路径片段。')}
              checked={settings.matchPath}
              onChange={next => void updateSetting('matchPath', next)}
            />
            <ToggleRow
              title={translate('区分大小写')}
              description={translate('使用区分大小写的匹配方式。')}
              checked={settings.matchCase}
              onChange={next => void updateSetting('matchCase', next)}
            />
            <ToggleRow
              title={translate('正则表达式')}
              description={translate('将关键字按正则表达式语法处理。')}
              checked={settings.regex}
              onChange={next => void updateSetting('regex', next)}
            />
            <ToggleRow
              title={translate('全字匹配')}
              description={translate('只匹配完整单词。')}
              checked={settings.matchWholeWord}
              onChange={next => void updateSetting('matchWholeWord', next)}
            />
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">
              {translate('运行时')}
            </h3>
            <ToggleRow
              title={translate('自动连接运行时')}
              description={translate('自动检测并连接已安装的 Everything 运行时。')}
              checked={settings.autoStartRuntime}
              onChange={next => void updateSetting('autoStartRuntime', next)}
            />

            <SettingCard
              label={translate('仅支持已安装的 Everything')}
              desc={translate('DesktopGo 的文件搜索目前仅支持已安装的 Everything 应用。')}
            >
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                {translate('如果搜索不可用，请重新安装 DesktopGo，并勾选 Everything 安装选项。')}
              </p>
            </SettingCard>
          </section>
        </div>
      </div>
    </div>
  )
}
