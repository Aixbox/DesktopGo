import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '@/components/ui/toast'
import { translate } from '@/lib/i18n'
import { loadAiConfig, saveAiConfig, type AiConfig } from '@/lib/aiConfigStore'

// 加载 AI 配置供输入框展示；切换模型/思考等级时合并补丁并持久化，下一次请求即生效。
export function useAiOrganizeConfig(open: boolean) {
  const toast = useToast()
  const [aiConfig, setAiConfig] = useState<AiConfig | null>(null)
  const aiConfigRef = useRef<AiConfig | null>(null)

  useEffect(() => {
    if (!open) return
    let active = true
    void loadAiConfig()
      .then(config => {
        if (!active) return
        aiConfigRef.current = config
        setAiConfig(config)
      })
      .catch(() => {})
    return () => {
      active = false
      aiConfigRef.current = null
      setAiConfig(null)
    }
  }, [open])

  const updateAiConfig = useCallback(
    async (patch: Partial<AiConfig>) => {
      const current = aiConfigRef.current ?? (await loadAiConfig())
      const next: AiConfig = { ...current, ...patch }
      aiConfigRef.current = next
      setAiConfig(next)
      try {
        await saveAiConfig(next)
      } catch (error) {
        toast.error(translate('保存 AI 配置失败：{error}', { error: String(error) }), {
          key: 'ai-organize-config',
          title: translate('AI 智能整理'),
        })
      }
    },
    [toast]
  )

  return { aiConfig, updateAiConfig }
}
