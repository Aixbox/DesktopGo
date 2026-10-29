import { COLOROS_MOTION } from '../constants.ts'
import {
  LAUNCHPAD_MOTION_TOKENS,
  prefersReducedMotion,
  resolveMotionDuration,
} from './motionTokens.ts'

if (LAUNCHPAD_MOTION_TOKENS.workspacePageSnapMs !== COLOROS_MOTION.workspacePageSnapMs) {
  throw new Error('motion tokens 应复用 ColorOS workspace snap 基线')
}

if (resolveMotionDuration(600, false) !== 600 || resolveMotionDuration(600, true) !== 0) {
  throw new Error('reduced-motion 应只缩短时长，不改变目标状态')
}

if (resolveMotionDuration(-1, false) !== 0) {
  throw new Error('动画时长不能为负数')
}

if (typeof prefersReducedMotion() !== 'boolean') {
  throw new Error('无浏览器环境时 reduced-motion 应返回布尔值')
}

console.log('motionTokens 测试通过')
