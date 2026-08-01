import { matchFuzzyPositions } from './fuzzyScore'

export interface SearchHighlightSegment {
  text: string
  highlighted: boolean
}

const pushSegment = (segments: SearchHighlightSegment[], text: string, highlighted: boolean) => {
  if (!text) {
    return
  }

  const lastSegment = segments[segments.length - 1]
  if (lastSegment && lastSegment.highlighted === highlighted) {
    lastSegment.text += text
    return
  }

  segments.push({
    text,
    highlighted,
  })
}

export const parseEverythingHighlightedText = (highlightedText: string, fallbackText: string) => {
  const source = highlightedText || fallbackText
  if (!source) {
    return [] as SearchHighlightSegment[]
  }

  const segments: SearchHighlightSegment[] = []
  let highlighted = false
  let buffer = ''

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (char !== '*') {
      buffer += char
      continue
    }

    if (source[index + 1] === '*') {
      buffer += '*'
      index += 1
      continue
    }

    pushSegment(segments, buffer, highlighted)
    buffer = ''
    highlighted = !highlighted
  }

  pushSegment(segments, buffer, highlighted)
  return segments
}

/**
 * fzf 式命中的高亮分段，给「最佳匹配」用。
 *
 * Everything 只在字面子串命中时给出 `*` 标记，而最佳匹配里的候选（启动台图标、
 * 高优先级目录表条目）根本不经过 Everything —— `vscode` 命中 `Visual Studio Code`
 * 靠的是本地打分器的子序列匹配，命中位置只有它知道，所以这里按它的最优路径切段。
 */
export const buildFuzzyHighlightSegments = (
  text: string,
  keyword: string
): SearchHighlightSegment[] => {
  if (!text) return []

  const positions = matchFuzzyPositions(keyword, text)
  if (positions.length === 0) return [{ text, highlighted: false }]

  const segments: SearchHighlightSegment[] = []
  let cursor = 0
  // 位置递增，相邻的命中会在 `pushSegment` 里并成一段，高亮出来是连续的一片。
  positions.forEach(position => {
    if (position < cursor) return
    pushSegment(segments, text.slice(cursor, position), false)
    pushSegment(segments, text.slice(position, position + 1), true)
    cursor = position + 1
  })
  pushSegment(segments, text.slice(cursor), false)
  return segments
}

/**
 * 字面子串命中的高亮分段，给路径这类「散落高亮只会变成噪音」的文本用：
 * 一条长路径几乎总能子序列命中关键词，把那些字符逐个点亮反而看不出为什么匹配。
 */
export const buildLiteralHighlightSegments = (
  text: string,
  keyword: string
): SearchHighlightSegment[] => {
  const needle = keyword.trim().toLocaleLowerCase()
  if (!text) return []
  if (!needle) return [{ text, highlighted: false }]

  const haystack = text.toLocaleLowerCase()
  // 小写化改变了长度（`İ` 之类）时下标不再对齐原串，宁可不高亮也不要切错位置。
  if (haystack.length !== text.length) return [{ text, highlighted: false }]

  const segments: SearchHighlightSegment[] = []
  let cursor = 0

  for (;;) {
    const found = haystack.indexOf(needle, cursor)
    if (found < 0) break
    pushSegment(segments, text.slice(cursor, found), false)
    pushSegment(segments, text.slice(found, found + needle.length), true)
    cursor = found + needle.length
  }

  pushSegment(segments, text.slice(cursor), false)
  return segments
}
