import type { NextApiRequest, NextApiResponse } from 'next'
import { createNotebook, listNotebooks } from '~/lib/repo'

function withNotebookTimestamps(row: any) {
  return {
    ...row,
    createdAt: row?.created_at || row?.createdAt || null,
    updatedAt: row?.updated_at || row?.updatedAt || null,
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const data = await listNotebooks()
    res.status(200).json(data.map(withNotebookTimestamps))
    return
  }
  if (req.method === 'POST') {
    const { title, description } = req.body || {}
    if (!title) {
      res.status(400).json({ error: '缺少参数 title' })
      return
    }
    const created = await createNotebook({ title, description })
    res.status(201).json(withNotebookTimestamps(created))
    return
  }
  res.setHeader('Allow', 'GET,POST')
  res.status(405).end()
}
