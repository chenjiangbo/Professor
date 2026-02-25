import type { NextApiRequest, NextApiResponse } from 'next'
import { listVideos } from '~/lib/repo'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query
  if (!id || typeof id !== 'string') {
    res.status(400).json({ error: 'id required' })
    return
  }
  if (req.method === 'GET') {
    const data = await listVideos(id)
    res.status(200).json(data)
    return
  }
  res.setHeader('Allow', 'GET')
  res.status(405).end()
}
