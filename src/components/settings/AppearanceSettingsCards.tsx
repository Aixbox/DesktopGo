import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Crop, ImagePlus, LoaderCircle, RotateCcw, Trash2 } from 'lucide-react'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import {
  BACKGROUND_BLUR_MAX,
  BACKGROUND_BLUR_MIN,
  BACKGROUND_MIME_TYPES,
  BACKGROUND_OVERLAY_MAX,
  BACKGROUND_OVERLAY_MIN,
  BackgroundImageError,
  DEFAULT_BACKGROUND_BLUR,
  DEFAULT_BACKGROUND_OVERLAY,
  DEFAULT_THEME_ACCENT_COLOR,
  MAX_BACKGROUND_FILE_BYTES,
  THEME_ACCENT_PRESETS,
  applyAppearance,
  backgroundBlurToPixels,
  clampCropAspect,
  clearBackgroundOriginal,
  getSavedAppearance,
  loadBackgroundOriginal,
  normalizeThemeAccentColor,
  prepareLaunchpadBackgroundFromBlob,
  saveBackgroundOriginal,
  type AppearanceSettings,
  type BackgroundImageErrorCode,
} from '@/lib/appearance'
import { getSetting, setSetting } from '@/lib/settingsStore'
import { translate } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { formControlFocusWithinClassName } from '@/components/ui/inputStyles'
import { RangeControl, SettingCard, SwitchButton } from '@/components/ui/setting-components'
import { useToast } from '@/components/ui/toast'
import { WallpaperGallery } from '@/components/settings/WallpaperGallery'
import { BackgroundCropDialog } from '@/components/settings/BackgroundCropDialog'

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
    backgroundOverlay: DEFAULT_BACKGROUND_OVERLAY,
    backgroundBlur: DEFAULT_BACKGROUND_BLUR,
  })
  const [autoExtractThemeColor, setAutoExtractThemeColor] = useState(true)
  const [isProcessingBackground, setIsProcessingBackground] = useState(false)
  const [backgroundSource, setBackgroundSource] = useState('')
  const [cropSource, setCropSource] = useState('')
  const [cropSourceKind, setCropSourceKind] = useState<'original' | 'compressed'>('original')
  const [cropAspect, setCropAspect] = useState(16 / 9)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const tuningCommitTimerRef = useRef<number | null>(null)
  /** 本次取景所用的原始图片（本地选图/图库 Blob），应用成功后另存供无损重取景。 */
  const cropOriginalRef = useRef<{ blob: Blob; objectUrl: string } | null>(null)
  const toast = useToast()

  useEffect(
    () => () => {
      if (tuningCommitTimerRef.current !== null) {
        window.clearTimeout(tuningCommitTimerRef.current)
      }
    },
    []
  )

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

  /** 编码完成的壁纸统一走这里：本地预览、落盘（含来源标识）、失败回滚。 */
  const commitBackgroundUpdate = async (
    prepared: { dataUri: string; accentColor: string | null },
    source: string
  ) => {
    const previousAppearance = appearance
    const nextAppearance = {
      ...appearance,
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
        setSetting('launchpadBackgroundSource', source),
      ])
      setBackgroundSource(source)
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
        setSetting('launchpadBackgroundSource', backgroundSource),
      ])
      if (rollbackResults.some(result => result.status === 'rejected')) {
        console.error('Failed to fully rollback appearance settings:', rollbackResults)
      }
      throw error
    }
  }

  const reportBackgroundError = (error: unknown) => {
    const message =
      error instanceof BackgroundImageError
        ? translate(BACKGROUND_ERROR_MESSAGES[error.code])
        : translate('保存背景失败：{error}', { error: String(error) })
    toast.error(message, {
      key: 'settings-background',
      title: translate('自定义背景'),
    })
  }

  /** 读取主窗口实际宽高比作为取景比例，取不到时退化为当前窗口。 */
  const resolveCropAspect = async (): Promise<number> => {
    try {
      const mainWindow = await WebviewWindow.getByLabel('main')
      if (mainWindow) {
        const [size, scaleFactor] = await Promise.all([
          mainWindow.innerSize(),
          mainWindow.scaleFactor(),
        ])
        const width = size.width / scaleFactor
        const height = size.height / scaleFactor
        if (width > 0 && height > 0) return clampCropAspect(width / height)
      }
    } catch (error) {
      console.error('Failed to read main window size for background crop:', error)
    }
    return clampCropAspect(window.innerWidth / Math.max(1, window.innerHeight))
  }

  const closeBackgroundCrop = () => {
    if (cropOriginalRef.current) {
      URL.revokeObjectURL(cropOriginalRef.current.objectUrl)
      cropOriginalRef.current = null
    }
    setCropSource('')
  }

  /** 原图备份失败时的可见提醒：静默失败会让用户误以为原图丢了。 */
  const warnOriginalSaveFailure = (error: unknown) => {
    console.error('Failed to save background original:', error)
    toast.error(translate('背景已更新，但原图备份失败：{error}', { error: String(error) }), {
      key: 'settings-background-original',
      title: translate('自定义背景'),
    })
  }

  /** 用新图片进入取景：保留原始 Blob，应用成功后另存为本机原图。 */
  const openBackgroundCropWithBlob = async (blob: Blob) => {
    if (cropOriginalRef.current) URL.revokeObjectURL(cropOriginalRef.current.objectUrl)
    const objectUrl = URL.createObjectURL(blob)
    cropOriginalRef.current = { blob, objectUrl }
    setCropAspect(await resolveCropAspect())
    setCropSourceKind('original')
    setCropSource(objectUrl)
  }

  /** 调整取景：优先使用已保存的本机原图；缺失时退回已压缩背景并存为原图基线（只退化一次）。 */
  const openBackgroundCropForTuning = async () => {
    if (cropOriginalRef.current) {
      URL.revokeObjectURL(cropOriginalRef.current.objectUrl)
      cropOriginalRef.current = null
    }
    setCropAspect(await resolveCropAspect())
    let source = appearance.backgroundImage
    let sourceKind: 'original' | 'compressed' = 'compressed'
    try {
      const original = await loadBackgroundOriginal()
      if (original) {
        source = original
        sourceKind = 'original'
      }
    } catch (error) {
      console.error('Failed to load saved background original:', error)
    }
    if (sourceKind === 'compressed' && source) {
      try {
        const response = await fetch(source)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        await saveBackgroundOriginal(await response.blob())
      } catch (error) {
        console.error('Failed to backfill background original:', error)
      }
    }
    setCropSourceKind(sourceKind)
    setCropSource(source)
  }

  /** 裁剪确认：裁出的原始图统一走压缩管线后落盘；错误向上抛给弹窗展示。 */
  const handleCropApply = async (blob: Blob) => {
    const prepared = await prepareLaunchpadBackgroundFromBlob(blob)
    await commitBackgroundUpdate(prepared, 'custom')
    // 背景落盘成功后再保存原图；保存失败只影响之后能否无损重取景，不回滚背景。
    const original = cropOriginalRef.current
    if (original) {
      try {
        await saveBackgroundOriginal(original.blob)
      } catch (error) {
        warnOriginalSaveFailure(error)
      }
    }
  }

  /** 本地选图：先做类型/大小校验，通过后进入取景裁剪。 */
  const handleBackgroundFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file || isProcessingBackground) return
    if (!BACKGROUND_MIME_TYPES.has(file.type)) {
      reportBackgroundError(new BackgroundImageError('format'))
      return
    }
    if (file.size > MAX_BACKGROUND_FILE_BYTES) {
      reportBackgroundError(new BackgroundImageError('file-size'))
      return
    }
    void openBackgroundCropWithBlob(file)
  }

  /** 壁纸库选择：来源资源由画廊取得，这里统一走压缩管线后落盘。 */
  const handleGalleryPick = async (source: string, blob: Blob) => {
    if (isProcessingBackground) return
    setIsProcessingBackground(true)

    try {
      const prepared = await prepareLaunchpadBackgroundFromBlob(blob)
      await commitBackgroundUpdate(prepared, source)
      // 同步保存下载到的原始图片，之后「调整取景」可基于原图无损重裁。
      try {
        await saveBackgroundOriginal(blob)
      } catch (error) {
        warnOriginalSaveFailure(error)
      }
    } catch (error) {
      console.error('Failed to update launchpad background:', error)
      reportBackgroundError(error)
    } finally {
      setIsProcessingBackground(false)
    }
  }

  const handleRemoveBackground = () => {
    if (!appearance.backgroundImage) return
    const previousAppearance = appearance
    const nextAppearance = { ...appearance, backgroundImage: '' }
    applyLocally(nextAppearance)
    void Promise.all([
      setSetting('launchpadBackgroundImage', ''),
      setSetting('launchpadBackgroundSource', ''),
    ])
      .then(() => {
        setBackgroundSource('')
        void clearBackgroundOriginal().catch(error => {
          console.error('Failed to clear background original:', error)
        })
        syncMainWindow()
      })
      .catch(error => {
        console.error('Failed to remove launchpad background:', error)
        applyLocally(previousAppearance)
        toast.error(translate('保存背景失败：{error}', { error: String(error) }), {
          key: 'settings-background',
          title: translate('自定义背景'),
        })
      })
  }

  // 滑杆会连续触发，本地即时预览、落盘与主窗同步做防抖。
  const scheduleTuningCommit = (next: AppearanceSettings) => {
    if (tuningCommitTimerRef.current !== null) window.clearTimeout(tuningCommitTimerRef.current)
    tuningCommitTimerRef.current = window.setTimeout(() => {
      tuningCommitTimerRef.current = null
      void Promise.all([
        setSetting('launchpadBackgroundOverlay', next.backgroundOverlay),
        setSetting('launchpadBackgroundBlur', next.backgroundBlur),
      ])
        .then(syncMainWindow)
        .catch(error => {
          console.error('Failed to save launchpad background tuning:', error)
          toast.error(translate('保存背景失败：{error}', { error: String(error) }), {
            key: 'settings-background-tuning',
            title: translate('自定义背景'),
          })
        })
    }, 180)
  }

  const handleBackgroundOverlay = (value: number) => {
    const nextAppearance = { ...appearance, backgroundOverlay: value }
    applyLocally(nextAppearance)
    scheduleTuningCommit(nextAppearance)
  }

  const handleBackgroundBlur = (value: number) => {
    const nextAppearance = { ...appearance, backgroundBlur: value }
    applyLocally(nextAppearance)
    scheduleTuningCommit(nextAppearance)
  }

  const handleResetBackgroundTuning = () => {
    const nextAppearance = {
      ...appearance,
      backgroundOverlay: DEFAULT_BACKGROUND_OVERLAY,
      backgroundBlur: DEFAULT_BACKGROUND_BLUR,
    }
    applyLocally(nextAppearance)
    scheduleTuningCommit(nextAppearance)
  }

  // 蒙版与模糊只作用于自定义背景，没有背景图时保留控件但禁用，避免布局跳动。
  const isTuningDisabled = !appearance.backgroundImage || isProcessingBackground
  const previewBlurPixels = backgroundBlurToPixels(appearance.backgroundBlur)

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
                'size-8 cursor-pointer rounded-lg border-2 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                appearance.accentColor === color
                  ? 'border-foreground'
                  : 'border-transparent hover:border-foreground/30'
              )}
              style={{ backgroundColor: color }}
            />
          ))}
          <label
            className={cn(
              'relative size-8 cursor-pointer overflow-hidden rounded-lg border border-input bg-background',
              formControlFocusWithinClassName
            )}
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
        <div className="relative aspect-video w-full max-w-sm overflow-hidden rounded-card border border-border/80 bg-muted">
          {appearance.backgroundImage ? (
            <>
              {/* 垫底层：出血 3 倍预览半径，垫住取景层的 blur 边缘渐隐（同主渲染），
                  由外层 overflow-hidden 裁掉出血部分。 */}
              <div
                className="absolute inset-0"
                style={{
                  inset: `-${(previewBlurPixels / 4) * 3}px`,
                  backgroundImage: `url("${appearance.backgroundImage}")`,
                  backgroundPosition: 'center',
                  backgroundSize: 'cover',
                  filter: `blur(${previewBlurPixels / 4}px)`,
                }}
              />
              {/* 取景层：尺寸不随模糊变化，预览取景与 blur=0 一致。预览宽度远小于
                  启动台，等比缩小模糊半径才能反映真实观感。 */}
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: `url("${appearance.backgroundImage}")`,
                  backgroundPosition: 'center',
                  backgroundSize: 'cover',
                  filter: `blur(${previewBlurPixels / 4}px)`,
                }}
              />
              <div
                className="absolute inset-0"
                style={{
                  backgroundColor: `rgb(var(--launchpad-background-scrim-rgb) / ${
                    appearance.backgroundOverlay / 100
                  })`,
                }}
              />
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              {translate('当前使用默认背景')}
            </div>
          )}
        </div>

        <WallpaperGallery
          disabled={isProcessingBackground}
          selectedSource={backgroundSource}
          onPick={handleGalleryPick}
        />

        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleBackgroundFile}
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
            title={translate('优先基于已保存的原图取景，无损画质；原图缺失时基于已压缩的背景。')}
            onClick={() => void openBackgroundCropForTuning()}
          >
            <Crop />
            {translate('调整取景')}
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

        <div className="space-y-3 border-t border-border/70 pt-3">
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-medium text-foreground">{translate('蒙版浓度')}</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={
                  isTuningDisabled ||
                  (appearance.backgroundOverlay === DEFAULT_BACKGROUND_OVERLAY &&
                    appearance.backgroundBlur === DEFAULT_BACKGROUND_BLUR)
                }
                onClick={handleResetBackgroundTuning}
              >
                <RotateCcw />
                {translate('恢复默认')}
              </Button>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              {translate('压在背景图上的一层底色，调低更清晰，调高图标文字更易读。')}
            </p>
            <RangeControl
              label={translate('蒙版浓度')}
              value={appearance.backgroundOverlay}
              min={BACKGROUND_OVERLAY_MIN}
              max={BACKGROUND_OVERLAY_MAX}
              valueLabel={`${appearance.backgroundOverlay}%`}
              disabled={isTuningDisabled}
              onChange={handleBackgroundOverlay}
            />
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-medium text-foreground">{translate('背景模糊')}</p>
            <p className="text-xs leading-5 text-muted-foreground">
              {translate('只模糊背景图，不影响图标和面板。')}
            </p>
            <RangeControl
              label={translate('背景模糊')}
              value={appearance.backgroundBlur}
              min={BACKGROUND_BLUR_MIN}
              max={BACKGROUND_BLUR_MAX}
              valueLabel={`${appearance.backgroundBlur}%`}
              disabled={isTuningDisabled}
              onChange={handleBackgroundBlur}
            />
          </div>
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

      {cropSource ? (
        <BackgroundCropDialog
          key={cropSource}
          source={cropSource}
          sourceKind={cropSourceKind}
          aspect={cropAspect}
          onApply={handleCropApply}
          onClose={closeBackgroundCrop}
        />
      ) : null}
    </>
  )
}
