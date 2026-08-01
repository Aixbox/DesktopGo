import {
  buildFuzzyHighlightSegments,
  buildLiteralHighlightSegments,
  parseEverythingHighlightedText,
} from './highlight.ts'

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

/** 只看被点亮的文本，段落怎么切分是实现细节。 */
const highlighted = segments =>
  segments
    .filter(segment => segment.highlighted)
    .map(segment => segment.text)
    .join('|')

const plain = segments => segments.map(segment => segment.text).join('')

// Everything 的 `*` 标记
const everything = parseEverythingHighlightedText('*Vs*Code.exe', 'VsCode.exe')
assert(highlighted(everything) === 'Vs', 'Everything 标记之间的文本应被点亮')
assert(plain(everything) === 'VsCode.exe', '解析后不应改变原文')

// 子序列命中：词首缩写也要点亮
const abbreviation = buildFuzzyHighlightSegments('Visual Studio Code', 'vscode')
assert(plain(abbreviation) === 'Visual Studio Code', '高亮分段拼回去必须是原文')
assert(
  highlighted(abbreviation) === 'V|S|Code',
  `词首缩写应逐段点亮，实际 ${highlighted(abbreviation)}`
)

// 连续命中应并成一段，而不是逐字切开
const consecutive = buildFuzzyHighlightSegments('Notepad', 'note')
assert(
  highlighted(consecutive) === 'Note',
  `连续命中应并成一段，实际 ${highlighted(consecutive)}`
)

// 大小写不敏感，且命中不在开头时前后文本都要保留
const middle = buildFuzzyHighlightSegments('Microsoft Edge', 'edge')
assert(highlighted(middle) === 'Edge', '大小写不同也应命中')
assert(plain(middle) === 'Microsoft Edge', '未命中的部分应原样保留')

// 未命中时返回整段未点亮，而不是空数组
const missed = buildFuzzyHighlightSegments('Notepad', 'zzz')
assert(
  missed.length === 1 && !missed[0].highlighted && missed[0].text === 'Notepad',
  '未命中时应返回整段未点亮的文本'
)
assert(buildFuzzyHighlightSegments('', 'note').length === 0, '空文本应返回空分段')
assert(
  highlighted(buildFuzzyHighlightSegments('Notepad', '   ')) === '',
  '空关键词不应点亮任何字符'
)

// 路径走字面子串：只点亮真正出现的那一段，不做子序列
const literalPath = buildLiteralHighlightSegments('C:/Program Files/Code/Code.exe', 'code')
assert(
  highlighted(literalPath) === 'Code|Code',
  `字面子串应逐次点亮，实际 ${highlighted(literalPath)}`
)
assert(plain(literalPath) === 'C:/Program Files/Code/Code.exe', '路径原文不应改变')

const noLiteral = buildLiteralHighlightSegments('C:/Program Files/Microsoft VS Code', 'vscode')
assert(
  highlighted(noLiteral) === '',
  '路径里没有字面出现的关键词时不应逐字点亮（那只会变成噪音）'
)

console.log('搜索高亮分段测试通过')
