import type { DesktopIcon } from '../types'

/**
 * 图标在选择/布局体系里的唯一键：`{source}:{id}`。
 * 抽到独立轻量模块，方便纯逻辑与测试复用，避免被 store 的运行时依赖牵连。
 */
export const buildIconSelectionKey = (icon: Pick<DesktopIcon, 'id' | 'source'>): string =>
  `${icon.source}:${icon.id}`
