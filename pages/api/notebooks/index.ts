import type { NextApiRequest, NextApiResponse } from 'next'
import { createNotebook, listNotebooks } from '~/lib/repo'
import { parseNotebookMultipart } from '~/lib/http/parseNotebookMultipart'
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

  if (req.method === 'GET') {
    const data = await listNotebooks(userId)
    res.status(200).json(data.map(withNotebookTimestamps))
    return
  }
  if (req.method === 'POST') {
    const contentType = String(req.headers['content-type'] || '').toLowerCase()
    if (!contentType.includes('multipart/form-data')) {
      res.status(415).json({ error: 'Content-Type must be multipart/form-data' })
      return
    }

    const { fields, coverFile } = await parseNotebookMultipart(req)
    const title = String(fields.title || '')
    const description = String(fields.description || '')
    if (!title) {
      res.status(400).json({ error: 'Missing required parameter: title' })
      return
    }
    const created = await createNotebook(userId, { title, description })
    let responseRow = created
    if (coverFile) {
      responseRow = await saveUploadedNotebookCover(userId, created.id, {
        mimeType: coverFile.mimeType,
        bytes: coverFile.bytes,
      })
    }
    res.status(201).json(withNotebookTimestamps(responseRow))
    return
  }
  res.setHeader('Allow', 'GET,POST')
  res.status(405).end()
}
