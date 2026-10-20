interface StackedIconIdentity {
  id: string
}

export const getStackedIconMotionKey = (stackedIcons: readonly StackedIconIdentity[]) =>
  JSON.stringify(stackedIcons.map(({ id }) => id))
