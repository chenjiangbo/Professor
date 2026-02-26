import { normalizeInterpretationMode, type InterpretationMode } from '~/lib/interpretationMode'
import { limitTranscriptByteLength } from '~/lib/openai/getSmallSizeTranscripts'
import { generateText } from 'ai'
import { createVertexProvider, resolveVertexFallbackModel, resolveVertexModel } from '~/lib/ai/vertex'

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
  model: any,
  fallbackModel: any | null,
  mode: InterpretationMode,
): Promise<CoverageResult> {
  const isDetailed = mode === 'detailed'
  const coverageMaxOutputTokens = isDetailed ? 1800 : 1200

  const buildPrompt = (retry: boolean) =>
    [
      '你是一位知识压缩助手。任务是从原始字幕提取后续解读必须覆盖的关键信息点。忽略寒暄、重复和口头语。',
      `视频标题：${title}`,
      '',
      '输出要求（中文）：',
      '1) one_sentence_summary：一句话概括核心论点。',
      '2) coverage_points：提取核心信息点列表。请根据视频的实际信息密度动态决定条目数量（通常在10到30条之间）。不要为了凑数而拆分，也不要遗漏核心推导过程。',
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
    try {
      const { text } = await generateText({
        model,
        prompt: buildPrompt(attempt > 0),
        temperature: 0.2,
        maxOutputTokens: coverageMaxOutputTokens,
      })
      lastRaw = text
      const parsed = safeParseCoverage(text)
      if (parsed) return parsed
    } catch (e: any) {
      if (fallbackModel && isTransientConnectionError(e)) {
        try {
          const { text } = await generateText({
            model: fallbackModel,
            prompt: buildPrompt(attempt > 0),
            temperature: 0.2,
            maxOutputTokens: coverageMaxOutputTokens,
          })
          lastRaw = text
          const parsed = safeParseCoverage(text)
          if (parsed) return parsed
        } catch (fallbackError: any) {
          throw new Error(
            `Coverage model call failed: primary=${extractModelError(e)}; fallback=${extractModelError(fallbackError)}`,
          )
        }
      }
      throw new Error(`Coverage model call failed: ${extractModelError(e)}`)
    }
  }

  throw new Error(`Failed to parse coverage JSON after retry. Raw head: ${String(lastRaw).slice(0, 180)}`)
}

async function generateFullArticle(
  title: string,
  transcript: string,
  coveragePoints: string[],
  model: any,
  fallbackModel: any | null,
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
      '5) 文章风格：请像一位经验丰富的专栏作家一样行文。语言生动流畅，段落之间要有明确的逻辑承接（如因果、转折、递进），绝不能像机器列大纲一样生硬。',
      '6) 富文本排版：充分利用 Markdown 提升阅读体验。使用加粗强调核心概念或金句；遇到关键语录、重要数据结论时，使用引用块（>）高亮；适当使用无序列表（-）或有序列表（1.）梳理并列论点，但不要让全文变成纯列表。',
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
    try {
      const { text } = await generateText({
        model,
        prompt: buildPrompt(attempt > 0),
        temperature: 0.4,
        maxOutputTokens: isDetailed ? 12000 : 6000,
      })

      const normalized = String(text || '').trim()
      if (normalized) return normalized
    } catch (e: any) {
      if (fallbackModel && isTransientConnectionError(e)) {
        try {
          const { text } = await generateText({
            model: fallbackModel,
            prompt: buildPrompt(attempt > 0),
            temperature: 0.4,
            maxOutputTokens: isDetailed ? 12000 : 6000,
          })
          const normalized = String(text || '').trim()
          if (normalized) return normalized
        } catch (fallbackError: any) {
          throw new Error(
            `Article model call failed: primary=${extractModelError(e)}; fallback=${extractModelError(fallbackError)}`,
          )
        }
      }
      throw new Error(`Article model call failed: ${extractModelError(e)}`)
    }
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
  const vertex = createVertexProvider()
  const model = vertex(resolveVertexModel())
  const fallbackModelName = resolveVertexFallbackModel()
  const fallbackModel = fallbackModelName ? vertex(fallbackModelName) : null
  const mode = normalizeInterpretationMode(options?.mode)
  const cleanTranscript = normalizeTranscript(transcript, mode)
  const coverageTimeoutMs = resolveTimeoutMs('VERTEX_COVERAGE_TIMEOUT_MS', mode === 'detailed' ? 180_000 : 120_000)
  const articleTimeoutMs = resolveTimeoutMs('VERTEX_ARTICLE_TIMEOUT_MS', mode === 'detailed' ? 240_000 : 150_000)

  await options?.onStage?.('outline')
  const coverage = await withTimeout(
    generateCoverageMap(cleanTitle, cleanTranscript, model, fallbackModel, mode),
    coverageTimeoutMs,
    'coverage generation timeout',
  )

  await options?.onStage?.('explaining')
  const article = await withTimeout(
    generateFullArticle(cleanTitle, cleanTranscript, coverage.coverage_points, model, fallbackModel, mode),
    articleTimeoutMs,
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

function extractModelError(e: any): string {
  const message = String(e?.message || 'Unknown error')
  const cause = e?.cause || {}
  const body = cause?.responseBody || e?.responseBody || ''
  const status = cause?.statusCode || e?.statusCode || ''
  const detail = body ? ` body=${String(body).slice(0, 600)}` : ''
  const code = status ? ` status=${status}` : ''
  return `${message}${code}${detail}`
}

function isTransientConnectionError(e: any): boolean {
  const message = String(e?.message || '')
  const causeMessage = String(e?.cause?.message || '')
  const combined = `${message} ${causeMessage}`.toLowerCase()
  return (
    combined.includes('cannot connect to api') ||
    combined.includes('other side closed') ||
    combined.includes('socket hang up') ||
    combined.includes('econnreset') ||
    combined.includes('fetch failed') ||
    combined.includes('network')
  )
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

function resolveTimeoutMs(envName: string, fallbackMs: number): number {
  const raw = process.env[envName]
  if (!raw) return fallbackMs
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${envName} must be a positive number in milliseconds`)
  }
  return Math.floor(parsed)
}
