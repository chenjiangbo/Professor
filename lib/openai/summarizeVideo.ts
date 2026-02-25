import { fetchOpenAIResult, ChatGPTAgent } from '~/lib/openai/fetchOpenAIResult'
import { limitTranscriptByteLength } from '~/lib/openai/getSmallSizeTranscripts'

export async function summarizeVideoText(title: string, transcript: string, videoConfig: any, apiKey?: string) {
  const safeTitle = String(title || 'Untitled video').trim()
  const safeTranscript = limitTranscriptByteLength(String(transcript || '').trim(), 12000)
  const outputLanguage = videoConfig?.outputLanguage || '中文'
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
    model: process.env.LLM_MODEL || 'gpt-4o-mini',
    messages: [{ role: ChatGPTAgent.user, content: prompt }],
    max_tokens: Number(videoConfig.detailLevel) || 800,
    stream: false,
  }

  const result = await fetchOpenAIResult(payload as any, apiKey || process.env.LLM_API_KEY || '', videoConfig as any)
  return typeof result === 'string' ? result : JSON.stringify(result)
}
