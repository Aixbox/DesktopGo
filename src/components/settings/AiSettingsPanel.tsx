import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { translate, useI18n } from '@/lib/i18n'
import {
  AI_COMPATIBLE_PROTOCOLS,
  AI_PROVIDERS,
  AI_REASONING_EFFORTS,
  DEFAULT_AI_CONFIG,
  getDefaultAiBaseUrl,
  isAiConfigReady,
  loadAiConfig,
  saveAiConfig,
  type AiConfig,
} from '@/lib/aiConfigStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { SettingCard } from '@/components/ui/setting-components'
import { useToast } from '@/components/ui/toast'
import { ShieldCheck } from 'lucide-react'

export function AiSettingsPanel() {
  useI18n()
  const toast = useToast()
  const [config, setConfig] = useState<AiConfig>(DEFAULT_AI_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const saved = await loadAiConfig()
        setConfig(saved)
      } catch (e) {
        console.error('Failed to load AI config:', e)
        toast.error(translate('加载 AI 配置失败：{error}', { error: String(e) }), {
          key: 'settings-ai',
          title: translate('AI 助手'),
        })
      } finally {
        setLoading(false)
      }
    })()
  }, [toast])

  const updateField = <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => {
    setConfig(current => ({ ...current, [key]: value }))
  }

  const updateProvider = (provider: AiConfig['provider']) => {
    setConfig(current => ({
      ...current,
      provider,
      baseUrl:
        current.baseUrl.trim() === getDefaultAiBaseUrl(current.provider)
          ? getDefaultAiBaseUrl(provider)
          : current.baseUrl,
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const next: AiConfig = {
        ...config,
        baseUrl: config.baseUrl.trim(),
        model: config.model.trim(),
        apiKey: config.apiKey.trim(),
        enabled: isAiConfigReady(config),
      }
      await saveAiConfig(next)
      setConfig(next)
      toast.success(translate('AI 配置已保存。'), {
        key: 'settings-ai',
        title: translate('AI 助手'),
      })
    } catch (e) {
      toast.error(translate('保存 AI 配置失败：{error}', { error: String(e) }), {
        key: 'settings-ai',
        title: translate('AI 助手'),
      })
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (!isAiConfigReady(config)) {
      toast.error(translate('请先填写接口地址、API Key 和模型名称。'), {
        key: 'settings-ai',
        title: translate('AI 助手'),
      })
      return
    }
    setTesting(true)
    try {
      await invoke('ai_chat', {
        config: {
          provider: config.provider,
          base_url: config.baseUrl.trim(),
          api_key: config.apiKey.trim(),
          model: config.model.trim(),
          custom_prompt: config.customPrompt,
          compatible_protocol: config.compatibleProtocol,
          reasoning_effort: config.reasoningEffort,
        },
        messages: [{ role: 'user', content: '请简短回复：连接成功' }],
      })
      toast.success(translate('连接成功，AI 配置可用。'), {
        key: 'settings-ai',
        title: translate('AI 助手'),
      })
    } catch (e) {
      toast.error(translate('连接失败：{error}', { error: String(e) }), {
        key: 'settings-ai',
        title: translate('AI 助手'),
      })
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">{translate('加载中...')}</p>
  }

  return (
    <div className="space-y-6">
      <div className="max-w-3xl space-y-2">
        <h2 className="text-lg font-semibold">{translate('AI 助手')}</h2>
        <p className="text-sm text-muted-foreground">
          {translate(
            '配置 OpenAI 或 Anthropic Claude；OpenAI 的 Base URL 支持官方服务或兼容网关，之后可在启动台右键菜单使用「AI 智能整理」，让 AI 按用途把图标归类到文件夹。'
          )}
        </p>
      </div>

      <SettingCard
        label={translate('模型接入配置')}
        desc={translate(
          'OpenAI 的 Base URL 可填写官方服务或兼容网关，协议按网关能力选择 Responses API 或 Chat Completions；Anthropic Claude 使用 Messages 流式接口。'
        )}
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground/80">{translate('服务商')}</label>
            <Select
              value={config.provider}
              onValueChange={value => updateProvider(value as AiConfig['provider'])}
              options={AI_PROVIDERS.map(value => ({
                value,
                label: translate(value === 'openai' ? 'OpenAI' : 'Anthropic Claude'),
              }))}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground/80">
              {translate('接口地址（Base URL）')}
            </label>
            <Input
              value={config.baseUrl}
              onChange={e => updateField('baseUrl', e.target.value)}
              placeholder={
                config.provider === 'anthropic'
                  ? 'https://api.anthropic.com'
                  : 'https://api.openai.com/v1'
              }
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground/80">{translate('API Key')}</label>
            <Input
              type="password"
              value={config.apiKey}
              onChange={e => updateField('apiKey', e.target.value)}
              placeholder="sk-..."
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
            />
          </div>

          {config.provider === 'openai' ? (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground/80">
                {translate('OpenAI 请求协议')}
              </label>
              <Select
                value={config.compatibleProtocol}
                onValueChange={value =>
                  updateField('compatibleProtocol', value as AiConfig['compatibleProtocol'])
                }
                options={AI_COMPATIBLE_PROTOCOLS.map(value => ({
                  value,
                  label:
                    value === 'responses'
                      ? 'Responses API (Streaming)'
                      : 'Chat Completions (Streaming)',
                }))}
              />
            </div>
          ) : null}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground/80">
              {translate('思考程度')}
            </label>
            <Select
              value={config.reasoningEffort}
              onValueChange={value =>
                updateField('reasoningEffort', value as AiConfig['reasoningEffort'])
              }
              options={AI_REASONING_EFFORTS.map(value => ({
                value,
                label: translate(
                  value === 'none'
                    ? '不启用'
                    : value === 'low'
                      ? '低'
                      : value === 'medium'
                        ? '中'
                        : '高'
                ),
              }))}
            />
            <p className="text-xs leading-5 text-muted-foreground">
              {translate('仅在模型支持思考能力时启用；接口不支持会返回明确错误。')}
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground/80">
              {translate('模型名称')}
            </label>
            <Input
              value={config.model}
              onChange={e => updateField('model', e.target.value)}
              placeholder="gpt-4o-mini"
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground/80">
              {translate('自定义分类提示词（可选）')}
            </label>
            <textarea
              value={config.customPrompt}
              onChange={e => updateField('customPrompt', e.target.value)}
              placeholder={translate('例如：把所有游戏单独归到「游戏」文件夹。')}
              rows={3}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void handleSave()} disabled={saving || testing}>
              {saving ? translate('保存中...') : translate('保存配置')}
            </Button>
            <Button
              variant="outline"
              onClick={() => void handleTest()}
              disabled={saving || testing}
            >
              {testing ? translate('测试中...') : translate('测试连接')}
            </Button>
          </div>
        </div>
      </SettingCard>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/8 p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">{translate('安全提示')}</p>
            <p className="text-xs leading-5 text-muted-foreground">
              {translate(
                'API Key 以明文保存在本地配置文件中，请勿在不信任的设备上填写。整理时仅向模型发送图标名称、目标程序名和类型，不会上传完整文件路径。'
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
