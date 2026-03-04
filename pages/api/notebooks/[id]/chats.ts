import type { NextApiRequest, NextApiResponse } from 'next'
import { pool } from '~/lib/db'
import { getNotebook } from '~/lib/repo'
import { requireUserId } from '~/lib/requestAuth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = requireUserId(req, res)
  if (!userId) return

  const { id } = req.query // notebookId

  if (req.method === 'GET') {
    if (!id) {
      res.status(400).json({ error: 'Missing Notebook ID' })
      return
    }

    try {
      if (typeof id !== 'string') {
        res.status(400).json({ error: 'Invalid Notebook ID' })
        return
      }
      const notebook = await getNotebook(userId, id)
      if (!notebook) {
        res.status(404).json({ error: 'Notebook not found' })
        return
      }

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
      const shaped = result.rows.map((row: any) => ({
        id: row.id,
        role: row.role,
        content: row.content,
        parts: [{ type: 'text', text: row.content }],
        created_at: row.created_at,
      }))
      res.status(200).json(shaped)
    } catch (e: any) {
      console.error('Fetch chats error', e)
      res.status(500).json({ error: e.message })
    }
    return
  }

  res.setHeader('Allow', 'GET')
  res.status(405).end()
}
