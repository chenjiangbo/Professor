import type { NextApiRequest, NextApiResponse } from 'next'
import { parseNotebookMultipart } from '~/lib/http/parseNotebookMultipart'
import { deleteNotebook, getNotebook, updateNotebook } from '~/lib/repo'
import { saveUploadedNotebookCover } from '~/lib/notebookCover/upload'
import { requireUserId } from '~/lib/requestAuth'

export const config = {
  api: {
    bodyParser: false,
  },
}

function withNotebookTimestamps(row: any) {
  return {
    ...row,
    createdAt: row?.created_at || row?.createdAt || null,
    updatedAt: row?.updated_at || row?.updatedAt || null,
    coverUpdatedAt: row?.cover_updated_at || row?.coverUpdatedAt || null,
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = requireUserId(req, res)
  if (!userId) return

  const { id } = req.query
  if (!id || typeof id !== 'string') {
    res.status(400).json({ error: 'Missing required parameter: id' })
    return
  }
  if (req.method === 'GET') {
    const data = await getNotebook(userId, id)
    if (!data) {
      res.status(404).json({ error: 'Notebook not found' })
      return
    }
    res.status(200).json(withNotebookTimestamps(data))
    return
  }
  if (req.method === 'PATCH') {
    const contentType = String(req.headers['content-type'] || '').toLowerCase()
    if (!contentType.includes('multipart/form-data')) {
      res.status(415).json({ error: 'Content-Type must be multipart/form-data' })
      return
    }

    const { fields, coverFile } = await parseNotebookMultipart(req)
    const title = String(fields.title || '')
    const description = String(fields.description || '')
    const updatedBase = await updateNotebook(userId, id, { title, description })
    const updated = coverFile
      ? await saveUploadedNotebookCover(userId, id, {
          mimeType: coverFile.mimeType,
          bytes: coverFile.bytes,
        })
      : updatedBase
    if (!updated) {
      res.status(404).json({ error: 'Notebook not found' })
      return
    }
    res.status(200).json(withNotebookTimestamps(updated))
    return
  }
  if (req.method === 'DELETE') {
    await deleteNotebook(userId, id)
    res.status(204).end()
    return
  }
  res.setHeader('Allow', 'GET,PATCH,DELETE')
  res.status(405).end()
}
