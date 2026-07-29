import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { ImagePlus, LoaderCircle, RotateCcw, Trash2 } from 'lucide-react'
import {
  BackgroundImageError,
  DEFAULT_THEME_ACCENT_COLOR,
  THEME_ACCENT_PRESETS,
  applyAppearance,
  getSavedAppearance,
  normalizeThemeAccentColor,
  prepareLaunchpadBackground,
  type AppearanceSettings,
  type BackgroundImageErrorCode,
} from '@/lib/appearance'
import { getSetting, setSetting } from '@/lib/settingsStore'
import { translate } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { SettingCard, SwitchButton } from '@/components/ui/setting-components'
import { useToast } from '@/components/ui/toast'

const BACKGROUND_ERROR_MESSAGES: Record<BackgroundImageErrorCode, string> = {
  format: '请选择 JPG、PNG 或 WebP 图片。',
  'file-size': '图片不能超过 12 MB。',
  decode: '无法读取这张图片，请选择其他图片。',
  'output-size': '压缩后的图片仍然过大，请选择尺寸更小的图片。',
}

interface AppearanceSettingsCardsProps {
  onAppearanceChange: () => void | Promise<void>
}

export function AppearanceSettingsCards({ onAppearanceChange }: AppearanceSettingsCardsProps) {
  const [appearance, setAppearance] = useState<AppearanceSettings>({
    accentColor: DEFAULT_THEME_ACCENT_COLOR,
    backgroundImage: '',
  })
  const [autoExtractThemeColor, setAutoExtractThemeColor] = useState(true)
  const [isProcessingBackground, setIsProcessingBackground] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const toast = useToast()

  useEffect(() => {
    void Promise.all([getSavedAppearance(), getSetting('autoExtractThemeColor')])
      .then(([savedAppearance, savedAutoExtract]) => {
        setAppearance(savedAppearance)
        setAutoExtractThemeColor(savedAutoExtract)
        applyAppearance(savedAppearance)
      })
      .catch(error => console.error('Failed to load appearance settings:', error))
  }, [])

  const applyLocally = (nextAppearance: AppearanceSettings) => {
    setAppearance(nextAppearance)
    applyAppearance(nextAppearance)
  }

  const syncMainWindow = () => {
    void Promise.resolve(onAppearanceChange()).catch(error => {
      console.error('Failed to sync main window appearance:', error)
    })
  }

  const handleAccentColor = (value: string) => {
    const nextAccent = normalizeThemeAccentColor(value)
    if (!nextAccent || nextAccent === appearance.accentColor) return
    const previousAppearance = appearance
    const nextAppearance = { ...appearance, accentColor: nextAccent }
    applyLocally(nextAppearance)
    void setSetting('themeAccentColor', nextAccent)
      .then(syncMainWindow)
      .catch(error => {
        console.error('Failed to save theme accent color:', error)
        applyLocally(previousAppearance)
        toast.error(translate('保存主题色失败：{error}', { error: String(error) }), {
          key: 'settings-theme-accent',
          title: translate('主题色'),
        })
      })
  }

  const handleResetAccentColor = () => {
    if (!appearance.accentColor) return
    const previousAppearance = appearance
    const nextAppearance = { ...appearance, accentColor: DEFAULT_THEME_ACCENT_COLOR }
    applyLocally(nextAppearance)
    void setSetting('themeAccentColor', DEFAULT_THEME_ACCENT_COLOR)
      .then(syncMainWindow)
      .catch(error => {
        console.error('Failed to reset theme accent color:', error)
        applyLocally(previousAppearance)
        toast.error(translate('保存主题色失败：{error}', { error: String(error) }), {
          key: 'settings-theme-accent',
          title: translate('主题色'),
        })
      })
  }

  const handleAutoExtractChange = (checked: boolean) => {
    const previousValue = autoExtractThemeColor
    setAutoExtractThemeColor(checked)
    void setSetting('autoExtractThemeColor', checked).catch(error => {
      console.error('Failed to save automatic theme color extraction setting:', error)
      setAutoExtractThemeColor(previousValue)
      toast.error(translate('保存设置失败：{error}', { error: String(error) }), {
        key: 'settings-background-auto-accent',
        title: translate('自动提取主题色'),
      })
    })
  }

  const handleBackgroundFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file || isProcessingBackground) return
    setIsProcessingBackground(true)

    try {
      const prepared = await prepareLaunchpadBackground(file)
      const previousAppearance = appearance
      const nextAppearance = {
        backgroundImage: prepared.dataUri,
        accentColor:
          autoExtractThemeColor && prepared.accentColor
            ? prepared.accentColor
            : appearance.accentColor,
      }

      applyLocally(nextAppearance)
      try {
        await Promise.all([
          setSetting('launchpadBackgroundImage', nextAppearance.backgroundImage),
          setSetting('themeAccentColor', nextAppearance.accentColor),
        ])
        syncMainWindow()
        toast.success(
          translate(
            autoExtractThemeColor && prepared.accentColor
              ? '背景已更新，并已应用从图片提取的主题色。'
              : '背景已更新。'
          ),
          { key: 'settings-background', title: translate('自定义背景') }
        )
      } catch (error) {
        applyLocally(previousAppearance)
        const rollbackResults = await Promise.allSettled([
          setSetting('launchpadBackgroundImage', previousAppearance.backgroundImage),
          setSetting('themeAccentColor', previousAppearance.accentColor),
        ])
        if (rollbackResults.some(result => result.status === 'rejected')) {
          console.error('Failed to fully rollback appearance settings:', rollbackResults)
        }
        throw error
      }
    } catch (error) {
      console.error('Failed to update launchpad background:', error)
      const message =
        error instanceof BackgroundImageError
          ? translate(BACKGROUND_ERROR_MESSAGES[error.code])
          : translate('保存背景失败：{error}', { error: String(error) })
      toast.error(message, {
        key: 'settings-background',
        title: translate('自定义背景'),
      })
    } finally {
      setIsProcessingBackground(false)
    }
  }

  const handleRemoveBackground = () => {
    if (!appearance.backgroundImage) return
    const previousAppearance = appearance
    const nextAppearance = { ...appearance, backgroundImage: '' }
    applyLocally(nextAppearance)
    void setSetting('launchpadBackgroundImage', '')
      .then(syncMainWindow)
      .catch(error => {
        console.error('Failed to remove launchpad background:', error)
        applyLocally(previousAppearance)
        toast.error(translate('保存背景失败：{error}', { error: String(error) }), {
          key: 'settings-background',
          title: translate('自定义背景'),
        })
      })
  }

  return (
    <>
      <SettingCard
        label={translate('主题色')}
        desc={translate('选择用于主要按钮、选中状态和聚焦框的强调色。')}
      >
        <div className="flex flex-wrap items-center gap-2.5">
          {THEME_ACCENT_PRESETS.map(color => (
            <button
              key={color}
              type="button"
              aria-label={translate('使用主题色 {color}', { color })}
              aria-pressed={appearance.accentColor === color}
              title={color}
              onClick={() => handleAccentColor(color)}
              className={cn(
                'size-8 cursor-pointer rounded-md border-2 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                appearance.accentColor === color
                  ? 'border-foreground'
                  : 'border-transparent hover:border-foreground/30'
              )}
              style={{ backgroundColor: color }}
            />
          ))}
          <label
            className="relative size-8 cursor-pointer overflow-hidden rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
            title={translate('选择自定义主题色')}
          >
            <span
              className="absolute inset-1 rounded-sm"
              style={{ backgroundColor: appearance.accentColor || '#71717a' }}
            />
            <input
              type="color"
              aria-label={translate('选择自定义主题色')}
              value={appearance.accentColor || '#2563eb'}
              onChange={event => handleAccentColor(event.currentTarget.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!appearance.accentColor}
            onClick={handleResetAccentColor}
          >
            <RotateCcw />
            {translate('恢复默认')}
          </Button>
        </div>
      </SettingCard>

      <SettingCard
        label={translate('自定义背景')}
        desc={translate('选择 JPG、PNG 或 WebP 图片，应用会压缩后保存在本机。')}
      >
        <div
          className="aspect-video w-full max-w-sm overflow-hidden rounded-md border border-border/80 bg-muted"
          style={
            appearance.backgroundImage
              ? {
                  backgroundImage: `linear-gradient(rgba(20, 24, 32, 0.18), rgba(20, 24, 32, 0.18)), url("${appearance.backgroundImage}")`,
                  backgroundPosition: 'center',
                  backgroundSize: 'cover',
                }
              : undefined
          }
        >
          {!appearance.backgroundImage ? (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              {translate('当前使用默认背景')}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={event => void handleBackgroundFile(event)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isProcessingBackground}
            onClick={() => fileInputRef.current?.click()}
          >
            {isProcessingBackground ? <LoaderCircle className="animate-spin" /> : <ImagePlus />}
            {translate(isProcessingBackground ? '处理中...' : '选择图片')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!appearance.backgroundImage || isProcessingBackground}
            onClick={handleRemoveBackground}
          >
            <Trash2 />
            {translate('移除背景')}
          </Button>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-border/70 pt-3">
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-medium text-foreground">{translate('自动提取主题色')}</p>
            <p className="text-xs leading-5 text-muted-foreground">
              {translate('选择新背景时，从图片中提取合适的强调色并立即应用。')}
            </p>
          </div>
          <SwitchButton
            checked={autoExtractThemeColor}
            onChange={handleAutoExtractChange}
            disabled={isProcessingBackground}
          />
        </div>
      </SettingCard>
    </>
  )
}
