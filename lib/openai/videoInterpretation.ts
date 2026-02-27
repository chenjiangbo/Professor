import { normalizeInterpretationMode, type InterpretationMode } from '~/lib/interpretationMode'
import { limitTranscriptByteLength } from '~/lib/openai/getSmallSizeTranscripts'
import { generateText } from 'ai'
import {
  createVertexProvider,
  resolveVertexInterpretationArticleModel,
  resolveVertexInterpretationCoverageModel,
} from '~/lib/ai/vertex'

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
  const chapterList = chapters.map((c, idx) => `- ${idx + 1}. ${c.title}`).join('\n')
  return `## 学习总览\n${overview || '本视频已完成深度解读。'}\n\n## 章节目录\n${chapterList}`
}

async function generateCoverageMap(
  title: string,
  transcript: string,
  model: any,
  mode: InterpretationMode,
): Promise<CoverageResult> {
  const isDetailed = mode === 'detailed'
  const coverageMaxOutputTokens = isDetailed ? 5600 : 4200
  let retryHint = ''

  const outputContract = ['SUMMARY:', '<一句话总结>', '', 'POINTS:', '- <信息点1>', '- <信息点2>', '- <信息点3>'].join(
    '\n',
  )

  const buildPrompt = (retryHint?: string) =>
    [
      '你是一位知识压缩助手。任务是从原始字幕提取后续解读必须覆盖的关键信息点。忽略寒暄、重复和口头语。',
      `视频标题：${title}`,
      '',
      '请输出纯文本，且必须严格遵守格式协议（不要 JSON、不要 Markdown 标题、不要代码块）：',
      outputContract,
      '',
      '格式含义：',
      '- SUMMARY 行后只写一句话核心论点。',
      isDetailed
        ? '- POINTS 下输出关键信息点（建议14-24条），每条只写一个信息点，尽量不超过60字。'
        : '- POINTS 下输出关键信息点（建议10-18条），每条只写一个信息点，尽量不超过50字。',
      isDetailed ? '- 当前为详解模式：优先保留数据、案例、论据与推导链中的细节点。' : '',
      '- 不要输出任何额外说明。',
      retryHint || '',
      '',
      '原始字幕：',
      transcript,
    ]
      .filter(Boolean)
      .join('\n')

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { text } = await withModelRetry('coverage', () =>
        generateText({
          model,
          prompt: buildPrompt(attempt > 0 ? retryHint : ''),
          temperature: 0,
          maxOutputTokens: coverageMaxOutputTokens,
          maxRetries: 0,
        }),
      )

      const parsed = parseCoverageText(text)
      if (!parsed.one_sentence_summary || parsed.coverage_points.length < 1) {
        throw new Error('Coverage output missing required fields after parsing')
      }
      return parsed
    } catch (e: any) {
      const finishReason = String(e?.finishReason || '')
      const causeMessage = String(e?.cause?.message || e?.message || '')
      const isLikelyTruncated =
        finishReason === 'length' || /truncated|incomplete|empty response|could not parse/i.test(causeMessage)
      retryHint = isLikelyTruncated
        ? '重试：上次输出疑似被截断。请显著压缩措辞，并完整输出 SUMMARY 与 POINTS。'
        : '重试：请保持语义一致，仅修复格式，严格输出 SUMMARY 与 POINTS。'
      if (attempt === 1) {
        throw new Error(`Coverage model call failed: ${extractModelError(e)}`)
      }
    }
  }

  throw new Error('Coverage model call failed: unknown error')
}

