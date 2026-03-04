import type { NextApiRequest, NextApiResponse } from 'next'
import { getVideo, updateVideoForUser, upsertVideoLocalization } from '~/lib/repo'
import { generateVideoInterpretation } from '~/lib/openai/videoInterpretation'
import { requireUserId } from '~/lib/requestAuth'
import { parseRequiredAppLanguage } from '~/lib/i18n'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = requireUserId(req, res)
  if (!userId) return

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).end()
    return
  }
  const { id } = req.query
  const { detailLevel = 600, showEmoji = true, outlineLevel = 1, sentenceNumber = 5, outputLanguage } = req.body || {}

  if (!id || typeof id !== 'string') {
    res.status(400).json({ error: 'Missing required parameter: id' })
    return
  }

  try {
    let contentLanguage: 'zh-CN' | 'en-US'
    try {
      contentLanguage = parseRequiredAppLanguage((req.body || {}).contentLanguage)
    } catch (e: any) {
      res.status(400).json({ error: e?.message || 'Invalid contentLanguage' })
      return
    }
    const video = await getVideo(userId, id, contentLanguage)
    if (!video) {
      res.status(404).json({ error: 'Resource not found' })
      return
    }

    if (!video.transcript) {
      res.status(400).json({ error: 'No source text available for summarization' })
      return
    }
    let summary = ''
    let chapters: string | null = null
    try {
      const interpretation = await generateVideoInterpretation(video.title, video.transcript, {
        language: contentLanguage,
      })
      summary = interpretation.summary
      chapters = JSON.stringify(interpretation.chapters)
    } catch (e: any) {
      const message = e?.message || 'Unknown outline generation error'
      await updateVideoForUser(userId, id, {
        status: 'error',
        last_error: message,
        summary: `Outline generation failed: ${message}`,
      })
      await upsertVideoLocalization(id, contentLanguage, {
        status: 'error',
        last_error: message,
        summary: `Outline generation failed: ${message}`,
      })
      res.status(422).json({ error: message })
      return
    }
    const updated = await updateVideoForUser(userId, id, { summary, chapters, status: 'ready', last_error: null })
    await upsertVideoLocalization(id, contentLanguage, { summary, chapters, status: 'ready', last_error: null })
    res.status(200).json(updated)
  } catch (e: any) {
    console.error('summarize failed', e.message)
    res.status(500).json({ error: e.message })
  }
}
