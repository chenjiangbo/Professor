import type { NextApiRequest, NextApiResponse } from 'next'
import { deleteNotebook, getNotebook, updateNotebook } from '~/lib/repo'

function withNotebookTimestamps(row: any) {
  return {
    ...row,
    createdAt: row?.created_at || row?.createdAt || null,
    updatedAt: row?.updated_at || row?.updatedAt || null,
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query
  if (!id || typeof id !== 'string') {
    res.status(400).json({ error: '缺少参数 id' })
    return
  }
  if (req.method === 'GET') {
    const data = await getNotebook(id)
    if (!data) {
      res.status(404).json({ error: 'Notebook 不存在' })
      return
    }
    res.status(200).json(withNotebookTimestamps(data))
    return
  }
  if (req.method === 'PATCH') {
    const { title, description } = req.body || {}
    const updated = await updateNotebook(id, { title, description })
    if (!updated) {
      res.status(404).json({ error: 'Notebook 不存在' })
      return
    }
    res.status(200).json(withNotebookTimestamps(updated))
    return
  }
  if (req.method === 'DELETE') {
    await deleteNotebook(id)
    res.status(204).end()
    return
  }
  res.setHeader('Allow', 'GET,PATCH,DELETE')
  res.status(405).end()
}
