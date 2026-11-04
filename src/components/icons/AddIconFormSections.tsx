import type { ReactNode } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  FolderOpen,
  Globe2,
  ImagePlus,
  Images,
  Pencil,
  RefreshCw,
  Type,
  Upload,
} from 'lucide-react'
import { translate } from '@/lib/i18n'
import { resolveIconColor, type IconColorId } from '@/lib/iconColors'
import { getIconBackgroundStyle } from '@/lib/iconBackground'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { AddIconKind, IconChoice } from './addIconDialogState'
import { IconColorPicker } from './IconColorPicker'
import { TextIconColorPicker } from './TextIconColorPicker'
import { IconPreviewButton } from './IconPreviewButton'
import type { TextIconColor } from '@/lib/textIconColor'

export type IconCropEditorTarget =
  | { kind: 'target'; source: string }
  | { kind: 'custom'; source: string }
  | { kind: 'text'; source: string }
  | { kind: 'website'; source: string; index: number }

export function AddIconFormRow({
  label,
  labelFor,
  children,
}: {
  label: string
  labelFor?: string
  children: ReactNode
}) {
  const labelClassName = 'block text-xs font-medium leading-5 text-foreground'

  return (
    <div className="grid min-w-0 gap-2 sm:contents">
      <div
        className={cn('min-w-0 sm:pt-2', !label && 'hidden sm:block')}
        aria-hidden={label ? undefined : true}
      >
        {labelFor ? (
          <label htmlFor={labelFor} className={labelClassName}>
            {label}
          </label>
        ) : (
          <span className={labelClassName}>{label}</span>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

type AddIconAppearanceFieldsProps = {
  iconTextInputId: string
  entryKind: AddIconKind
  currentIconPreview: string
  resolveArtworkSource: (preview: string) => string
  websitePreviews: string[]
  websitePreview: string
  selectedIconSource: IconChoice
  automaticPreview: string
  automaticPreviewLoading: boolean
  automaticPreviewLabel: string
  iconColor: IconColorId
  iconText: string
  iconTextColor: TextIconColor
  textIconPreview: string
  customIconPath: string
  customPreview: string
  customPreviewLoading: boolean
  disabled: boolean
  onColorChange: (colorId: IconColorId) => void
  onTextChange: (text: string) => void
  onTextColorChange: (color: TextIconColor) => void
  onIconSourceChange: (source: IconChoice) => void
  onOpenCropEditor: (target: IconCropEditorTarget) => void
  onPickCustomIcon: () => void
}

export function AddIconAppearanceFields({
  iconTextInputId,
  entryKind,
  currentIconPreview,
  resolveArtworkSource,
  websitePreviews,
  websitePreview,
  selectedIconSource,
  automaticPreview,
  automaticPreviewLoading,
  automaticPreviewLabel,
  iconColor,
  iconText,
  iconTextColor,
  textIconPreview,
  customIconPath,
  customPreview,
  customPreviewLoading,
  disabled,
  onColorChange,
  onTextChange,
  onTextColorChange,
  onIconSourceChange,
  onOpenCropEditor,
  onPickCustomIcon,
}: AddIconAppearanceFieldsProps) {
  const selectedColorPreset = resolveIconColor(iconColor)
  const extractionSource =
    selectedIconSource === 'current'
      ? currentIconPreview
      : selectedIconSource === 'text'
        ? textIconPreview
        : selectedIconSource === 'custom'
          ? customPreviewLoading
            ? ''
            : customPreview
          : automaticPreviewLoading
            ? ''
            : automaticPreview

  return (
    <>
      <AddIconFormRow label={translate('图标颜色')}>
        <IconColorPicker
          value={iconColor}
          onChange={onColorChange}
          disabled={disabled}
          extractionSource={resolveArtworkSource(extractionSource)}
          selectionKey={selectedIconSource}
        />
      </AddIconFormRow>

      <AddIconFormRow label={translate('图标文字')} labelFor={iconTextInputId}>
        <div className="min-w-0 space-y-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <Input
              id={iconTextInputId}
              value={iconText}
              onChange={event => onTextChange(event.target.value)}
              placeholder={translate('输入最多六个字符')}
              disabled={disabled}
              className="min-w-0 flex-1"
            />
            <TextIconColorPicker
              value={iconTextColor}
              onChange={onTextColorChange}
              disabled={disabled}
            />
          </div>
          <span className="block text-xs leading-5 text-muted-foreground">
            {translate('最多使用六个字符生成图标，内容较长时会自动缩小并保持单行。')}
          </span>
        </div>
      </AddIconFormRow>

      <AddIconFormRow label="">
        <div className="space-y-3">
          <div className="flex flex-wrap items-start gap-x-[20px] gap-y-3">
            {currentIconPreview ? (
              <div className="flex w-16 shrink-0 flex-col items-center gap-1.5">
                <IconPreviewButton
                  aria-pressed={selectedIconSource === 'current'}
                  aria-label={translate('使用当前图标')}
                  onClick={() => onIconSourceChange('current')}
                  disabled={disabled}
                  surfaceClassName={cn(
                    selectedIconSource === 'current'
                      ? 'border-ring/45 ring-2 ring-ring/45'
                      : 'border-border group-hover/icon-preview:border-foreground/30'
                  )}
                >
                  <img
                    src={currentIconPreview}
                    alt={translate('当前图标')}
                    draggable={false}
                    className="h-full w-full object-contain"
                  />
                  {selectedIconSource === 'current' ? (
                    <CheckCircle2 className="absolute right-1 top-1 h-4 w-4 fill-primary text-primary-foreground" />
                  ) : null}
                </IconPreviewButton>
                <span className="whitespace-nowrap text-center text-[11px] leading-4 text-muted-foreground">
                  {translate('当前图标')}
                </span>
              </div>
            ) : null}
            {entryKind === 'website' && websitePreviews.length > 0
              ? websitePreviews.map((preview, index) => {
                  const selected = selectedIconSource === 'target' && websitePreview === preview
                  const candidateLabel = `${automaticPreviewLabel} ${index + 1}`
                  return (
                    <div
                      key={`${index}-${preview.slice(-32)}`}
                      className="flex w-16 shrink-0 flex-col items-center gap-1.5"
                    >
                      <div className="relative h-16 w-16">
                        <IconPreviewButton
                          aria-pressed={selected}
                          aria-label={translate('编辑 {name}', { name: candidateLabel })}
                          title={translate('裁剪图标')}
                          onClick={() =>
                            onOpenCropEditor({ kind: 'website', source: preview, index })
                          }
                          disabled={disabled}
                          surfaceClassName={cn(
                            selected
                              ? 'border-ring/45 ring-2 ring-ring/45'
                              : 'border-border group-hover/icon-preview:border-foreground/30'
                          )}
                          surfaceStyle={
                            iconColor !== 'none'
                              ? getIconBackgroundStyle(selectedColorPreset.color)
                              : undefined
                          }
                        >
                          <img
                            src={resolveArtworkSource(preview) || preview}
                            alt=""
                            draggable={false}
                            className="h-full w-full object-contain"
                          />
                          {selected ? (
                            <CheckCircle2 className="absolute right-1 top-1 z-10 h-4 w-4 fill-primary text-primary-foreground" />
                          ) : null}
                          <span className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[inherit] bg-black/60 text-white opacity-0 transition-opacity duration-150 group-focus-visible/icon-preview:opacity-100 group-hover/icon-preview:opacity-100">
                            <Pencil className="h-4 w-4" />
                          </span>
                        </IconPreviewButton>
                      </div>
                      <span className="whitespace-nowrap text-center text-[11px] leading-4 text-muted-foreground">
                        {candidateLabel}
                      </span>
                    </div>
                  )
                })
              : null}

            {entryKind !== 'website' || websitePreviews.length === 0 ? (
              <div className="flex w-16 shrink-0 flex-col items-center gap-1.5">
                <div className="relative h-16 w-16">
                  <IconPreviewButton
                    aria-pressed={selectedIconSource === 'target'}
                    aria-label={
                      automaticPreview
                        ? translate('编辑 {name}', { name: automaticPreviewLabel })
                        : automaticPreviewLabel
                    }
                    title={automaticPreview ? translate('裁剪图标') : undefined}
                    onClick={() => {
                      if (automaticPreview && !automaticPreviewLoading) {
                        onOpenCropEditor({ kind: 'target', source: automaticPreview })
                        return
                      }
                      onIconSourceChange('target')
                    }}
                    disabled={disabled}
                    surfaceClassName={cn(
                      selectedIconSource === 'target'
                        ? 'border-ring/45 ring-2 ring-ring/45'
                        : 'border-border group-hover/icon-preview:border-foreground/30'
                    )}
                    surfaceStyle={
                      iconColor !== 'none'
                        ? getIconBackgroundStyle(selectedColorPreset.color)
                        : undefined
                    }
                  >
                    {automaticPreviewLoading ? (
                      <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : automaticPreview ? (
                      <img
                        src={resolveArtworkSource(automaticPreview) || automaticPreview}
                        alt={automaticPreviewLabel}
                        className="h-full w-full object-contain"
                      />
                    ) : entryKind === 'website' ? (
                      <Globe2 className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <Images className="h-5 w-5 text-muted-foreground" />
                    )}
                    {selectedIconSource === 'target' ? (
                      <CheckCircle2 className="absolute right-1 top-1 h-4 w-4 fill-primary text-primary-foreground" />
                    ) : null}
                    {automaticPreview && !automaticPreviewLoading ? (
                      <span className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[inherit] bg-black/60 text-white opacity-0 transition-opacity duration-150 group-focus-visible/icon-preview:opacity-100 group-hover/icon-preview:opacity-100">
                        <Pencil className="h-4 w-4" />
                      </span>
                    ) : null}
                  </IconPreviewButton>
                </div>
                <span className="whitespace-nowrap text-center text-[11px] leading-4 text-muted-foreground">
                  {automaticPreviewLabel}
                </span>
              </div>
            ) : null}

            <div className="flex w-16 shrink-0 flex-col items-center gap-1.5">
              <div className="relative h-16 w-16">
                <IconPreviewButton
                  aria-pressed={selectedIconSource === 'text'}
                  surfaceStyle={
                    iconColor !== 'none'
                      ? getIconBackgroundStyle(selectedColorPreset.color)
                      : undefined
                  }
                  aria-label={translate('编辑 {name}', { name: translate('文字图标') })}
                  title={translate('裁剪图标')}
                  onClick={() => {
                    if (textIconPreview) {
                      onOpenCropEditor({ kind: 'text', source: textIconPreview })
                      return
                    }
                    onIconSourceChange('text')
                  }}
                  disabled={disabled}
                  surfaceClassName={cn(
                    selectedIconSource === 'text'
                      ? 'border-ring/45 ring-2 ring-ring/45'
                      : 'border-border group-hover/icon-preview:border-foreground/30'
                  )}
                >
                  {textIconPreview ? (
                    <img
                      src={resolveArtworkSource(textIconPreview) || textIconPreview}
                      alt={translate('文字图标')}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <Type className="h-5 w-5 text-muted-foreground" />
                  )}
                  {selectedIconSource === 'text' && textIconPreview ? (
                    <CheckCircle2 className="absolute right-1 top-1 h-4 w-4 fill-primary text-primary-foreground" />
                  ) : null}
                  {textIconPreview ? (
                    <span className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[inherit] bg-black/60 text-white opacity-0 transition-opacity duration-150 group-focus-visible/icon-preview:opacity-100 group-hover/icon-preview:opacity-100">
                      <Pencil className="h-4 w-4" />
                    </span>
                  ) : null}
                </IconPreviewButton>
              </div>
              <span className="whitespace-nowrap text-center text-[11px] leading-4 text-muted-foreground">
                {translate('文字图标')}
              </span>
            </div>

            <div className="flex w-16 shrink-0 flex-col items-center gap-1.5">
              {customIconPath ? (
                <div className="relative h-16 w-16">
                  <IconPreviewButton
                    aria-pressed={selectedIconSource === 'custom'}
                    aria-label={translate('编辑 {name}', { name: translate('自定义图标') })}
                    title={translate('裁剪图标')}
                    onClick={() => {
                      if (customPreview) {
                        onOpenCropEditor({ kind: 'custom', source: customPreview })
                      }
                    }}
                    disabled={disabled || !customPreview}
                    surfaceClassName={cn(
                      selectedIconSource === 'custom'
                        ? 'border-ring/45 ring-2 ring-ring/45'
                        : 'border-border group-hover/icon-preview:border-foreground/30'
                    )}
                    surfaceStyle={
                      iconColor !== 'none'
                        ? getIconBackgroundStyle(selectedColorPreset.color)
                        : undefined
                    }
                  >
                    {customPreviewLoading ? (
                      <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : customPreview ? (
                      <img
                        src={resolveArtworkSource(customPreview) || customPreview}
                        alt={translate('自定义图标')}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <CircleAlert className="h-5 w-5 text-amber-500" />
                    )}
                    {selectedIconSource === 'custom' && customPreview ? (
                      <CheckCircle2 className="absolute right-1 top-1 h-4 w-4 fill-primary text-primary-foreground" />
                    ) : null}
                    {customPreview && !customPreviewLoading ? (
                      <span className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[inherit] bg-black/60 text-white opacity-0 transition-opacity duration-150 group-focus-visible/icon-preview:opacity-100 group-hover/icon-preview:opacity-100">
                        <Pencil className="h-4 w-4" />
                      </span>
                    ) : null}
                  </IconPreviewButton>
                </div>
              ) : (
                <IconPreviewButton
                  aria-label={translate('添加自定义图标')}
                  onClick={onPickCustomIcon}
                  disabled={disabled}
                  surfaceClassName={cn(
                    'border-dashed border-border bg-muted/15 text-muted-foreground group-hover/icon-preview:border-foreground/35 group-hover/icon-preview:bg-muted/35 group-hover/icon-preview:text-foreground'
                  )}
                >
                  <ImagePlus className="h-5 w-5" />
                </IconPreviewButton>
              )}
              <span className="whitespace-nowrap text-center text-[11px] leading-4 text-muted-foreground">
                {customIconPath ? translate('自定义图标') : translate('添加图标')}
              </span>
            </div>
          </div>

          {customIconPath && !customPreviewLoading && !customPreview ? (
            <p className="flex items-center gap-1.5 text-xs leading-5 text-amber-600 dark:text-amber-400">
              <CircleAlert className="h-3.5 w-3.5 shrink-0" />
              {translate('未能从自定义文件提取图标，请重新选择。')}
            </p>
          ) : null}
        </div>
      </AddIconFormRow>
    </>
  )
}

type AddIconMetadataFieldsProps = {
  entryKind: AddIconKind
  nameInputId: string
  name: string
  effectiveName: string
  advancedOpen: boolean
  launchArguments: string
  workingDirectory: string
  disabled: boolean
  onNameChange: (name: string) => void
  onToggleAdvanced: () => void
  onLaunchArgumentsChange: (value: string) => void
  onWorkingDirectoryChange: (value: string) => void
  onPickWorkingDirectory: () => void
}

export function AddIconMetadataFields({
  entryKind,
  nameInputId,
  name,
  effectiveName,
  advancedOpen,
  launchArguments,
  workingDirectory,
  disabled,
  onNameChange,
  onToggleAdvanced,
  onLaunchArgumentsChange,
  onWorkingDirectoryChange,
  onPickWorkingDirectory,
}: AddIconMetadataFieldsProps) {
  return (
    <>
      <AddIconFormRow label={translate('显示名称')} labelFor={nameInputId}>
        <div className="min-w-0">
          <Input
            id={nameInputId}
            value={name}
            onChange={event => onNameChange(event.target.value)}
            maxLength={64}
            placeholder={
              effectiveName
                ? translate('留空则使用：{name}', { name: effectiveName })
                : translate('选择目标后自动生成')
            }
            disabled={disabled}
          />
        </div>
      </AddIconFormRow>

      {entryKind === 'app' ? (
        <AddIconFormRow label={translate('高级启动选项')}>
          <div
            className={cn(
              'overflow-hidden rounded-xl border transition-[border-color,background-color,box-shadow] duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none',
              advancedOpen
                ? 'border-border bg-muted/20 shadow-sm'
                : 'border-border/70 bg-muted/10 hover:border-border hover:bg-muted/20'
            )}
          >
            <button
              type="button"
              aria-expanded={advancedOpen}
              onClick={onToggleAdvanced}
              disabled={disabled}
              className="flex h-9 w-full min-w-0 items-center justify-between gap-3 px-3 text-left text-xs font-medium text-foreground disabled:opacity-50"
            >
              <span>{translate(advancedOpen ? '收起选项' : '展开选项')}</span>
              <ChevronDown
                className={cn(
                  'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none',
                  advancedOpen && 'rotate-180'
                )}
              />
            </button>

            <div
              className={cn(
                'grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none',
                advancedOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
              )}
            >
              <div
                className="min-h-0 overflow-hidden"
                aria-hidden={!advancedOpen}
                inert={!advancedOpen}
              >
                <div className="grid gap-3 border-t border-border/60 p-3 lg:grid-cols-2">
                  <label className="min-w-0 space-y-1.5">
                    <span className="text-xs font-medium text-foreground">
                      {translate('启动参数')}
                    </span>
                    <Input
                      value={launchArguments}
                      onChange={event => onLaunchArgumentsChange(event.target.value)}
                      placeholder={translate('例如：--profile work --new-window')}
                      disabled={disabled}
                    />
                    <span className="block text-xs leading-5 text-muted-foreground">
                      {translate('参数会原样写入快捷方式，不会修改目标路径。')}
                    </span>
                  </label>

                  <label className="min-w-0 space-y-1.5">
                    <span className="text-xs font-medium text-foreground">
                      {translate('工作目录')}
                    </span>
                    <div className="flex min-w-0 flex-wrap gap-2">
                      <Input
                        value={workingDirectory}
                        onChange={event => onWorkingDirectoryChange(event.target.value)}
                        placeholder={translate('留空则使用目标文件所在目录')}
                        disabled={disabled}
                        className="min-w-0 flex-[1_1_14rem]"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={onPickWorkingDirectory}
                        disabled={disabled}
                        className="min-w-0 flex-[1_1_8rem] sm:flex-none"
                      >
                        <FolderOpen className="h-4 w-4" />
                        {translate('选择目录')}
                      </Button>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </AddIconFormRow>
      ) : null}
    </>
  )
}

type AddIconFormActionsProps = {
  submitting: boolean
  editing: boolean
  submitDisabled: boolean
  onCancel: () => void
}

export function AddIconFormActions({
  submitting,
  editing,
  submitDisabled,
  onCancel,
}: AddIconFormActionsProps) {
  return (
    <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border/80 bg-muted/20 px-4 py-3 sm:px-5">
      <Button
        type="button"
        variant="outline"
        onClick={onCancel}
        disabled={submitting}
        className="min-w-0 flex-1 sm:flex-none"
      >
        {translate('取消')}
      </Button>
      <Button
        type="submit"
        disabled={submitDisabled || submitting}
        className="min-w-0 flex-1 sm:flex-none"
      >
        {submitting ? (
          <RefreshCw className="h-4 w-4 animate-spin" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
        {submitting
          ? editing
            ? translate('正在保存...')
            : translate('正在添加...')
          : editing
            ? translate('保存修改')
            : translate('确认添加')}
      </Button>
    </div>
  )
}
