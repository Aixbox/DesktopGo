/**
 * fzf 式子序列打分器：关键词的每个字符只要按顺序出现即算命中，再用词边界、
 * 连续性和间隔加权决定名次。这套算法能让 `vscode` 命中 `Visual Studio Code`
 * （v-isual / S-tudio / C-ode 三个词首），而单纯的子串或「去掉空格再比较」都做不到。
 *
 * 与 Listary 的 `fuzzy/position_bitmap.rs` 属同一族（见
 * docs/LISTARY_BINARY_ANALYSIS.zh-CN.md 第 6 节）。这里用 O(名称长度 × 关键词长度)
 * 的动态规划实现，取的是全局最优匹配位置，而不是贪心的第一个匹配。
 *
 * 「最佳匹配」要对全部高优先级候选打分，所以这里按热路径写：整串一次性
 * 小写化、用 `Uint32Array` 存码点、复用打分缓冲区、DP 之前先做 O(n) 的子序列
 * 快速排除。基准见本文件末尾的注释。
 */

const SCORE_MATCH = 16
/**
 * 跨过若干字符再匹配下一个字符的固定代价。必须大于「词边界奖励减去连续奖励」，
 * 否则 `C-o-d-e` 这种每个字符都踩在分隔符后面的名称会靠不断领取词边界奖励，
 * 反而压过 `Code` 这种真正连续的匹配。
 */
const SCORE_GAP = -5
/** 紧接上一个匹配字符时的奖励。 */
const BONUS_CONSECUTIVE = 4
/** 落在词首（开头、分隔符之后）的奖励。 */
const BONUS_BOUNDARY = 8
/** camelCase 转折处（小写或数字后紧跟大写）的奖励。 */
const BONUS_CAMEL = 7
/** 首个字符的位置权重更高，让「从词首开始」明显优于「从词中开始」。 */
const FIRST_CHAR_BONUS_MULTIPLIER = 2

const NEGATIVE_INFINITY = Number.NEGATIVE_INFINITY

const SEPARATOR_CACHE = new Map<number, boolean>()
const NON_WORD_PATTERN = /[^\p{L}\p{N}]/u

const isSeparatorCode = (code: number): boolean => {
  if (code < 128) {
    const isDigit = code >= 48 && code <= 57
    const isUpper = code >= 65 && code <= 90
    const isLower = code >= 97 && code <= 122
    return !(isDigit || isUpper || isLower)
  }
  const cached = SEPARATOR_CACHE.get(code)
  if (cached !== undefined) return cached
  const resolved = NON_WORD_PATTERN.test(String.fromCodePoint(code))
  SEPARATOR_CACHE.set(code, resolved)
  return resolved
}

let originalCodes = new Uint32Array(0)
let lowerCodes = new Uint32Array(0)
let bonuses = new Int32Array(0)
let previousScores = new Float64Array(0)
let currentScores = new Float64Array(0)

const ensureCapacity = (length: number) => {
  if (originalCodes.length >= length) return
  const capacity = Math.max(length, 256)
  originalCodes = new Uint32Array(capacity)
  lowerCodes = new Uint32Array(capacity)
  bonuses = new Int32Array(capacity)
  previousScores = new Float64Array(capacity)
  currentScores = new Float64Array(capacity)
}

/** 逐字符小写化，只在整串小写化会改变长度时才用（`İ` 之类，文件名里几乎不出现）。 */
const fillCodesPerCharacter = (text: string): number => {
  const characters = Array.from(text)
  ensureCapacity(characters.length)
  characters.forEach((character, index) => {
    originalCodes[index] = character.codePointAt(0) ?? 0
    lowerCodes[index] = character.toLocaleLowerCase().codePointAt(0) ?? 0
  })
  return characters.length
}

const fillCodes = (text: string): number => {
  const lower = text.toLowerCase()
  if (lower.length !== text.length) return fillCodesPerCharacter(text)

  ensureCapacity(text.length)
  for (let index = 0; index < text.length; index += 1) {
    originalCodes[index] = text.charCodeAt(index)
    lowerCodes[index] = lower.charCodeAt(index)
  }
  return text.length
}

