import type { NextApiRequest, NextApiResponse } from 'next'
import { deleteVideo, getVideo } from '~/lib/repo'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query
  if (!id || typeof id !== 'string') {
    res.status(400).json({ error: 'id required' })
    return
  }

  if (req.method === 'DELETE') {
    const exists = await getVideo(id)
    if (!exists) {
      res.status(404).json({ error: 'not found' })
      return
    }
    await deleteVideo(id)
    res.status(204).end()
    return
  }

  res.setHeader('Allow', 'DELETE')
  res.status(405).end()
}
