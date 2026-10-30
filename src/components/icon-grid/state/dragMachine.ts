interface OuterInteractionFields<TZone> {
  previewSlotIndex: number | null
  hoverTargetId: string | null
  hoverTargetIndex?: number | null
  lastReorderCellIndex?: number | null
  hoverZone: TZone | null
  hoverIou: number
  centerStartedAt: number | null
  dwellStartedAt: number | null
  folderPreviewTargetId: string | null
  lastEvasionSignature: string | null
}

export const resetOuterInteraction = <TState extends OuterInteractionFields<TZone>, TZone>(
  state: TState,
  previewSlotIndex: number | null
): TState => ({
  ...state,
  previewSlotIndex,
  hoverTargetId: null,
  hoverTargetIndex: null,
  hoverZone: null,
  hoverIou: 0,
  centerStartedAt: null,
  dwellStartedAt: null,
  folderPreviewTargetId: null,
  lastEvasionSignature: null,
})

export const clearOuterInteractionForPageSwitch = <
  TState extends OuterInteractionFields<TZone>,
  TZone,
>(
  state: TState
): TState => ({
  ...state,
  previewSlotIndex: null,
  hoverTargetId: null,
  hoverTargetIndex: null,
  lastReorderCellIndex: null,
  hoverZone: null,
  hoverIou: 0,
  centerStartedAt: null,
  dwellStartedAt: null,
  folderPreviewTargetId: null,
  lastEvasionSignature: null,
})
