import type { SearchHit, SearchPreview } from '@/lib/search/types'
import { getIntlLocale, translate, useI18n } from '@/lib/i18n'

interface SearchPreviewPaneProps {
  item: SearchHit | null
  preview: SearchPreview | null
  loading: boolean
  error: string | null
  stacked?: boolean
}

const formatPreviewSize = (size: number | null) => {
  if (size === null) {
    return translate('文件夹')
  }
  if (size < 1024) {
    return `${size} ${translate('B')}`
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} ${translate('KB')}`
  }
  if (size < 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} ${translate('MB')}`
  }
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} ${translate('GB')}`
}

const formatPreviewDate = (value: number | null) => {
  if (value === null) {
    return translate('不可用')
  }

  try {
    return new Intl.DateTimeFormat(getIntlLocale(), {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(value)
  } catch {
    return translate('不可用')
  }
}

export function SearchPreviewPane({
  item,
  preview,
  loading,
  error,
  stacked = false,
}: SearchPreviewPaneProps) {
  useI18n()

  const shellClassName = stacked
    ? 'flex h-[18rem] flex-col overflow-hidden border-t border-border/60 bg-background/40 dark:bg-background/12'
    : 'flex h-full flex-col overflow-hidden border-l border-border/60 bg-background/40 dark:bg-background/12'

  if (!item) {
    return (
      <div
        className={`${stacked ? 'h-36 border-t border-border/60 bg-background/40 dark:bg-background/12' : 'h-full bg-background/40 dark:bg-background/12'} flex items-center justify-center px-6 text-center text-sm text-muted-foreground`}
      >
        {translate('选择一个结果后，可在这里查看预览。')}
      </div>
    )
  }

  return (
    <div className={shellClassName}>
      <div className="border-b border-border/60 px-4 py-3">
        <div className="truncate text-sm font-medium text-foreground">{item.name || item.path}</div>
        <div className="mt-1 truncate text-xs text-muted-foreground">{item.path}</div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="text-sm text-muted-foreground">{translate('正在加载预览...')}</div>
        ) : error ? (
          <div className="text-sm text-red-700 dark:text-red-300">{error}</div>
        ) : preview?.kind === 'image' && preview.imageDataUrl ? (
          <div className="space-y-4">
            <img
              src={preview.imageDataUrl}
              alt={preview.name}
              className="max-h-72 w-full rounded-lg border border-border/60 bg-background/56 object-contain dark:bg-background/40"
              draggable={false}
            />
            <div className="search-surface-card rounded-lg p-3">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {translate('元数据')}
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 text-sm text-foreground/80">
                <div>{translate('大小：{value}', { value: formatPreviewSize(preview.size) })}</div>
                <div>
                  {translate('修改时间：{value}', { value: formatPreviewDate(preview.modifiedAt) })}
                </div>
                <div>
                  {translate('类型：{value}', {
                    value: preview.mimeType || preview.extension || translate('未知'),
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : preview?.kind === 'text' ? (
          <div className="space-y-4">
            <div className="search-surface-card rounded-lg p-3">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {translate('文本预览')}
              </div>
              <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-foreground/80">
                {preview.textSnippet || translate('没有可用的文本预览。')}
              </pre>
              {preview.textTruncated ? (
                <div className="mt-3 text-[11px] text-muted-foreground">
                  {translate('为保证加载速度，预览内容已截断。')}
                </div>
              ) : null}
            </div>
            <div className="search-surface-card rounded-lg p-3">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {translate('元数据')}
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 text-sm text-foreground/80">
                <div>{translate('大小：{value}', { value: formatPreviewSize(preview.size) })}</div>
                <div>
                  {translate('修改时间：{value}', { value: formatPreviewDate(preview.modifiedAt) })}
                </div>
                <div>
                  {translate('类型：{value}', {
                    value: preview.mimeType || preview.extension || translate('未知'),
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="search-surface-card rounded-lg p-3">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {translate('元数据')}
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 text-sm text-foreground/80">
                <div>
                  {translate('大小：{value}', { value: formatPreviewSize(preview?.size ?? null) })}
                </div>
                <div>
                  {translate('修改时间：{value}', {
                    value: formatPreviewDate(preview?.modifiedAt ?? null),
                  })}
                </div>
                <div>
                  {translate('类型：{value}', {
                    value: preview?.mimeType || preview?.extension || translate('未知'),
                  })}
                </div>
                <div>
                  {preview?.isDirectory ? translate('文件夹预览') : translate('暂无内联预览')}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
