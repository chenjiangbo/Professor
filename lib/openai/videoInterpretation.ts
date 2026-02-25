import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'
import { normalizeInterpretationMode, type InterpretationMode } from '~/lib/interpretationMode'
import { limitTranscriptByteLength } from '~/lib/openai/getSmallSizeTranscripts'

const baseURL = (process.env.LLM_BASE_URL_DEV || process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(
  /\/+$/,
  '',
)

const openai = createOpenAI({
  baseURL,
  apiKey: process.env.LLM_API_KEY || '',
})

type OutlineChapter = {
  title: string
  start_label?: string
  end_label?: string
  coverage_points: string[]
}

type OutlineResult = {
  overview: string
  chapters: OutlineChapter[]
  coverage_audit: string[]
}

type CoverageResult = {
  one_sentence_summary: string
  coverage_points: string[]
}

type ArticleSection = {
  title: string
  anchor: string
  content: string
}

export type GeneratedChapter = {
  title: string
  time?: string
  summary: string
}

export type VideoInterpretationResult = {
  summary: string
  chapters: GeneratedChapter[]
  outline: OutlineResult
}

type StageHook = (stage: 'outline' | 'explaining') => Promise<void> | void

function normalizeTranscript(input: string, mode: InterpretationMode) {
  const text = String(input || '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  const byteLimit = mode === 'detailed' ? 18000 : 10000
  return limitTranscriptByteLength(text, byteLimit)
}

function buildSummaryFromChapters(overview: string, chapters: GeneratedChapter[]) {
  const chapterList = chapters.map((c, idx) => `- ${idx + 1}. ${c.title}${c.time ? ` (${c.time})` : ''}`).join('\n')
  return `## 学习总览\n${overview || '本视频已完成深度解读。'}\n\n## 章节目录\n${chapterList}`
}

async function generateCoverageMap(
  title: string,
  transcript: string,
  modelName: string,
  mode: InterpretationMode,
): Promise<CoverageResult> {
  const system =
    '你是一位知识压缩助手。任务是从原始字幕提取后续解读必须覆盖的关键信息点。忽略寒暄、重复和口头语。你必须只输出 JSON。'
  const isDetailed = mode === 'detailed'
  const pointRange = isDetailed ? '12-30' : '8-20'

  const buildPrompt = (retry: boolean) =>
    [
      `视频标题：${title}`,
      '',
      '输出要求（中文）：',
      '1) one_sentence_summary：一句话概括核心论点。',
      `2) coverage_points：提取必须覆盖的关键信息点列表（${pointRange}条，尽量完整但不啰嗦）。`,
      isDetailed ? '2.1) 详解模式下请优先保留数据、案例、论据与推导链中的细节点。' : '',
      '3) 仅输出 JSON，不要输出任何额外文字。',
      '4) JSON 结构：{"one_sentence_summary":"", "coverage_points":[""]}',
      retry ? '5) 重试：上次 JSON 不可解析，请仅修复为合法 JSON，不改变语义。' : '',
      '',
      '原始字幕：',
      transcript,
    ]
      .filter(Boolean)
      .join('\n')

  let lastRaw = ''
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { text } = await generateText({
      model: openai.chat(modelName),
      system,
      prompt: buildPrompt(attempt > 0),
      temperature: 0.2,
      maxOutputTokens: isDetailed ? 5000 : 3000,
    })
    lastRaw = text
    const parsed = safeParseCoverage(text)
    if (parsed) return parsed
  }

  throw new Error(`Failed to parse coverage JSON after retry. Raw head: ${String(lastRaw).slice(0, 180)}`)
}

async function generateFullArticle(
  title: string,
  transcript: string,
  coveragePoints: string[],
  modelName: string,
  mode: InterpretationMode,
): Promise<string> {
  const isDetailed = mode === 'detailed'
  const buildPrompt = (retry: boolean) =>
    [
      '你是一位深度解读编辑。请基于字幕写一篇连贯、可读性强、逻辑清晰的中文深度解读文章。',
      `视频标题：${title}`,
      '',
      '写作要求：',
      '1) 必须覆盖关键信息点，不遗漏核心内容。',
      '2) 忠于字幕事实，不编造字幕中不存在的信息。',
      '3) 允许补充必要背景解释，但不得偏离主题。',
      '4) 全文要一气呵成，段间有自然过渡，避免拼接感。',
      '5) 禁止任何寒暄、自我介绍、模板开场（例如“你好，我是……”）。',
      '6) 不要机械套用固定子结构，不要每章同构。',
      isDetailed
        ? '7) 使用 Markdown，按逻辑给出 4-8 个二级标题（##）组织全文，每节风格可以不同但要连贯。'
        : '7) 使用 Markdown，给出 3-6 个二级标题（##）组织全文，保持自然阅读节奏。',
      isDetailed
        ? '8) 当前模式为“详解”：在保证可读性的前提下，尽量保留字幕中的关键细节、论据、数据与推导过程，不要过度压缩。'
        : '',
      retry ? '9) 重试：你上次输出不完整，请完整输出一篇成文。' : '',
      '',
      '必须覆盖的关键信息点：',
      ...coveragePoints.map((p, i) => `${i + 1}. ${p}`),
      '',
      '原始字幕：',
      transcript,
    ]
      .filter(Boolean)
      .join('\n')

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { text } = await generateText({
      model: openai.chat(modelName),
      prompt: buildPrompt(attempt > 0),
      temperature: 0.4,
      maxOutputTokens: isDetailed ? 12000 : 6000,
    })

    const normalized = String(text || '').trim()
    if (normalized) return normalized
  }

  throw new Error('Empty full-article interpretation from model')
}

