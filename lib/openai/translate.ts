import { generateText } from 'ai'
import { createVertexProvider, resolveVertexInterpretationCoverageModel } from '~/lib/ai/vertex'
import type { AppLanguage } from '~/lib/i18n'

function targetLanguageLabel(language: AppLanguage) {
  return language === 'zh-CN' ? 'Simplified Chinese (zh-CN)' : 'English (en-US)'
}

export async function translateTranscriptToLanguage(
  title: string,
  transcript: string,
  targetLanguage: AppLanguage,
): Promise<string> {
  const source = String(transcript || '').trim()
  if (!source) {
    throw new Error('Transcript is empty, cannot translate')
  }

  const vertex = createVertexProvider()
  const model = vertex(resolveVertexInterpretationCoverageModel())
  const prompt = [
    'You are a professional transcript translator.',
    `Video title: ${String(title || 'Untitled video').trim()}`,
    `Translate the transcript into ${targetLanguageLabel(targetLanguage)}.`,
    'Rules:',
    '1) Preserve meaning and technical accuracy.',
    '2) Keep line breaks where reasonable for readability.',
    '3) Do not summarize, omit, or add content.',
    '4) Output translated transcript only.',
    '',
    'Transcript:',
    source,
  ].join('\n')

  const { text } = await generateText({
    model,
    prompt,
    temperature: 0,
    maxOutputTokens: 12000,
    maxRetries: 0,
  })

  const translated = String(text || '').trim()
  if (!translated) {
    throw new Error('Transcript translation returned empty output')
  }
  return translated
}
