import { normalizeInterpretationMode, type InterpretationMode } from '~/lib/interpretationMode'
import { limitTranscriptByteLength } from '~/lib/openai/getSmallSizeTranscripts'
import { generateText } from 'ai'
import { isChineseLanguage, type AppLanguage } from '~/lib/i18n'
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

function buildSummaryFromChapters(overview: string, chapters: GeneratedChapter[], language: AppLanguage) {
  const chapterList = chapters.map((c, idx) => `- ${idx + 1}. ${c.title}`).join('\n')
  if (isChineseLanguage(language)) {
    return `## 学习总览\n${overview || '该视频已完成深度解读。'}\n\n## 章节目录\n${chapterList}`
  }
  return `## Learning Overview\n${
    overview || 'Deep interpretation completed for this video.'
  }\n\n## Chapter Index\n${chapterList}`
}

async function generateCoverageMap(
  title: string,
  transcript: string,
  model: any,
  mode: InterpretationMode,
  language: AppLanguage,
): Promise<CoverageResult> {
  const isDetailed = mode === 'detailed'
  const coverageMaxOutputTokens = isDetailed ? 5600 : 4200
  let retryHint = ''
  const chinese = isChineseLanguage(language)

  const outputContract = chinese
    ? ['SUMMARY:', '<一句话总结>', '', 'POINTS:', '- <信息点1>', '- <信息点2>', '- <信息点3>'].join('\n')
    : ['SUMMARY:', '<one-sentence summary>', '', 'POINTS:', '- <point 1>', '- <point 2>', '- <point 3>'].join('\n')

  const buildPrompt = (retryHint?: string) =>
    [
      chinese
        ? '你是一位知识压缩助手。提取后续解读必须覆盖的关键信息点，忽略寒暄、重复与口头语。'
        : 'You are a knowledge compression assistant. Extract key information points that must be covered in the later interpretation. Ignore greetings, repetition, and filler speech.',
      chinese ? `视频标题：${title}` : `Video title: ${title}`,
      '',
      chinese
        ? '输出纯文本，并严格遵守以下格式（不要 JSON、不要 Markdown 标题、不要代码块）：'
        : 'Output plain text and strictly follow this format contract (no JSON, no Markdown headings, no code fences):',
      outputContract,
      '',
      chinese ? '格式说明：' : 'Format meaning:',
      chinese ? '- SUMMARY 后只写一句核心观点。' : '- After SUMMARY:, write only one sentence with the core thesis.',
      isDetailed
        ? chinese
          ? '- POINTS 下输出关键信息点（建议 14-24 条），每行一个信息点。'
          : '- Under POINTS:, output key information points (recommended 14-24). One point per line, concise wording.'
        : chinese
        ? '- POINTS 下输出关键信息点（建议 10-18 条），每行一个信息点。'
        : '- Under POINTS:, output key information points (recommended 10-18). One point per line, concise wording.',
      isDetailed
        ? chinese
          ? '- 当前为详解模式：优先保留数据、案例、论据与推理链细节。'
          : '- Detailed mode: prioritize data, cases, evidence, and reasoning-chain details.'
        : '',
      chinese ? '- 不要输出任何额外说明。' : '- Do not output any extra explanation.',
      retryHint || '',
      '',
      chinese ? '原始转录：' : 'Raw transcript:',
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
        ? chinese
          ? '重试：上次输出疑似被截断。请压缩措辞并完整输出 SUMMARY 与 POINTS。'
          : 'Retry: previous output appears truncated. Compress wording significantly and fully output SUMMARY and POINTS.'
        : chinese
        ? '重试：保持语义不变，仅修复格式并严格输出 SUMMARY 与 POINTS。'
        : 'Retry: keep semantics unchanged, fix only format, and strictly output SUMMARY and POINTS.'
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
  language: AppLanguage,
): Promise<string> {
  const isDetailed = mode === 'detailed'
  const chinese = isChineseLanguage(language)
  const buildPrompt = (retry: boolean) =>
    [
      chinese
        ? '你是一位深度解读编辑。请基于转录写一篇连贯、清晰、可读性强的深度文章。'
        : 'You are a deep-interpretation editor. Write a coherent, readable, and logically clear in-depth article based on the transcript.',
      chinese ? `视频标题：${title}` : `Video title: ${title}`,
      '',
      chinese ? '写作要求：' : 'Writing requirements:',
      chinese
        ? '1) 必须覆盖关键信息点，不遗漏核心内容。'
        : '1) Cover all key information points; do not miss core content.',
      chinese ? '2) 忠于转录事实，不得编造细节。' : '2) Stay faithful to transcript facts; do not fabricate details.',
      chinese
        ? '3) 可补充必要背景解释，但不得偏离主题。'
        : '3) You may add necessary background explanations without drifting off-topic.',
      chinese
        ? '4) 全文保持自然连贯，段落间有清晰过渡。'
        : '4) Keep the article flowing naturally with smooth transitions between paragraphs.',
      chinese
        ? '5) 风格应像成熟专栏作者，避免机械化罗列。'
        : '5) Style: write like an experienced columnist, not like a mechanical outline dump.',
      chinese
        ? '6) 使用 Markdown 增强可读性：可加粗重点、引用关键句、适度使用列表。'
        : '6) Use Markdown for readability: bold key concepts, use blockquotes (>) for notable quotes/data, and lists where appropriate without turning the whole article into lists.',
      isDetailed
        ? chinese
          ? '7) 使用 Markdown，并用 4-8 个二级标题（##）组织全文。'
          : '7) Use Markdown with 4-8 level-2 headings (##) to organize the article logically.'
        : chinese
        ? '7) 使用 Markdown，并用 3-6 个二级标题（##）组织全文。'
        : '7) Use Markdown with 3-6 level-2 headings (##) and a natural reading rhythm.',
      isDetailed
        ? chinese
          ? '8) 当前为详解模式：在保证可读性前提下尽量保留细节、证据、数据与推理过程。'
          : '8) Detailed mode: preserve critical details, evidence, data, and reasoning steps while keeping readability.'
        : '',
      retry
        ? chinese
          ? '9) 重试：上次输出不完整，请输出完整文章。'
          : '9) Retry: previous output was incomplete. Return a complete article.'
        : '',
      '',
      chinese ? '必须覆盖的关键信息点：' : 'Mandatory key points to cover:',
      ...coveragePoints.map((p, i) => `${i + 1}. ${p}`),
      '',
      chinese ? '原始转录：' : 'Raw transcript:',
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
    const title = (currentTitle || 'Integrated Interpretation').trim()
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
          title: `Part ${built.length + 1}`,
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
    return [{ title: 'Full Interpretation', anchor: anchor.slice(0, 36), content: text }]
  }

  return sections
}

export async function generateVideoInterpretation(
  title: string,
  transcript: string,
  options?: { onStage?: StageHook; mode?: InterpretationMode; language?: AppLanguage },
): Promise<VideoInterpretationResult> {
  const cleanTitle = String(title || 'Untitled video').trim()
  const vertex = createVertexProvider()
  const coverageModel = vertex(resolveVertexInterpretationCoverageModel())
  const articleModel = vertex(resolveVertexInterpretationArticleModel())
  const mode = normalizeInterpretationMode(options?.mode)
  const language: AppLanguage = options?.language || 'en-US'
  const cleanTranscript = normalizeTranscript(transcript, mode)
  const coverageTimeoutMs = resolveTimeoutMs('VERTEX_COVERAGE_TIMEOUT_MS', mode === 'detailed' ? 180_000 : 120_000)
  const articleTimeoutMs = resolveTimeoutMs('VERTEX_ARTICLE_TIMEOUT_MS', mode === 'detailed' ? 240_000 : 150_000)

  await options?.onStage?.('outline')
  const coverage = await withTimeout(
    generateCoverageMap(cleanTitle, cleanTranscript, coverageModel, mode, language),
    coverageTimeoutMs,
    'coverage generation timeout',
  )

  await options?.onStage?.('explaining')
  const article = await withTimeout(
    generateFullArticle(cleanTitle, cleanTranscript, coverage.coverage_points, articleModel, mode, language),
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

  const summary = buildSummaryFromChapters(coverage.one_sentence_summary, chapters, language)
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
