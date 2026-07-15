import type { DesktopIcon } from '../types'

/**
 * 图标在选择/布局体系里的唯一键。图标库 ID 全局唯一。
 * 抽到独立轻量模块，方便纯逻辑与测试复用，避免被 store 的运行时依赖牵连。
 */
export const buildIconSelectionKey = (icon: Pick<DesktopIcon, 'id'>): string => icon.id
