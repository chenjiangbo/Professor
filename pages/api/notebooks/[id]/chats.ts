import type { NextApiRequest, NextApiResponse } from 'next'
import { pool } from '~/lib/db'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query // notebookId

  if (req.method === 'GET') {
    if (!id) {
      res.status(400).json({ error: 'Notebook ID required' })
      return
    }

    try {
      const rawVideoId = Array.isArray(req.query.videoId) ? req.query.videoId[0] : req.query.videoId
      const videoId = typeof rawVideoId === 'string' && rawVideoId.trim() ? rawVideoId.trim() : ''
      const result = videoId
        ? await pool.query(
            `SELECT * FROM chat_messages
                     WHERE notebook_id = $1
                       AND video_ids ? $2
                     ORDER BY created_at ASC`,
            [id, videoId],
          )
        : await pool.query(
            `SELECT * FROM chat_messages
                     WHERE notebook_id = $1
                     ORDER BY created_at ASC`,
            [id],
          )
      res.status(200).json(result.rows)
    } catch (e: any) {
      console.error('Fetch chats error', e)
      res.status(500).json({ error: e.message })
    }
    return
  }

  res.setHeader('Allow', 'GET')
  res.status(405).end()
}
