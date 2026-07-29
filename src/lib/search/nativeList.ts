import { invoke } from '@tauri-apps/api/core'
import type { SearchQuery } from './types'

export interface NativeSearchBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface NativeSearchPalette {
  background: [number, number, number]
  foreground: [number, number, number]
  muted: [number, number, number]
  accent: [number, number, number]
  selection: [number, number, number]
  hover: [number, number, number]
}

type Rgb = [number, number, number]

const sampleCssColor = (value: string, fallback: string): Rgb => {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return [0, 0, 0]
  context.fillStyle = fallback
  context.fillStyle = value.trim() || fallback
  context.fillRect(0, 0, 1, 1)
  const [red, green, blue] = context.getImageData(0, 0, 1, 1).data
  return [red, green, blue]
}

const mix = (foreground: Rgb, background: Rgb, opacity: number): Rgb =>
  foreground.map((channel, index) =>
    Math.round(channel * opacity + background[index] * (1 - opacity))
  ) as Rgb

export const readNativeSearchPalette = (): NativeSearchPalette => {
  const root = document.documentElement
  const styles = getComputedStyle(root)
  const dark = root.classList.contains('dark')
  const background = sampleCssColor(
    styles.getPropertyValue('--background'),
    dark ? '#111827' : '#fff'
  )
  const foreground = sampleCssColor(
    styles.getPropertyValue('--foreground'),
    dark ? '#f8fafc' : '#0f172a'
  )
  const muted = sampleCssColor(
    styles.getPropertyValue('--muted-foreground'),
    dark ? '#94a3b8' : '#64748b'
  )
  const accent = sampleCssColor(styles.getPropertyValue('--primary'), '#3b82f6')
  return {
    background,
    foreground,
    muted,
    accent,
    selection: mix(accent, background, dark ? 0.24 : 0.18),
    hover: mix(foreground, background, dark ? 0.1 : 0.055),
  }
}

export const prepareNativeSearchList = (generation: number, query: SearchQuery) =>
  invoke<number>('prepare_native_search_list', { generation, query })

export const showNativeSearchList = (
  generation: number,
  bounds: NativeSearchBounds,
  palette: NativeSearchPalette
) => invoke<void>('show_native_search_list', { generation, bounds, palette })

export const hideNativeSearchList = () => invoke<void>('hide_native_search_list')

export const selectNativeSearchListItem = (index: number) =>
  invoke<void>('select_native_search_list_item', { index })
