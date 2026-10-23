import { REORDER_ANIMATION_MS } from '../constants.ts'
import { getReorderAnimationDuration } from './reorderMotion.ts'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const oneCell = getReorderAnimationDuration(100, 0, 100)
const twoCells = getReorderAnimationDuration(200, 0, 100)
const distant = getReorderAnimationDuration(1000, 0, 100)

assert(oneCell === REORDER_ANIMATION_MS, 'One-cell moves must retain the base duration')
assert(twoCells > oneCell, 'Longer moves must take longer')
assert(distant === Math.round(REORDER_ANIMATION_MS * 1.75), 'Long moves must stay capped')
assert(
  getReorderAnimationDuration(0, 0, 100) === REORDER_ANIMATION_MS,
  'Zero-distance moves must return the base duration'
)

console.log('reorderMotion tests passed')
