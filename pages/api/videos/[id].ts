import type { NextApiRequest, NextApiResponse } from 'next'
import { deleteVideo, getVideo } from '~/lib/repo'
import { requireUserId } from '~/lib/requestAuth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = requireUserId(req, res)
  if (!userId) return

  const { id } = req.query
  if (!id || typeof id !== 'string') {
    res.status(400).json({ error: 'Missing required parameter: id' })
    return
  }

  if (req.method === 'DELETE') {
    const exists = await getVideo(userId, id)
    if (!exists) {
      res.status(404).json({ error: 'Resource not found' })
      return
    }
    await deleteVideo(userId, id)
    res.status(204).end()
    return
  }

  res.setHeader('Allow', 'DELETE')
  res.status(405).end()
}
