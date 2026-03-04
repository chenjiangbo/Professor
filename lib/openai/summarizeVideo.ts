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
  const outputLanguage = videoConfig?.outputLanguage || 'English'
  const model = process.env.LLM_MODEL || 'gpt-4o-mini'
  const llmApiKey = apiKey || process.env.LLM_API_KEY || ''
  const chunks = splitTextForSummarization(cleanTranscript, 12000, 12)

  if (chunks.length <= 1) {
    const prompt = [
      `Video title: ${safeTitle}`,
      '',
      'Generate a dense learning summary from the transcript below.',
      'Requirements:',
      '1) Do not miss key facts or conclusions.',
      '2) Output must contain "Learning Overview" and "Key Points".',
      '3) Key Points should use bullets and avoid vague statements.',
      `4) Output language: ${outputLanguage}.`,
      '',
      'Transcript:',
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
      `Video title: ${safeTitle}`,
      `This is chunk ${i + 1}/${chunks.length}.`,
      '',
      'Summarize only this chunk in 5-10 key points.',
      'Preserve facts, data, and causal relationships where possible.',
      `Output language: ${outputLanguage}.`,
      '',
      'Content:',
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
    `Video title: ${safeTitle}`,
    `You will receive ${partials.length} chunk summaries. Merge them into a final output.`,
    '',
    'Requirements:',
    '1) Do not miss key facts or conclusions; deduplicate synonymous points.',
    '2) Output must contain "Learning Overview" and "Key Points".',
    '3) Key Points should use bullets and prioritize high-value details (data, conclusions, reasoning links).',
    `4) Output language: ${outputLanguage}.`,
    '',
    'Chunk summaries:',
    ...partials.map((part, idx) => `### Chunk ${idx + 1}\n${part}`),
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
