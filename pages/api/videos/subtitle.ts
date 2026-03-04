import type { NextApiRequest, NextApiResponse } from 'next'
import { getVideo } from '~/lib/repo'
import { requireUserId } from '~/lib/requestAuth'
import { normalizeAppLanguage } from '~/lib/i18n'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = requireUserId(req, res)
  if (!userId) return

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    res.status(405).end()
    return
  }

  const { id, lang } = req.query
  if (!id || typeof id !== 'string') {
    res.status(400).json({ error: 'Missing required parameter: id' })
    return
  }

  const language = typeof lang === 'string' ? normalizeAppLanguage(lang) : undefined
  const video = await getVideo(userId, id, language)
  if (!video) {
    res.status(404).json({ error: 'Resource not found' })
    return
  }
  if (!video.transcript) {
    res.status(404).json({ error: 'No exportable source text' })
    return
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="subtitle-${id}.txt"`)
  res.status(200).send(video.transcript)
}
