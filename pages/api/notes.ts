import type { NextApiRequest, NextApiResponse } from 'next'
import { addNote, listNotes } from '~/lib/repo'
import { isOwnershipError } from '~/lib/repo-errors'
import { requireUserId } from '~/lib/requestAuth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = requireUserId(req, res)
  if (!userId) return

  if (req.method === 'GET') {
    const { notebookId, videoId } = req.query
    const data = await listNotes(userId, {
      notebookId: typeof notebookId === 'string' ? notebookId : undefined,
      videoId: typeof videoId === 'string' ? videoId : undefined,
    })
    res.status(200).json(data)
    return
  }

  if (req.method === 'POST') {
    const { notebookId, videoId, title, body } = req.body || {}
    if (!notebookId || !body) {
      res.status(400).json({ error: 'Missing required parameters: notebookId and body' })
      return
    }
    try {
      const created = await addNote(userId, { notebookId, videoId, title, body })
      res.status(201).json(created)
    } catch (error) {
      if (isOwnershipError(error)) {
        res.status(404).json({ error: (error as Error).message })
        return
      }
      throw error
    }
    return
  }

  res.setHeader('Allow', 'GET,POST')
  res.status(405).end()
}
