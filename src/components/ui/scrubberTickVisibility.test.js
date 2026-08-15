import assert from 'node:assert/strict'
import {
  getVisibleScrubberTickPercentages,
  SCRUBBER_TICK_PERCENTAGES,
} from './scrubberTickVisibility.ts'

assert.deepEqual(
  getVisibleScrubberTickPercentages({
    trackWidth: 500,
    labelLeft: 14,
    labelRight: 92,
    valueLeft: 450,
    valueRight: 488,
  }),
  [30, 40, 50, 60, 70, 80],
  '标签和数值区域内的刻度应被隐藏'
)

assert.deepEqual(
  getVisibleScrubberTickPercentages({
    trackWidth: 320,
    labelLeft: 14,
    labelRight: 112,
    valueLeft: 270,
    valueRight: 308,
  }),
  [40, 50, 60, 70, 80],
  '窄滑块中紧邻标签和数值的刻度也不应显示'
)

assert.deepEqual(
  getVisibleScrubberTickPercentages({
    trackWidth: 0,
    labelLeft: 14,
    labelRight: 80,
    valueLeft: 250,
    valueRight: 288,
  }),
  [],
  '无有效宽度时不应提前渲染刻度'
)

assert.equal(SCRUBBER_TICK_PERCENTAGES.length, 9, '应保留原有九个刻度位置')

console.log('scrubberTickVisibility 测试通过')
