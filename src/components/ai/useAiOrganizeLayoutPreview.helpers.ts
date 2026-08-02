export type AiOrganizePreviewViewMode = 'paged' | 'scroll'

export interface AiOrganizePreviewSessionState<TBaseline = unknown> {
  baseline: TBaseline | null
  baselineCaptured: boolean
  dirty: boolean
  applied: boolean
}

export const resolveAiOrganizePreviewViewMode = (
  baselineViewMode: AiOrganizePreviewViewMode | null | undefined,
  currentViewMode: AiOrganizePreviewViewMode
) => baselineViewMode ?? currentViewMode

export const markAiOrganizePreviewLayoutWritten = <TBaseline>(
  state: AiOrganizePreviewSessionState<TBaseline>
): AiOrganizePreviewSessionState<TBaseline> => ({
  ...state,
  dirty: true,
})

export class AiOrganizePreviewRefreshError extends Error {
  readonly cause: unknown

  constructor(cause: unknown) {
    super('AI organize layout preview refresh failed')
    this.name = 'AiOrganizePreviewRefreshError'
    this.cause = cause
  }
}

export const isAiOrganizePreviewRefreshError = (
  error: unknown
): error is AiOrganizePreviewRefreshError => error instanceof AiOrganizePreviewRefreshError

export const clearAiOrganizePreviewSessionState = <TBaseline>(
  state: AiOrganizePreviewSessionState<TBaseline>
): AiOrganizePreviewSessionState<TBaseline> => ({
  ...state,
  baseline: null,
  baselineCaptured: false,
  dirty: false,
  applied: false,
})
