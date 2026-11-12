import type { MultiDropFlightItem } from '../state/types'

/** Translucent folders must hand off atomically; overlapping fills brighten the glass. */
export function retainNonFolderDropFlights(
  flights: MultiDropFlightItem[] | null
): MultiDropFlightItem[] | null {
  const remaining = flights?.filter(flight => flight.item.kind !== 'folder') ?? []
  return remaining.length ? remaining : null
}
