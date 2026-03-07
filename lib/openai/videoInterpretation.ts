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
  const byteLimit = mode === 'detailed' ? 90000 : 30000
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
        ? '你是一位拥有敏锐洞察力的资深主编。请对下方的原始转录进行结构化分析，为后续的深度专栏文章策划核心骨架。'
        : 'You are a senior editor with sharp judgment. Analyze the raw transcript and plan a strong structural backbone for a later in-depth column.',
      chinese ? `视频标题：${title}` : `Video title: ${title}`,
      '',
      chinese ? '原始转录：' : 'Raw transcript:',
      transcript,
      '',
      chinese ? '任务要求：' : 'Task requirements:',
      chinese
        ? '1) 提炼核心（SUMMARY）：用极简练语言概括全篇核心思想或底层逻辑。'
        : '1) Distill the core (SUMMARY): one concise sentence for the central thesis.',
      chinese
        ? '2) 策划大纲（POINTS）：提取 6-10 个核心议题，这些议题将直接作为后续专栏文章的章节标题。'
        : '2) Plan chapter topics (POINTS): extract 6-10 core themes that can directly become section titles in the final article.',
      chinese
        ? '- 拒绝平庸：不要使用“简介/背景/结论”这类无意义标题。'
        : '- Avoid generic titles like Intro/Background/Conclusion.',
      chinese
        ? '- 抓取概念：优先捕捉独特术语、比喻或反直觉观点。'
        : '- Capture signature concepts: unique terms, metaphors, or contrarian insights.',
      chinese
        ? '- 逻辑连贯：议题排列应符合原文叙事逻辑或论证层级。'
        : '- Keep logical flow: order themes by narrative or argument progression.',
      chinese
        ? '- 全文覆盖原则：必须均匀覆盖开头、中间和结尾的关键论述，严禁只总结前半部分。'
        : '- Coverage principle: you must evenly cover beginning, middle, and ending arguments; do not summarize only the first half.',
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
          ? '- POINTS 下每一行必须是一个独立的章节策划（严格 6-10 条）。'
          : '- Under POINTS:, output key information points (recommended 14-24). One point per line, concise wording.'
        : chinese
        ? '- POINTS 下每一行必须是一个独立的章节策划（严格 6-10 条）。'
        : '- Under POINTS:, output key information points (recommended 10-18). One point per line, concise wording.',
      isDetailed
        ? chinese
          ? '- 当前为详解模式：优先保留数据、案例、论据与推理链细节。'
          : '- Detailed mode: prioritize data, cases, evidence, and reasoning-chain details.'
        : '',
      chinese ? '- 不要输出任何额外说明。' : '- Do not output any extra explanation.',
      retryHint || '',
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
      const coverageHint = validateCoveragePointCount(parsed.coverage_points.length, mode, language)
      if (coverageHint) {
        const err: any = new Error(`Coverage point count validation failed: ${coverageHint}`)
        err.retryHint = coverageHint
        throw err
      }
      return parsed
    } catch (e: any) {
      if (e?.retryHint && typeof e.retryHint === 'string') {
        retryHint = e.retryHint
        if (attempt === 1) {
          throw new Error(`Coverage output validation failed: ${e?.message || 'POINTS count out of range'}`)
        }
        continue
      }
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

function validateCoveragePointCount(pointCount: number, mode: InterpretationMode, language: AppLanguage): string {
  const chinese = isChineseLanguage(language)
  const min = 6
  const max = 10
  if (pointCount < min) {
    return chinese
      ? `重试：上一次只生成了 ${pointCount} 个议题，少于最少 ${min} 个的要求。请深入挖掘内容，补充议题，并严格输出在 ${min}-${max} 个之间。`
      : `Retry: you generated only ${pointCount} themes, below the minimum ${min}. Expand your analysis and return strictly ${min}-${max} themes.`
  }
  if (pointCount > max) {
    return chinese
      ? `重试：上一次生成了 ${pointCount} 个议题，超出了上限 ${max}。请重新生成，并严格控制在 ${min}-${max} 个之间。`
      : `Retry: you generated ${pointCount} themes, above the maximum ${max}. Regenerate and keep strictly within ${min}-${max}.`
  }
  return ''
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
  const isExtract = mode === 'extract'
  const chinese = isChineseLanguage(language)
  let retryHint = ''
  const buildPrompt = (retryHint?: string) => {
    if (isExtract) {
      return [
        chinese
          ? '你是一位“知识提取专家”，不是专栏作家。'
          : 'You are a “knowledge extraction expert,” not a columnist.',
        chinese ? `视频标题：${title}` : `Video title: ${title}`,
        '',
        chinese
          ? '任务目标：基于“待覆盖的大纲议题（POINTS）”和“原始转录”，输出“极简知识提取稿”，用于快速学习。'
          : 'Goal: Using the mandatory POINTS and raw transcript, produce an ultra-concise extraction draft for fast learning.',
        '',
        chinese ? '核心原则（必须遵守）：' : 'Hard rules:',
        chinese
          ? '1) 覆盖完整：必须覆盖所有 POINTS，不遗漏核心信息。'
          : '1) Full coverage: cover every POINT; do not miss core content.',
        chinese
          ? '2) 表达极简：每个知识点只用 1-2 句话解释清楚。'
          : '2) Extreme brevity: explain each point in 1-2 short sentences only.',
        chinese
          ? '3) 大白话：用通俗语言，避免术语堆砌；若有术语，先翻成易懂说法。'
          : '3) Plain language: keep it simple; if a term is technical, immediately paraphrase it.',
        chinese
          ? '4) 不写文章：禁止寒暄、禁止开场白、禁止修辞铺陈、禁止人物引用、禁止金句风格。'
          : '4) No prose style: no greetings, no narrative opening, no rhetorical flourish, no named-person quotes.',
        chinese
          ? '5) 不扩写：不要引入与原文无关的外部背景，不做长段推演。'
          : '5) No unrelated expansion: do not inject external background unrelated to the transcript.',
        '',
        chinese ? '输出格式（严格）：' : 'Output format (strict):',
        chinese ? '- 第一行必须是：## 核心知识点' : '- First line must be: ## Key Knowledge Points',
        chinese
          ? '- 之后按以下结构逐条输出（每个 POINTS 对应一条）：'
          : '- Then for each POINT, use the structure below (one item per POINT):',
        chinese ? '### {序号}. {知识点标题}' : '### {index}. {point title}',
        chinese ? '这点在说什么：{1句大白话，必要时最多2句}' : 'What it means: {1 plain sentence, at most 2}',
        chinese ? '为什么重要：{0-1句，可省略；若写，必须通俗}' : 'Why it matters: {0-1 plain sentence, optional}',
        '',
        chinese ? '长度约束（严格）：' : 'Length limits (strict):',
        chinese
          ? '- “这点在说什么”单行建议 18-45 个汉字，最多不超过 60 个汉字。'
          : '- “What it means” should be short (about 10-22 words, hard max 30).',
        chinese
          ? '- “为什么重要”单行建议 12-35 个汉字，最多不超过 50 个汉字。'
          : '- “Why it matters” should be short (about 8-18 words, hard max 25).',
        chinese ? '- 每个知识点总共最多 2 句（不含标题行）。' : '- Max 2 sentences per point (excluding heading line).',
        retryHint || '',
        '',
        chinese ? '待覆盖的大纲议题（POINTS）：' : 'Mandatory POINTS to cover:',
        ...coveragePoints.map((p, i) => `${i + 1}. ${p}`),
        '',
        chinese ? '原始转录：' : 'Raw transcript:',
        transcript,
      ]
        .filter(Boolean)
        .join('\n')
    }

    return [
      chinese
        ? '你是一位科技与人文领域的顶级专栏作家。请基于提供的大纲和原始转录，撰写一篇深度、犀利且可读性极强的解读文章。'
        : 'You are a top-tier columnist in technology and humanities. Write a sharp, deep, and highly readable interpretation based on the outline and raw transcript.',
      chinese ? `视频标题：${title}` : `Video title: ${title}`,
      '',
      chinese ? '写作风格要求：' : 'Writing requirements:',
      chinese
        ? '1) 拒绝平庸的“助教风”：不要写成枯燥摘要或说明书，文章要有观点、有温度、有呼吸感。'
        : '1) Cover all key information points; do not miss core content.',
      chinese
        ? '2) 保留原文中的精彩比喻和反直觉洞察，独特术语要保留并解释；不要引入与原文无关的外部人物引用。'
        : '2) Keep signature insights: preserve sharp metaphors, contrarian ideas, and explain unique terms instead of flattening them; do not inject unrelated external-person references.',
      chinese
        ? '3) 流畅自然：段落间要有逻辑过渡，避免机械堆砌信息。'
        : '3) Keep natural flow: smooth transitions, no mechanical bullet-dump writing.',
      chinese
        ? '4) 可读性优化：适当使用加粗（重点）和引用（> 金句）控制阅读节奏。'
        : '4) Optimize readability with selective bold highlights and block quotes for key lines.',
      chinese ? '格式硬约束（至关重要）：' : 'Hard format constraints (critical):',
      isDetailed
        ? chinese
          ? '1) 全文必须由 6-10 个章节组成。'
          : '1) The full article must contain 6-10 sections.'
        : chinese
        ? '1) 全文必须由 4-6 个章节组成。'
        : '1) The full article must contain 4-6 sections.',
      chinese
        ? '2) 文章第一行必须是二级标题（## 标题名）。'
        : '2) The first line must be a level-2 heading (## Heading).',
      chinese
        ? '3) 严禁在第一个 ## 标题之前输出任何前言、导语或寒暄。'
        : '3) Do not output any preface before the first ## heading.',
      chinese
        ? '4) 如需开篇背景，请命名为“## 引言：<核心议题>”或直接融入第一章节。'
        : '4) If you need context, write it as a titled first section (for example: ## Introduction: ...).',
      chinese
        ? '5) 章节应覆盖下方大纲议题，保持逻辑完整。'
        : '5) Ensure sections cover the outline themes below with coherent logic.',
      chinese
        ? isDetailed
          ? '6) 当前为详解模式：尽量保留细节、证据、数据与推导过程。'
          : ''
        : isDetailed
        ? '6) Detailed mode: preserve key details, evidence, data points, and reasoning steps.'
        : '',
      retryHint || '',
      '',
      chinese ? '待覆盖的大纲议题（POINTS）：' : 'Mandatory key points to cover:',
      ...coveragePoints.map((p, i) => `${i + 1}. ${p}`),
      '',
      chinese ? '原始转录：' : 'Raw transcript:',
      transcript,
    ]
      .filter(Boolean)
      .join('\n')
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { text } = await withModelRetry('article', () =>
        generateText({
          model,
          prompt: buildPrompt(attempt > 0 ? retryHint : ''),
          temperature: isExtract ? 0.25 : 0.4,
          maxOutputTokens: isDetailed ? 15000 : isExtract ? 9000 : 8000,
          maxRetries: 0,
        }),
      )

      const normalized = String(text || '').trim()
      if (!normalized) {
        throw new Error('Empty full-article interpretation from model')
      }
      const structureHint = validateArticleStructure(normalized, mode, language)
      if (structureHint) {
        const err: any = new Error(`Article structure validation failed: ${structureHint}`)
        err.retryHint = structureHint
        throw err
      }
      return normalized
    } catch (e: any) {
      if (e?.retryHint && typeof e.retryHint === 'string') {
        retryHint = e.retryHint
        if (attempt === 1) {
          throw new Error(`Article output validation failed: ${e?.message || 'invalid structure'}`)
        }
        continue
      }
      if (attempt === 1) {
        throw new Error(`Article model call failed: ${extractModelError(e)}`)
      }
      retryHint = chinese
        ? '重试：你上次输出不完整或格式不合规。请严格遵守格式硬约束并输出完整文章。'
        : 'Retry: previous output was incomplete. Return a complete article.'
    }
  }

  throw new Error('Empty full-article interpretation from model')
}