/** 每个位置的「起始质量」：词首和 camelCase 转折处更值钱。 */
const fillBonuses = (length: number) => {
  for (let index = 0; index < length; index += 1) {
    if (index === 0) {
      bonuses[index] = BONUS_BOUNDARY
      continue
    }
    const previousCode = originalCodes[index - 1]
    if (isSeparatorCode(previousCode)) {
      bonuses[index] = BONUS_BOUNDARY
      continue
    }
    const isUpper = originalCodes[index] !== lowerCodes[index]
    const previousIsUpper = previousCode !== lowerCodes[index - 1]
    bonuses[index] = isUpper && !previousIsUpper ? BONUS_CAMEL : 0
  }
}

export interface FuzzyMatchResult {
  matched: boolean
  /** 未命中时为 0；命中时越大越相关。 */
  score: number
}

const NO_MATCH: FuzzyMatchResult = { matched: false, score: 0 }

/**
 * 关键词与文本都按小写比较，词边界奖励仍按原始大小写计算。
 */
export function scoreFuzzyMatch(query: string, text: string): FuzzyMatchResult {
  const trimmedQuery = query.trim().toLowerCase()
  if (!trimmedQuery || !text) return NO_MATCH

  const textLength = fillCodes(text)
  const queryLength = trimmedQuery.length
  if (queryLength > textLength) return NO_MATCH

  // O(n) 子序列快速排除：DP 之前就把注定不命中的候选挡掉。
  let matchedQueryChars = 0
  for (let index = 0; index < textLength && matchedQueryChars < queryLength; index += 1) {
    if (lowerCodes[index] === trimmedQuery.charCodeAt(matchedQueryChars)) matchedQueryChars += 1
  }
  if (matchedQueryChars < queryLength) return NO_MATCH

  fillBonuses(textLength)
  previousScores.fill(NEGATIVE_INFINITY, 0, textLength)

  for (let step = 0; step < queryLength; step += 1) {
    const queryCode = trimmedQuery.charCodeAt(step)
    currentScores.fill(NEGATIVE_INFINITY, 0, textLength)
    // bestBefore：previous[0..index-1] 的前缀最大值；ExcludingLast 再退一位，
    // 对应「跨过至少一个字符」的分支。
    let bestBefore = NEGATIVE_INFINITY
    let bestBeforeExcludingLast = NEGATIVE_INFINITY

    for (let index = 0; index < textLength; index += 1) {
      if (lowerCodes[index] === queryCode) {
        if (step === 0) {
          currentScores[index] = SCORE_MATCH + bonuses[index] * FIRST_CHAR_BONUS_MULTIPLIER
        } else {
          const consecutive =
            index >= 1 && previousScores[index - 1] > NEGATIVE_INFINITY
              ? previousScores[index - 1] + BONUS_CONSECUTIVE
              : NEGATIVE_INFINITY
          const skipped =
            bestBeforeExcludingLast > NEGATIVE_INFINITY
              ? bestBeforeExcludingLast + SCORE_GAP
              : NEGATIVE_INFINITY
          const best = consecutive > skipped ? consecutive : skipped
          if (best > NEGATIVE_INFINITY) {
            currentScores[index] = SCORE_MATCH + bonuses[index] + best
          }
        }
      }
      bestBeforeExcludingLast = bestBefore
      if (previousScores[index] > bestBefore) bestBefore = previousScores[index]
    }

    previousScores.set(currentScores.subarray(0, textLength), 0)
  }

  let score = NEGATIVE_INFINITY
  for (let index = 0; index < textLength; index += 1) {
    if (previousScores[index] > score) score = previousScores[index]
  }
  return score > NEGATIVE_INFINITY ? { matched: true, score } : NO_MATCH
}

/**
 * 按候选顺序取第一个命中的得分，后面的候选只在前面都没命中时才尝试。
 *
 * 调用方按重要性排列候选（名称在前、路径在后），所以「名称命中就用名称的分」
 * 既是想要的语义，也省下了对长路径跑一遍 DP 的开销。
 */
export function scoreBestFuzzyMatch(
  query: string,
  candidates: Array<{ text: string; weight?: number }>
): FuzzyMatchResult {
  for (const candidate of candidates) {
    const result = scoreFuzzyMatch(query, candidate.text)
    if (result.matched) {
      const weight = candidate.weight ?? 1
      return weight === 1 ? result : { matched: true, score: result.score * weight }
    }
  }
  return NO_MATCH
}

const NO_POSITIONS: number[] = []

