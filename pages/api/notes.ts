import type { NextApiRequest, NextApiResponse } from 'next'
import { addNote, listNotes } from '~/lib/repo'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const { notebookId, videoId } = req.query
    const data = await listNotes({
      notebookId: typeof notebookId === 'string' ? notebookId : undefined,
      videoId: typeof videoId === 'string' ? videoId : undefined,
    })
    res.status(200).json(data)
    return
  }

  if (req.method === 'POST') {
    const { notebookId, videoId, title, body } = req.body || {}
    if (!notebookId || !body) {
      res.status(400).json({ error: '缺少必要参数：notebookId 和 body' })
      return
    }
    const created = await addNote({ notebookId, videoId, title, body })
    res.status(201).json(created)
    return
  }

  res.setHeader('Allow', 'GET,POST')
  res.status(405).end()
}