function validateArticleStructure(article: string, mode: InterpretationMode, language: AppLanguage): string {
  const chinese = isChineseLanguage(language)
  const normalizedArticle = String(article || '').replace(/\r/g, '')
  const firstNonEmpty = normalizedArticle
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean)

  if (!firstNonEmpty || !/^##\s+\S+/.test(firstNonEmpty)) {
    return chinese
      ? '重试：上一次输出格式错误，第一行未检测到二级标题。请严格以 ## 标题 开始，并且第一个 ## 之前不要输出任何文字。'
      : 'Retry: format error. The first line did not start with a level-2 heading. Start strictly with ## Heading and output nothing before it.'
  }

  const headingCount =
    mode === 'extract'
      ? (normalizedArticle.match(/^###\s+\S+/gm) || []).length
      : (normalizedArticle.match(/^##\s+\S+/gm) || []).length
  const min = mode === 'detailed' ? 6 : mode === 'extract' ? 6 : 4
  const max = mode === 'detailed' ? 10 : mode === 'extract' ? 12 : 6
  const headingLabel = chinese
    ? mode === 'extract'
      ? '知识点'
      : '章节'
    : mode === 'extract'
    ? 'knowledge points'
    : 'sections'
  if (headingCount < min) {
    return chinese
      ? `重试：上一次只生成了 ${headingCount} 个${headingLabel}，少于最少 ${min} 个的要求。请补全并严格控制在 ${min}-${max} 个之间。`
      : `Retry: only ${headingCount} ${headingLabel} were generated, below minimum ${min}. Expand and keep strictly within ${min}-${max}.`
  }
  if (headingCount > max) {
    return chinese
      ? `重试：上一次生成了 ${headingCount} 个${headingLabel}，超出了上限 ${max}。请压缩并严格控制在 ${min}-${max} 个之间。`
      : `Retry: ${headingCount} ${headingLabel} were generated, above maximum ${max}. Compress and keep strictly within ${min}-${max}.`
  }
  return ''
}

function splitArticleIntoSections(article: string): ArticleSection[] {
  const normalizedArticle = String(article || '').replace(/\r/g, '')
  const extractSubheadings = normalizedArticle.match(/^###\s+\S+/gm) || []
  if (extractSubheadings.length > 0) {
    const extractSections: ArticleSection[] = []
    let currentTitle = ''
    let currentLines: string[] = []

    const flushExtract = () => {
      const content = currentLines.join('\n').trim()
      if (!content || !currentTitle) return
      const anchor =
        content
          .split(/[。！？.!?\n]/)
          .map((s) => s.trim())
          .find(Boolean) || ''
      extractSections.push({ title: currentTitle.trim(), anchor: anchor.slice(0, 36), content })
    }

    for (const rawLine of normalizedArticle.split('\n')) {
      const line = rawLine.trim()
      const subheading = line.match(/^###\s+(.+)$/)
      if (subheading) {
        flushExtract()
        currentTitle = subheading[1].trim()
        currentLines = []
        continue
      }
      if (!currentTitle) continue
      currentLines.push(rawLine)
    }

    flushExtract()
    if (extractSections.length) return extractSections
  }

  const lines = normalizedArticle.split('\n')

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
  const retryableHints = [
    'rate limit',
    'resource exhausted',
    'quota',
    'too many requests',
    'temporarily unavailable',
    'cannot connect to api',
    'other side closed',
    'socket hang up',
    'connection reset',
    'econnreset',
    'etimedout',
    'fetch failed',
  ]
  return retryableHints.some((hint) => text.includes(hint))
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
