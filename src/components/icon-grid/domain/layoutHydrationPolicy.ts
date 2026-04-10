export type LayoutHydrationSource = 'memory' | 'persisted'

type ResolveLayoutHydrationSourceOptions = {
  hydrated: boolean
  hydratedResetToken: number
  currentResetToken: number
}

type ShouldResetPersistedLayoutCacheOptions = {
  cachedResetToken: number | null
  currentResetToken: number
}

export const resolveLayoutHydrationSource = ({
  hydrated,
  hydratedResetToken,
  currentResetToken,
}: ResolveLayoutHydrationSourceOptions): LayoutHydrationSource =>
  hydrated && hydratedResetToken === currentResetToken ? 'memory' : 'persisted'

export const shouldResetPersistedLayoutCache = ({
  cachedResetToken,
  currentResetToken,
}: ShouldResetPersistedLayoutCacheOptions) => cachedResetToken !== currentResetToken
