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

interface ToggleRowProps {
  label: string
  desc: string
  checked: boolean
  onChange: (next: boolean) => void
}

function ToggleRow({ label, desc, checked, onChange }: ToggleRowProps) {
  return (
    <label className="flex items-start justify-between gap-3 rounded-md border border-border bg-secondary/30 px-3 py-2">
      <span className="space-y-0.5">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{desc}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 accent-blue-500"
      />
    </label>
  )
}

export function SearchSettingsPanel() {
  const [settings, setSettings] = useState<SearchSettings>(DEFAULT_SEARCH_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [statusText, setStatusText] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const next = await loadSearchSettings()
        setSettings(next)
      } catch (e) {
        setStatusText(`Failed to load search settings: ${String(e)}`)
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
      setStatusText('Saved')
    } catch (e) {
      setStatusText(`Failed to save ${key}: ${String(e)}`)
    }
  }

  const resetDefaults = async () => {
    setStatusText('Applying defaults...')
    for (const [key, value] of Object.entries(DEFAULT_SEARCH_SETTINGS) as Array<
      [keyof SearchSettings, SearchSettings[keyof SearchSettings]]
    >) {
      // eslint-disable-next-line no-await-in-loop
      await updateSetting(key, value)
    }
    setStatusText('Default settings restored')
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading search settings...</p>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Search Settings</h2>
          <p className="text-sm text-muted-foreground">
            Settings are saved in SQLite and apply to the next query.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void resetDefaults()}
          className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
        >
          Reset Defaults
        </button>
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Basic Interaction</h3>
        <ToggleRow
          label="Live Search"
          desc="Search while typing. Disable to trigger search with Enter only."
          checked={settings.liveOnType}
          onChange={next => void updateSetting('liveOnType', next)}
        />
        <ToggleRow
          label="Auto Select First Result"
          desc="Automatically focus the first result when a new page is returned."
          checked={settings.autoSelectFirst}
          onChange={next => void updateSetting('autoSelectFirst', next)}
        />
        <ToggleRow
          label="Open On Enter"
          desc="Allow Enter to launch the currently selected result."
          checked={settings.openOnEnter}
          onChange={next => void updateSetting('openOnEnter', next)}
        />
        <ToggleRow
          label="Open On Double Click"
          desc="Allow opening result items with mouse double click."
          checked={settings.openOnDoubleClick}
          onChange={next => void updateSetting('openOnDoubleClick', next)}
        />

        <div className="rounded-md border border-border bg-secondary/30 px-3 py-2">
          <label className="block text-sm font-medium">Debounce (ms)</label>
          <p className="mb-2 text-xs text-muted-foreground">Allowed range: 50 - 500</p>
          <input
            type="number"
            min={50}
            max={500}
            value={settings.debounceMs}
            onChange={e => void updateSetting('debounceMs', Number(e.target.value))}
            className="w-28 rounded-md border border-border bg-background px-2 py-1 text-sm"
          />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Search Strategy</h3>
        <div className="rounded-md border border-border bg-secondary/30 px-3 py-2">
          <label className="block text-sm font-medium">Default Filter</label>
          <select
            value={settings.defaultFilter}
            onChange={e =>
              void updateSetting('defaultFilter', e.target.value as SearchDefaultFilter)
            }
            className="mt-2 rounded-md border border-border bg-background px-2 py-1 text-sm"
          >
            {SEARCH_FILTERS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-md border border-border bg-secondary/30 px-3 py-2">
          <label className="block text-sm font-medium">Sort</label>
          <select
            value={settings.sortBy}
            onChange={e => void updateSetting('sortBy', e.target.value as SearchSort)}
            className="mt-2 rounded-md border border-border bg-background px-2 py-1 text-sm"
          >
            {SEARCH_SORT_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-md border border-border bg-secondary/30 px-3 py-2">
          <label className="block text-sm font-medium">Max Results Per Page</label>
          <p className="mb-2 text-xs text-muted-foreground">Allowed range: 10 - 200</p>
          <input
            type="number"
            min={10}
            max={200}
            value={settings.maxResultsPerPage}
            onChange={e => void updateSetting('maxResultsPerPage', Number(e.target.value))}
            className="w-28 rounded-md border border-border bg-background px-2 py-1 text-sm"
          />
        </div>

        <ToggleRow
          label="Remember Last Filter"
          desc="Persist the latest filter selection for the next launch."
          checked={settings.rememberLastFilter}
          onChange={next => void updateSetting('rememberLastFilter', next)}
        />
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Matchers And Filters</h3>
        <ToggleRow
          label="Match Path"
          desc="Let keyword matching include full path segments."
          checked={settings.matchPath}
          onChange={next => void updateSetting('matchPath', next)}
        />
        <ToggleRow
          label="Match Case"
          desc="Use case-sensitive matching."
          checked={settings.matchCase}
          onChange={next => void updateSetting('matchCase', next)}
        />
        <ToggleRow
          label="Regex"
          desc="Treat keyword as regular expression syntax."
          checked={settings.regex}
          onChange={next => void updateSetting('regex', next)}
        />
        <ToggleRow
          label="Whole Word"
          desc="Match only whole words."
          checked={settings.matchWholeWord}
          onChange={next => void updateSetting('matchWholeWord', next)}
        />
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Runtime</h3>
        <ToggleRow
          label="Auto Start Runtime"
          desc="Automatically detect and connect to the installed Everything runtime."
          checked={settings.autoStartRuntime}
          onChange={next => void updateSetting('autoStartRuntime', next)}
        />
        <div className="rounded-md border border-border bg-secondary/30 px-3 py-2">
          <label className="block text-sm font-medium">Installed Everything Only</label>
          <p className="text-xs text-muted-foreground">
            DesktopGo search only works with the installed Everything application. If search is
            unavailable, reinstall DesktopGo and select the Everything install option.
          </p>
        </div>
      </section>

      {statusText ? <p className="text-xs text-muted-foreground">{statusText}</p> : null}
    </div>
  )
}
