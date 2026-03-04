import type { NextApiRequest, NextApiResponse } from 'next'
import { createNotebook, listNotebooks } from '~/lib/repo'
import { requireUserId } from '~/lib/requestAuth'

function withNotebookTimestamps(row: any) {
  return {
    ...row,
    createdAt: row?.created_at || row?.createdAt || null,
    updatedAt: row?.updated_at || row?.updatedAt || null,
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = requireUserId(req, res)
  if (!userId) return

  if (req.method === 'GET') {
    const data = await listNotebooks(userId)
    res.status(200).json(data.map(withNotebookTimestamps))
    return
  }
  if (req.method === 'POST') {
    const { title, description } = req.body || {}
    if (!title) {
      res.status(400).json({ error: 'Missing required parameter: title' })
      return
    }
    const created = await createNotebook(userId, { title, description })
    res.status(201).json(withNotebookTimestamps(created))
    return
  }
  res.setHeader('Allow', 'GET,POST')
  res.status(405).end()
}
