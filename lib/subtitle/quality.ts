export type SubtitleQualityResult = {
  ok: boolean
  reason: string
  keywordMatchCount: number
  keywordCount: number
}

const STOP_KEYWORDS = new Set([
  '这个',
  '那个',
  '我们',
  '你们',
  '他们',
  '大家',
  '今天',
  '昨天',
  '然后',
  '就是',
  '不是',
  '因为',
  '所以',
  '可以',
  '没有',
  '什么',
  '怎么',
  '自己',
  '觉得',
  '感觉',
  '真的',
  '非常',
  '一个',
  '一下',
])

function normalizeText(input: string) {
  return String(input || '')
    .replace(/\s+/g, '')
    .toLowerCase()
}

function extractKeywords(title: string): string[] {
  const normalized = normalizeText(title)
  const set = new Set<string>()

  const chineseBlocks = normalized.match(/[\u4e00-\u9fa5]{2,}/g) || []
  for (const block of chineseBlocks) {
    if (block.length <= 6) {
      if (!STOP_KEYWORDS.has(block)) set.add(block)
      continue
    }

    const first = block.slice(0, 4)
    const last = block.slice(-4)
    if (!STOP_KEYWORDS.has(first)) set.add(first)
    if (!STOP_KEYWORDS.has(last)) set.add(last)

    for (let i = 0; i <= block.length - 3; i += 2) {
      const token = block.slice(i, i + 3)
      if (!STOP_KEYWORDS.has(token)) {
        set.add(token)
      }
    }
  }

  const englishWords = normalized.match(/[a-z][a-z0-9]{2,}/g) || []
  for (const word of englishWords) {
    if (!STOP_KEYWORDS.has(word)) {
      set.add(word)
    }
  }

  const digits = normalized.match(/\d+(?:\.\d+)?/g) || []
  for (const d of digits) {
    set.add(d)
  }

  return Array.from(set).slice(0, 20)
}

export function validateSubtitleQuality(params: { title: string; transcript: string }): SubtitleQualityResult {
  const title = String(params.title || '').trim()
  const transcript = String(params.transcript || '').trim()

  if (!transcript || transcript.length < 120) {
    return {
      ok: false,
      reason: 'Subtitle text is too short for reliable interpretation.',
      keywordMatchCount: 0,
      keywordCount: 0,
    }
  }

  if (!title || title.toLowerCase() === 'untitled video') {
    return {
      ok: true,
      reason: 'Title unavailable, skipped semantic consistency check.',
      keywordMatchCount: 0,
      keywordCount: 0,
    }
  }

  const keywords = extractKeywords(title)
  if (!keywords.length) {
    return {
      ok: true,
      reason: 'No useful title keywords extracted, skipped semantic consistency check.',
      keywordMatchCount: 0,
      keywordCount: 0,
    }
  }

  const normalizedTranscript = normalizeText(transcript)
  const matched = keywords.filter((k) => normalizedTranscript.includes(k))
  const hitRatio = matched.length / keywords.length

  return {
    ok: true,
    reason: `Subtitle-content keyword hit ${matched.length}/${keywords.length} (ratio ${hitRatio.toFixed(2)}).`,
    keywordMatchCount: matched.length,
    keywordCount: keywords.length,
  }
}
