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
}

export const DEFAULT_AI_CONFIG: AiConfig = {
  provider: 'openai',
  baseUrl: getDefaultAiBaseUrl('openai'),
  apiKey: '',
  model: 'gpt-4o-mini',
  customPrompt: '',
  compatibleProtocol: 'responses',
  reasoningEffort: 'none',
  enabled: false,
}

const asString = (value: unknown, fallback: string): string =>
  typeof value === 'string' ? value : fallback

const asBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback

const asOption = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
  typeof value === 'string' && options.includes(value as T) ? (value as T) : fallback

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
  await store.set(KEY, normalizeAiConfig(config))
  await store.save()
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
