export const formControlFocusClassName =
  'focus-visible:border-ring/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45'

export const formControlActiveClassName = 'border-ring/45 ring-2 ring-ring/45'

export const formControlFocusWithinClassName =
  'focus-within:border-ring/45 focus-within:ring-2 focus-within:ring-ring/45'

export const inputBaseClassName = `flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground ${formControlFocusClassName} disabled:cursor-not-allowed disabled:opacity-50 file:border-0 file:bg-transparent file:text-sm file:font-medium`

export const textareaBaseClassName = `w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground ${formControlFocusClassName} disabled:cursor-not-allowed disabled:opacity-50`
