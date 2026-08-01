import { matchFuzzyPositions, scoreFuzzyMatch, scoreBestFuzzyMatch } from './fuzzyScore.ts'

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

const score = (query, text) => {
  const result = scoreFuzzyMatch(query, text)
  return result.matched ? result.score : null
}

// 用户提供的三个真实案例

assert(score('vscode', 'Visual Studio Code') !== null, 'vscode 应命中 Visual Studio Code（词首缩写）')
assert(score('et', 'Everything') !== null, 'et 应命中 Everything（子序列）')
assert(
  score('et', 'PDF-XChange-Editor-Plus-v10.6.0.396-x64') !== null,
  'et 应命中 Editor 段（子序列）'
)
assert(score('idea', 'IntelliJ IDEA') !== null, 'idea 应命中 IntelliJ IDEA')

// 未命中

assert(score('vscode', 'Notepad') === null, '缺少字符时不应命中')
assert(score('vscode', 'vscod') === null, '关键词比文本长时不应命中')
assert(score('edocsv', 'Visual Studio Code') === null, '顺序不符时不应命中')
assert(score('', 'anything') === null, '空关键词不应命中')

// 词首对齐应该明显优于词中散落

const boundary = score('vsc', 'Visual Studio Code')
const scattered = score('vsc', 'servicscanner')
assert(
  boundary > scattered,
  `词首对齐应得分更高：Visual Studio Code=${boundary} vs servicscanner=${scattered}`
)

// 连续匹配应优于同样落在词首但被打断的匹配

const consecutive = score('code', 'Code')
const broken = score('code', 'C-o-d-e')
assert(consecutive > broken, `连续匹配应得分更高：Code=${consecutive} vs C-o-d-e=${broken}`)

// camelCase 转折处应被识别为词首

const camel = score('vsc', 'VisualStudioCode')
const midWord = score('vsc', 'avisculptor')
assert(camel > midWord, `camelCase 词首应得分更高：VisualStudioCode=${camel} vs ${midWord}`)

// 全局最优：不能贪心地用掉第一个匹配字符就放弃后面更好的位置。
// `xsxt Studio` 里贪心会选 s@1 + t@3（都在词中），最优是 S@5 + t@6（词首且连续）。

const globalOptimum = score('st', 'xsxt Studio')
const greedyChoice = score('st', 'xsxt')
assert(
  globalOptimum > greedyChoice,
  `应选择词首且连续的那一对：xsxt Studio=${globalOptimum} vs 贪心可得的 xsxt=${greedyChoice}`
)

// 多候选取最优，权重可下调路径的贡献

const best = scoreBestFuzzyMatch('vscode', [
  { text: 'Notepad' },
  { text: 'Visual Studio Code' },
])
assert(best.matched, '多候选中存在命中时应返回命中')
assert(best.score === score('vscode', 'Visual Studio Code'), '多候选应取最高分')

const weighted = scoreBestFuzzyMatch('vscode', [{ text: 'Visual Studio Code', weight: 0.2 }])
assert(
  weighted.score < score('vscode', 'Visual Studio Code'),
  '权重应能下调某个候选的贡献'
)

const missing = scoreBestFuzzyMatch('vscode', [{ text: 'Notepad' }, { text: 'Calculator' }])
assert(!missing.matched && missing.score === 0, '全部未命中时应返回未命中')

// 中文不应被误判为分隔符或大写

assert(score('文件', '文件夹') !== null, '中文应可子序列命中')
assert(score('wj', '文件夹') === null, '拼音尚未支持，不应意外命中')

// 命中位置（高亮用）

const positionsMatchQuery = (query, text) => {
  const positions = matchFuzzyPositions(query, text)
  const lowerText = text.toLowerCase()
  const lowerQuery = query.trim().toLowerCase()
  if (positions.length !== lowerQuery.length) return false
  return positions.every(
    (position, step) =>
      lowerText[position] === lowerQuery[step] && (step === 0 || position > positions[step - 1])
  )
}

assert(
  positionsMatchQuery('vscode', 'Visual Studio Code'),
  '命中位置应严格递增且逐个对上关键词字符'
)
assert(positionsMatchQuery('et', 'PDF-XChange-Editor-Plus-v10.6.0.396-x64'), '长名称同样应对齐')
assert(positionsMatchQuery('文件', '文件夹'), '中文命中位置同样应对齐')
assert(
  matchFuzzyPositions('vscode', 'Visual Studio Code').join(',') === '0,7,14,15,16,17',
  `词首缩写应落在词首和连续段上，实际 ${matchFuzzyPositions('vscode', 'Visual Studio Code')}`
)
assert(matchFuzzyPositions('code', 'Code').join(',') === '0,1,2,3', '完全匹配应逐字对齐')
assert(matchFuzzyPositions('zzz', 'Notepad').length === 0, '未命中时不应给出位置')
assert(matchFuzzyPositions('', 'Notepad').length === 0, '空关键词不应给出位置')
assert(matchFuzzyPositions('note', '').length === 0, '空文本不应给出位置')

console.log('fzf 式打分器测试通过')
