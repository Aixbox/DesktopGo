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
