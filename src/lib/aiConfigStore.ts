import { LazyStore } from '@tauri-apps/plugin-store'

const STORE_PATH = import.meta.env?.DEV ? 'dev/aiConfig.json' : 'aiConfig.json'
const KEY = 'aiConfig'
const store = new LazyStore(STORE_PATH)

export const AI_PROVIDERS = ['openai', 'anthropic'] as const
export type AiProvider = (typeof AI_PROVIDERS)[number]

type LegacyAiProvider = 'openai-compatible'

const DEFAULT_BASE_URLS: Record<AiProvider, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
}

export const getDefaultAiBaseUrl = (provider: AiProvider) => DEFAULT_BASE_URLS[provider]

export const AI_COMPATIBLE_PROTOCOLS = ['responses', 'chat-completions'] as const
export type AiCompatibleProtocol = (typeof AI_COMPATIBLE_PROTOCOLS)[number]

export const AI_REASONING_EFFORTS = ['none', 'low', 'medium', 'high'] as const
export type AiReasoningEffort = (typeof AI_REASONING_EFFORTS)[number]

export interface AiConfig {
  provider: AiProvider
  baseUrl: string
  apiKey: string
  model: string
  customPrompt: string
  compatibleProtocol: AiCompatibleProtocol
  reasoningEffort: AiReasoningEffort
  enabled: boolean
  /** 最近使用过的模型名，供整理面板输入框快速切换。 */
  modelOptions: string[]
}

const MAX_MODEL_OPTIONS = 8

export const DEFAULT_AI_CONFIG: AiConfig = {
  provider: 'openai',
  baseUrl: getDefaultAiBaseUrl('openai'),
  apiKey: '',
  model: 'gpt-4o-mini',
  customPrompt: '',
  compatibleProtocol: 'responses',
  reasoningEffort: 'none',
  enabled: false,
  modelOptions: [],
}

const asString = (value: unknown, fallback: string): string =>
  typeof value === 'string' ? value : fallback

const asBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback

const asOption = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
  typeof value === 'string' && options.includes(value as T) ? (value as T) : fallback

const asModelOptions = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') continue
    const model = item.trim()
    if (model) seen.add(model)
    if (seen.size >= MAX_MODEL_OPTIONS) break
  }
  return [...seen]
}

export function normalizeAiConfig(raw: unknown): AiConfig {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_AI_CONFIG }
  }
  const source = raw as Record<string, unknown>
  const rawProvider = source.provider as AiProvider | LegacyAiProvider | undefined
  const provider =
    rawProvider === 'openai-compatible'
      ? 'openai'
      : asOption(rawProvider, AI_PROVIDERS, DEFAULT_AI_CONFIG.provider)
  return {
    provider,
    baseUrl: asString(source.baseUrl, DEFAULT_AI_CONFIG.baseUrl),
    apiKey: asString(source.apiKey, DEFAULT_AI_CONFIG.apiKey),
    model: asString(source.model, DEFAULT_AI_CONFIG.model),
    customPrompt: asString(source.customPrompt, DEFAULT_AI_CONFIG.customPrompt),
    compatibleProtocol: asOption(
      source.compatibleProtocol,
      AI_COMPATIBLE_PROTOCOLS,
      DEFAULT_AI_CONFIG.compatibleProtocol
    ),
    reasoningEffort: asOption(
      source.reasoningEffort,
      AI_REASONING_EFFORTS,
      DEFAULT_AI_CONFIG.reasoningEffort
    ),
    enabled: asBoolean(source.enabled, DEFAULT_AI_CONFIG.enabled),
    modelOptions: asModelOptions(source.modelOptions),
  }
}

export async function loadAiConfig(): Promise<AiConfig> {
  try {
    const raw = await store.get<unknown>(KEY)
    return normalizeAiConfig(raw)
  } catch {
    return { ...DEFAULT_AI_CONFIG }
  }
}

export async function saveAiConfig(config: unknown): Promise<void> {
  const normalized = normalizeAiConfig(config)
  // 把当前模型记入可切换列表，输入框里才能在历史模型间来回切换。
  if (normalized.model && !normalized.modelOptions.includes(normalized.model)) {
    normalized.modelOptions = [normalized.model, ...normalized.modelOptions].slice(
      0,
      MAX_MODEL_OPTIONS
    )
  }
  await store.set(KEY, normalized)
  await store.save()
}

/**
 * 返回输入框模型切换菜单的可选项：历史模型 + 当前模型去重。
 */
export function getAiModelOptions(config: AiConfig): string[] {
  const model = config.model.trim()
  if (!model || config.modelOptions.includes(model)) return config.modelOptions
  return [model, ...config.modelOptions].slice(0, MAX_MODEL_OPTIONS)
}

/**
 * 判断当前配置是否足以发起请求（基础地址 + 模型 + 密钥齐全）。
 */
export function isAiConfigReady(config: AiConfig): boolean {
  return (
    config.baseUrl.trim().length > 0 &&
    config.model.trim().length > 0 &&
    config.apiKey.trim().length > 0
  )
}
