import type { NextApiRequest, NextApiResponse } from 'next'
import { listVideos } from '~/lib/repo'
import { requireUserId } from '~/lib/requestAuth'
import { normalizeAppLanguage } from '~/lib/i18n'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = requireUserId(req, res)
  if (!userId) return

  const { id } = req.query
  if (!id || typeof id !== 'string') {
    res.status(400).json({ error: 'Missing required parameter: id' })
    return
  }
  if (req.method === 'GET') {
    const language = typeof req.query.lang === 'string' ? normalizeAppLanguage(req.query.lang) : undefined
    const data = await listVideos(userId, id, language)
    res.status(200).json(data)
    return
  }
  res.setHeader('Allow', 'GET')
  res.status(405).end()
}
