// ChatGPT 式的三点脉冲等待指示，仅在尚无任何可展示输出时出现。
export function AiWaitingDots() {
  return (
    <span
      className="ml-1.5 inline-flex translate-y-[2px] items-center gap-1 align-middle"
      aria-hidden="true"
    >
      <span className="h-1 w-1 rounded-full bg-muted-foreground/70 motion-safe:animate-pulse" />
      <span className="h-1 w-1 rounded-full bg-muted-foreground/50 motion-safe:animate-pulse [animation-delay:150ms]" />
      <span className="h-1 w-1 rounded-full bg-muted-foreground/30 motion-safe:animate-pulse [animation-delay:300ms]" />
    </span>
  )
}
