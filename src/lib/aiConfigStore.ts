import { LazyStore } from '@tauri-apps/plugin-store'

const STORE_PATH = import.meta.env.DEV ? 'dev/aiConfig.json' : 'aiConfig.json'
const KEY = 'aiConfig'
const store = new LazyStore(STORE_PATH)

export interface AiConfig {
  baseUrl: string
  apiKey: string
  model: string
  customPrompt: string
  enabled: boolean
}

export const DEFAULT_AI_CONFIG: AiConfig = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  customPrompt: '',
  enabled: false,
}

const asString = (value: unknown, fallback: string): string =>
  typeof value === 'string' ? value : fallback

const asBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback

export function normalizeAiConfig(raw: unknown): AiConfig {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_AI_CONFIG }
  }
  const source = raw as Record<string, unknown>
  return {
    baseUrl: asString(source.baseUrl, DEFAULT_AI_CONFIG.baseUrl),
    apiKey: asString(source.apiKey, DEFAULT_AI_CONFIG.apiKey),
    model: asString(source.model, DEFAULT_AI_CONFIG.model),
    customPrompt: asString(source.customPrompt, DEFAULT_AI_CONFIG.customPrompt),
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

export async function saveAiConfig(config: AiConfig): Promise<void> {
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
