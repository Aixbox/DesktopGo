import type { SearchHit, SearchPreview } from '@/lib/search/types'

interface SearchPreviewPaneProps {
  item: SearchHit | null
  preview: SearchPreview | null
  loading: boolean
  error: string | null
  stacked?: boolean
}

const formatPreviewSize = (size: number | null) => {
  if (size === null) {
    return '文件夹'
  }
  if (size < 1024) {
    return `${size} B`
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }
  if (size < 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`
  }
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

const formatPreviewDate = (value: number | null) => {
  if (value === null) {
    return '不可用'
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(value)
  } catch {
    return '不可用'
  }
}

export function SearchPreviewPane({
  item,
  preview,
  loading,
  error,
  stacked = false,
}: SearchPreviewPaneProps) {
  const shellClassName = stacked
    ? 'flex h-[18rem] flex-col overflow-hidden border-t border-border/60 bg-background/12'
    : 'flex h-full flex-col overflow-hidden border-l border-border/60 bg-background/12'

  if (!item) {
    return (
      <div
        className={`${stacked ? 'h-36 border-t border-border/60 bg-background/12' : 'h-full'} flex items-center justify-center px-6 text-center text-sm text-muted-foreground`}
      >
        选择一个结果后，可在这里查看预览。
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
          <div className="text-sm text-muted-foreground">正在加载预览...</div>
        ) : error ? (
          <div className="text-sm text-red-700 dark:text-red-300">{error}</div>
        ) : preview?.kind === 'image' && preview.imageDataUrl ? (
          <div className="space-y-4">
            <img
              src={preview.imageDataUrl}
              alt={preview.name}
              className="max-h-72 w-full rounded-lg border border-border/60 bg-background/40 object-contain"
              draggable={false}
            />
            <div className="search-surface-card rounded-lg p-3">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                元数据
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 text-sm text-foreground/80">
                <div>大小：{formatPreviewSize(preview.size)}</div>
                <div>修改时间：{formatPreviewDate(preview.modifiedAt)}</div>
                <div>类型：{preview.mimeType || preview.extension || '未知'}</div>
              </div>
            </div>
          </div>
        ) : preview?.kind === 'text' ? (
          <div className="space-y-4">
            <div className="search-surface-card rounded-lg p-3">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                文本预览
              </div>
              <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-foreground/80">
                {preview.textSnippet || '没有可用的文本预览。'}
              </pre>
              {preview.textTruncated ? (
                <div className="mt-3 text-[11px] text-muted-foreground">
                  为保证加载速度，预览内容已截断。
                </div>
              ) : null}
            </div>
            <div className="search-surface-card rounded-lg p-3">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                元数据
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 text-sm text-foreground/80">
                <div>大小：{formatPreviewSize(preview.size)}</div>
                <div>修改时间：{formatPreviewDate(preview.modifiedAt)}</div>
                <div>类型：{preview.mimeType || preview.extension || '未知'}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="search-surface-card rounded-lg p-3">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                元数据
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 text-sm text-foreground/80">
                <div>大小：{formatPreviewSize(preview?.size ?? null)}</div>
                <div>修改时间：{formatPreviewDate(preview?.modifiedAt ?? null)}</div>
                <div>类型：{preview?.mimeType || preview?.extension || '未知'}</div>
                <div>{preview?.isDirectory ? '文件夹预览' : '暂无内联预览'}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
