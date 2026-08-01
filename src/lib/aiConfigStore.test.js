import assert from 'node:assert/strict'
import test from 'node:test'

import {
  AI_COMPATIBLE_PROTOCOLS,
  AI_PROVIDERS,
  DEFAULT_AI_CONFIG,
  normalizeAiConfig,
} from './aiConfigStore.ts'

test('normalizes the legacy OpenAI-compatible provider to canonical OpenAI', () => {
  const legacy = {
    ...DEFAULT_AI_CONFIG,
    provider: 'openai-compatible',
    compatibleProtocol: 'chat-completions',
  }

  const normalized = normalizeAiConfig(legacy)

  assert.equal(normalized.provider, 'openai')
  assert.equal(normalized.compatibleProtocol, 'chat-completions')
  assert.deepEqual(normalized, { ...legacy, provider: 'openai' })
})

test('keeps canonical providers and defaults invalid values', () => {
  assert.deepEqual(AI_PROVIDERS, ['openai', 'anthropic'])
  assert.deepEqual(AI_COMPATIBLE_PROTOCOLS, ['responses', 'chat-completions'])

  const normalized = normalizeAiConfig({
    ...DEFAULT_AI_CONFIG,
    provider: 'unknown-provider',
    compatibleProtocol: 'invalid-protocol',
  })

  assert.equal(normalized.provider, DEFAULT_AI_CONFIG.provider)
  assert.equal(normalized.compatibleProtocol, DEFAULT_AI_CONFIG.compatibleProtocol)
})
