import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

// ChatGPT 式的富文本回复：渲染 markdown（gfm），原样保留软换行，禁用原始 HTML。
const components: Components = {
  p: ({ children }) => (
    <p className="my-1.5 whitespace-pre-wrap first:mt-0 last:mb-0">{children}</p>
  ),
  ul: ({ children }) => <ul className="my-1.5 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-1.5 list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="whitespace-pre-wrap leading-6">{children}</li>,
  h1: ({ children }) => <h1 className="mt-3 mb-1.5 text-base font-semibold">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-3 mb-1.5 text-sm font-semibold">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-2.5 mb-1 text-sm font-semibold">{children}</h3>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-primary underline underline-offset-2"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-1.5 border-l-2 border-border pl-3 text-muted-foreground">
      {children}
    </blockquote>
  ),
  pre: ({ children }) => (
    <pre className="my-1.5 overflow-x-auto rounded-md border border-border/60 bg-muted/60 p-2.5 text-xs leading-5">
      {children}
    </pre>
  ),
  code: ({ className, children }) => {
    const isBlock = /language-/.test(className ?? '')
    if (isBlock) return <code className="font-mono">{children}</code>
    return (
      <code className="rounded bg-muted/70 px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
    )
  },
  table: ({ children }) => (
    <div className="my-1.5 overflow-x-auto">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-border/70 bg-muted/50 px-2 py-1 text-left font-medium">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border border-border/70 px-2 py-1 align-top">{children}</td>,
}

export function AiMarkdown({ content }: { content: string }) {
  return (
    <div className="text-sm text-foreground [&>*:last-child]:mb-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