function splitArticleIntoSections(article: string): ArticleSection[] {
  const lines = String(article || '')
    .replace(/\r/g, '')
    .split('\n')

  const sections: ArticleSection[] = []
  let currentTitle = ''
  let currentLines: string[] = []

  const flush = () => {
    const content = currentLines.join('\n').trim()
    if (!content) return
    const title = (currentTitle || '综合解读').trim()
    const anchor =
      content
        .split(/[。！？.!?\n]/)
        .map((s) => s.trim())
        .find(Boolean) || ''
    sections.push({ title, anchor: anchor.slice(0, 36), content })
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    const heading = line.match(/^##\s+(.+)$/)
    if (heading) {
      flush()
      currentTitle = heading[1].trim()
      currentLines = []
      continue
    }
    currentLines.push(rawLine)
  }

  flush()

  if (!sections.length) {
    const text = String(article || '').trim()
    if (!text) return []
    const paragraphs = text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)

    if (paragraphs.length >= 3) {
      const chunkSize = Math.ceil(paragraphs.length / 3)
      const built: ArticleSection[] = []
      for (let i = 0; i < paragraphs.length; i += chunkSize) {
        const content = paragraphs
          .slice(i, i + chunkSize)
          .join('\n\n')
          .trim()
        if (!content) continue
        const anchor =
          content
            .split(/[。！？.!?\n]/)
            .map((s) => s.trim())
            .find(Boolean) || ''
        built.push({
          title: `第${built.length + 1}部分`,
          anchor: anchor.slice(0, 36),
          content,
        })
      }
      if (built.length) return built
    }

    const anchor =
      text
        .split(/[。！？.!?\n]/)
        .map((s) => s.trim())
        .find(Boolean) || ''
    return [{ title: '完整解读', anchor: anchor.slice(0, 36), content: text }]
  }

  return sections
}

export async function generateVideoInterpretation(
  title: string,
  transcript: string,
  options?: { onStage?: StageHook; mode?: InterpretationMode },
): Promise<VideoInterpretationResult> {
  const cleanTitle = String(title || 'Untitled video').trim()
  const modelName = process.env.LLM_MODEL || 'gpt-4o-mini'
  const mode = normalizeInterpretationMode(options?.mode)
  const cleanTranscript = normalizeTranscript(transcript, mode)

  await options?.onStage?.('outline')
  const coverage = await withTimeout(
    generateCoverageMap(cleanTitle, cleanTranscript, modelName, mode),
    90_000,
    'coverage generation timeout',
  )

  await options?.onStage?.('explaining')
  const article = await withTimeout(
    generateFullArticle(cleanTitle, cleanTranscript, coverage.coverage_points, modelName, mode),
    mode === 'detailed' ? 240_000 : 150_000,
    'full article generation timeout',
  )

  const sections = splitArticleIntoSections(article)
  if (!sections.length) {
    throw new Error('Failed to split article into sections')
  }

  const chapters: GeneratedChapter[] = sections.map((section) => ({
    title: section.title,
    time: section.anchor || undefined,
    summary: section.content,
  }))

  const summary = buildSummaryFromChapters(coverage.one_sentence_summary, chapters)
  const outline: OutlineResult = {
    overview: coverage.one_sentence_summary,
    chapters: sections.map((s) => ({
      title: s.title,
      start_label: s.anchor || undefined,
      end_label: undefined,
      coverage_points: [],
    })),
    coverage_audit: coverage.coverage_points,
  }

  return {
    summary,
    chapters,
    outline,
  }
}

function safeParseCoverage(raw: string): CoverageResult | null {
  const candidates = toJsonCandidates(raw)
  for (const candidate of candidates) {
    const parsed = parseCoverageObject(candidate)
    if (parsed) return parsed
  }
  return null
}

function toJsonCandidates(raw: string): string[] {
  const text = String(raw || '').trim()
  if (!text) return []

  const withoutFence = text
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim()
  const first = withoutFence.indexOf('{')
  const last = withoutFence.lastIndexOf('}')
  const objectSlice = first >= 0 && last > first ? withoutFence.slice(first, last + 1) : withoutFence

  const normalizedQuotes = objectSlice
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\u00a0/g, ' ')
  const noTrailingCommas = normalizedQuotes.replace(/,\s*([}\]])/g, '$1')

  return Array.from(new Set([text, withoutFence, objectSlice, normalizedQuotes, noTrailingCommas]))
}

function parseCoverageObject(candidate: string): CoverageResult | null {
  try {
    const json = JSON.parse(candidate)
    if (!json || typeof json !== 'object') return null

    const oneSentenceSummary = String((json as any).one_sentence_summary || '').trim()
    const coveragePointsRaw = Array.isArray((json as any).coverage_points) ? (json as any).coverage_points : []
    const coveragePoints = coveragePointsRaw.map((v: any) => String(v || '').trim()).filter(Boolean)

    if (!oneSentenceSummary || coveragePoints.length < 3) return null

    return {
      one_sentence_summary: oneSentenceSummary,
      coverage_points: coveragePoints,
    }
  } catch {
    return null
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs)
    promise
      .then((val) => {
        clearTimeout(timer)
        resolve(val)
      })
      .catch((err) => {
        clearTimeout(timer)
        reject(err)
      })
  })
}