/**
 * 高亮要按**代码单元**下标去切原字符串，所以填充必须和字符串下标严格 1:1 对齐，
 * 不能像 `fillCodes` 那样在少数字符（`İ` 之类，小写化后长度会变）上退化成按字符遍历。
 */
const fillHighlightCodes = (text: string): number => {
  ensureCapacity(text.length)
  const lower = text.toLowerCase()
  const aligned = lower.length === text.length ? lower : null

  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    originalCodes[index] = code
    lowerCodes[index] = aligned
      ? aligned.charCodeAt(index)
      : String.fromCharCode(code).toLowerCase().charCodeAt(0)
  }
  return text.length
}

/**
 * 最优匹配落在哪些字符上，用于高亮。返回**递增**的代码单元下标，未命中时为空数组。
 *
 * `scoreFuzzyMatch` 只要最大值，所以它逐步覆盖同一行缓冲区；这里还要回溯路径，
 * 于是多记一张父指针表。只对最终渲染出来的那几行调用（「最佳匹配」一次最多 6 行），
 * 不在打分热路径上，所以按可读性写、每次分配新表，不去复用打分器的缓冲区。
 */
export function matchFuzzyPositions(query: string, text: string): number[] {
  const trimmedQuery = query.trim().toLowerCase()
  if (!trimmedQuery || !text) return NO_POSITIONS

  const textLength = fillHighlightCodes(text)
  const queryLength = trimmedQuery.length
  if (queryLength > textLength) return NO_POSITIONS

  fillBonuses(textLength)

  const scores = new Float64Array(queryLength * textLength).fill(NEGATIVE_INFINITY)
  // 父指针：当前字符的上一个匹配字符落在哪个下标，-1 表示这里是起点。
  const parents = new Int32Array(queryLength * textLength).fill(-1)

  for (let step = 0; step < queryLength; step += 1) {
    const queryCode = trimmedQuery.charCodeAt(step)
    const row = step * textLength
    const previousRow = row - textLength
    let bestBefore = NEGATIVE_INFINITY
    let bestBeforeIndex = -1
    let bestBeforeExcludingLast = NEGATIVE_INFINITY
    let bestBeforeExcludingLastIndex = -1

    for (let index = 0; index < textLength; index += 1) {
      if (lowerCodes[index] === queryCode) {
        if (step === 0) {
          scores[row + index] = SCORE_MATCH + bonuses[index] * FIRST_CHAR_BONUS_MULTIPLIER
        } else {
          const consecutive =
            index >= 1 && scores[previousRow + index - 1] > NEGATIVE_INFINITY
              ? scores[previousRow + index - 1] + BONUS_CONSECUTIVE
              : NEGATIVE_INFINITY
          const skipped =
            bestBeforeExcludingLast > NEGATIVE_INFINITY
              ? bestBeforeExcludingLast + SCORE_GAP
              : NEGATIVE_INFINITY
          // 同分时选「紧接上一个字符」，高亮出来是连成一片的，比散落着好读。
          if (consecutive > NEGATIVE_INFINITY && consecutive >= skipped) {
            scores[row + index] = SCORE_MATCH + bonuses[index] + consecutive
            parents[row + index] = index - 1
          } else if (skipped > NEGATIVE_INFINITY) {
            scores[row + index] = SCORE_MATCH + bonuses[index] + skipped
            parents[row + index] = bestBeforeExcludingLastIndex
          }
        }
      }

      bestBeforeExcludingLast = bestBefore
      bestBeforeExcludingLastIndex = bestBeforeIndex
      if (step > 0 && scores[previousRow + index] > bestBefore) {
        bestBefore = scores[previousRow + index]
        bestBeforeIndex = index
      }
    }
  }

  const lastRow = (queryLength - 1) * textLength
  let best = NEGATIVE_INFINITY
  let bestIndex = -1
  for (let index = 0; index < textLength; index += 1) {
    if (scores[lastRow + index] > best) {
      best = scores[lastRow + index]
      bestIndex = index
    }
  }
  if (bestIndex < 0) return NO_POSITIONS

  const positions = new Array<number>(queryLength)
  let index = bestIndex
  for (let step = queryLength - 1; step >= 0; step -= 1) {
    positions[step] = index
    index = parents[step * textLength + index]
    // 父链断在中途只可能是打分与回溯不一致，宁可不高亮也不要给出错位的下标。
    if (index < 0 && step > 0) return NO_POSITIONS
  }
  return positions
}
