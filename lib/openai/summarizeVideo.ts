import { fetchOpenAIResult, ChatGPTAgent } from '~/lib/openai/fetchOpenAIResult'
import { limitTranscriptByteLength } from '~/lib/openai/getSmallSizeTranscripts'

function utf8Bytes(input: string) {
  return Buffer.byteLength(String(input || ''), 'utf8')
}

function splitTextForSummarization(text: string, maxChunkBytes: number, maxChunks: number) {
  const normalized = String(text || '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!normalized) return []
  if (utf8Bytes(normalized) <= maxChunkBytes) return [normalized]

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
  const chunks: string[] = []
  let current = ''

  const pushCurrent = () => {
    const ready = current.trim()
    if (ready) chunks.push(ready)
    current = ''
  }

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph
    if (utf8Bytes(candidate) <= maxChunkBytes) {
      current = candidate
      continue
    }

    if (current) pushCurrent()

    if (utf8Bytes(paragraph) <= maxChunkBytes) {
      current = paragraph
      continue
    }

    const sentences = paragraph
      .split(/(?<=[。！？.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean)
    let sentenceBucket = ''
    for (const sentence of sentences) {
      const sentenceCandidate = sentenceBucket ? `${sentenceBucket} ${sentence}` : sentence
      if (utf8Bytes(sentenceCandidate) <= maxChunkBytes) {
        sentenceBucket = sentenceCandidate
      } else {
        if (sentenceBucket) chunks.push(sentenceBucket)
        sentenceBucket = limitTranscriptByteLength(sentence, maxChunkBytes)
      }
    }
    if (sentenceBucket) chunks.push(sentenceBucket)
  }

  if (current) pushCurrent()
  if (chunks.length <= maxChunks) return chunks

  const tail = chunks.slice(maxChunks - 1).join('\n\n')
  return [...chunks.slice(0, maxChunks - 1), limitTranscriptByteLength(tail, maxChunkBytes)]
}

export async function summarizeVideoText(title: string, transcript: string, videoConfig: any, apiKey?: string) {
  const safeTitle = String(title || 'Untitled video').trim()
  const cleanTranscript = String(transcript || '').trim()
  const safeTranscript = limitTranscriptByteLength(cleanTranscript, 12000)
  const outputLanguage = videoConfig?.outputLanguage || '中文'
  const model = process.env.LLM_MODEL || 'gpt-4o-mini'
  const llmApiKey = apiKey || process.env.LLM_API_KEY || ''
  const chunks = splitTextForSummarization(cleanTranscript, 12000, 12)

  if (chunks.length <= 1) {
    const prompt = [
      `视频标题：${safeTitle}`,
      '',
      '请基于以下字幕生成高密度学习摘要，要求：',
      '1) 不遗漏关键事实与结论。',
      '2) 输出包含“学习总览”和“关键要点”两部分。',
      '3) 关键要点用项目符号，避免空话。',
      `4) 输出语言：${outputLanguage}。`,
      '',
      '字幕：',
      safeTranscript,
    ].join('\n')
    const payload = {
      model,
      messages: [{ role: ChatGPTAgent.user, content: prompt }],
      max_tokens: Number(videoConfig.detailLevel) || 800,
      stream: false,
    }
    const result = await fetchOpenAIResult(payload as any, llmApiKey, videoConfig as any)
    return typeof result === 'string' ? result : JSON.stringify(result)
  }

  const partials: string[] = []
  for (let i = 0; i < chunks.length; i += 1) {
    const chunkPrompt = [
      `视频标题：${safeTitle}`,
      `这是第 ${i + 1}/${chunks.length} 段内容。`,
      '',
      '请只总结本段，输出 5-10 条关键信息点，尽量保留事实、数据、因果关系，不要空话。',
      `输出语言：${outputLanguage}。`,
      '',
      '内容：',
      chunks[i],
    ].join('\n')
    const payload = {
      model,
      messages: [{ role: ChatGPTAgent.user, content: chunkPrompt }],
      max_tokens: 900,
      stream: false,
    }
    const result = await fetchOpenAIResult(payload as any, llmApiKey, videoConfig as any)
    partials.push(typeof result === 'string' ? result : JSON.stringify(result))
  }

  const mergePrompt = [
    `视频标题：${safeTitle}`,
    `你将收到 ${partials.length} 份分段摘要，请合并为最终输出。`,
    '',
    '要求：',
    '1) 不遗漏关键事实与结论；同义内容可合并去重。',
    '2) 输出必须包含“学习总览”和“关键要点”两部分。',
    '3) 关键要点用项目符号；优先保留高价值细节（数据、结论、推导关系）。',
    `4) 输出语言：${outputLanguage}。`,
    '',
    '分段摘要：',
    ...partials.map((part, idx) => `### 第${idx + 1}段摘要\n${part}`),
  ].join('\n')

  const mergePayload = {
    model,
    messages: [{ role: ChatGPTAgent.user, content: mergePrompt }],
    max_tokens: Number(videoConfig.detailLevel) || 1200,
    stream: false,
  }
  const merged = await fetchOpenAIResult(mergePayload as any, llmApiKey, videoConfig as any)
  return typeof merged === 'string' ? merged : JSON.stringify(merged)
}