function parseCoverageText(raw: string): CoverageResult {
  const text = String(raw || '')
    .replace(/\r/g, '')
    .trim()
  if (!text) {
    throw new Error('Coverage output is empty')
  }

  const summaryMatch = text.match(/(?:^|\n)SUMMARY:\s*([\s\S]*?)(?:\n\s*POINTS:|$)/i)
  const summary = String(summaryMatch?.[1] || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .trim()

  const pointsBlockMatch = text.match(/(?:^|\n)POINTS:\s*([\s\S]*)$/i)
  const pointsBlock = String(pointsBlockMatch?.[1] || '').trim()
  const points = pointsBlock
    .split('\n')
    .map((line) => line.trim())
    .map((line) => line.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean)

  if (!summary) {
    throw new Error('Coverage output missing SUMMARY section')
  }
  if (points.length < 1) {
    throw new Error('Coverage output missing POINTS section')
  }

  return {
    one_sentence_summary: summary,
    coverage_points: points,
  }
}

async function generateFullArticle(
  title: string,
  transcript: string,
  coveragePoints: string[],
  model: any,
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
      const { text } = await withModelRetry('article', () =>
        generateText({
          model,
          prompt: buildPrompt(attempt > 0),
          temperature: 0.4,
          maxOutputTokens: isDetailed ? 12000 : 6000,
          maxRetries: 0,
        }),
      )

      const normalized = String(text || '').trim()
      if (normalized) return normalized
    } catch (e: any) {
      if (attempt === 1) {
        throw new Error(`Article model call failed: ${extractModelError(e)}`)
      }
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
  const coverageModel = vertex(resolveVertexInterpretationCoverageModel())
  const articleModel = vertex(resolveVertexInterpretationArticleModel())
  const mode = normalizeInterpretationMode(options?.mode)
  const cleanTranscript = normalizeTranscript(transcript, mode)
  const coverageTimeoutMs = resolveTimeoutMs('VERTEX_COVERAGE_TIMEOUT_MS', mode === 'detailed' ? 180_000 : 120_000)
  const articleTimeoutMs = resolveTimeoutMs('VERTEX_ARTICLE_TIMEOUT_MS', mode === 'detailed' ? 240_000 : 150_000)

  await options?.onStage?.('outline')
  const coverage = await withTimeout(
    generateCoverageMap(cleanTitle, cleanTranscript, coverageModel, mode),
    coverageTimeoutMs,
    'coverage generation timeout',
  )

  await options?.onStage?.('explaining')
  const article = await withTimeout(
    generateFullArticle(cleanTitle, cleanTranscript, coverage.coverage_points, articleModel, mode),
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

function extractModelError(e: any): string {
  const message = String(e?.message || 'Unknown error')
  const cause = e?.cause || {}
  const body = cause?.responseBody || e?.responseBody || ''
  const status = cause?.statusCode || e?.statusCode || ''
  const finishReason = e?.finishReason ? ` finishReason=${String(e.finishReason)}` : ''
  const textHead = e?.text ? ` text=${String(e.text).slice(0, 240)}` : ''
  const causeMessage = cause?.message ? ` cause=${String(cause.message).slice(0, 260)}` : ''
  const detail = body ? ` body=${String(body).slice(0, 600)}` : ''
  const code = status ? ` status=${status}` : ''
  return `${message}${code}${finishReason}${causeMessage}${textHead}${detail}`
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

async function withModelRetry<T>(stage: 'coverage' | 'article', call: () => Promise<T>): Promise<T> {
  const maxAttempts = resolvePositiveIntEnv('VERTEX_MODEL_MAX_ATTEMPTS', 3)
  const baseDelayMs = resolvePositiveIntEnv('VERTEX_MODEL_RETRY_BASE_DELAY_MS', 1000)
  const maxDelayMs = resolvePositiveIntEnv('VERTEX_MODEL_RETRY_MAX_DELAY_MS', 8000)

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await call()
    } catch (e: any) {
      const retryable = isRetryableModelError(e)
      const hasNext = attempt < maxAttempts
      const willRetry = retryable && hasNext
      const delayMs = willRetry ? Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1)) : 0
      logModelError(stage, attempt, e, willRetry, delayMs)

      if (!willRetry) throw e
      await sleep(delayMs)
    }
  }

  throw new Error(`${stage} model call failed: exhausted retries`)
}

function isRetryableModelError(e: any): boolean {
  const status = Number(e?.statusCode || e?.cause?.statusCode || 0)
  if (status === 429) return true
  if (status >= 500 && status < 600) return true

  const text = `${String(e?.message || '')} ${String(e?.cause?.message || '')}`.toLowerCase()
  return (
    text.includes('rate limit') ||
    text.includes('resource exhausted') ||
    text.includes('quota') ||
    text.includes('too many requests') ||
    text.includes('temporarily unavailable')
  )
}

function logModelError(
  stage: 'coverage' | 'article',
  attempt: number,
  e: any,
  willRetry: boolean,
  retryDelayMs: number,
) {
  const statusCode = Number(e?.statusCode || e?.cause?.statusCode || 0) || null
  const bodyRaw = e?.cause?.responseBody || e?.responseBody || ''
  const parsed = parseErrorBody(bodyRaw)

  const payload = {
    stage,
    attempt,
    willRetry,
    retryDelayMs,
    statusCode,
    finishReason: e?.finishReason || null,
    message: String(e?.message || ''),
    causeMessage: String(e?.cause?.message || ''),
    errorMessage: parsed.message,
    errorDetails: parsed.details,
    errorBody: parsed.bodyHead,
  }
  console.error(`[vertex-llm-error] ${JSON.stringify(payload)}`)
}

function parseErrorBody(raw: unknown): { message: string | null; details: unknown[]; bodyHead: string } {
  const bodyHead = String(raw || '').slice(0, 2000)
  if (!bodyHead) {
    return { message: null, details: [], bodyHead: '' }
  }

  try {
    const parsed = JSON.parse(bodyHead)
    const errorObj = (parsed as any)?.error || {}
    const details = Array.isArray(errorObj?.details) ? errorObj.details : []
    return {
      message: errorObj?.message ? String(errorObj.message) : null,
      details,
      bodyHead,
    }
  } catch {
    return { message: null, details: [], bodyHead }
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
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

function resolvePositiveIntEnv(envName: string, fallback: number): number {
  const raw = process.env[envName]
  if (!raw) return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${envName} must be a positive number`)
  }
  return Math.floor(parsed)
}
