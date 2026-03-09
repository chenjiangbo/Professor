import fs from 'fs/promises'
import path from 'path'
import type { NextApiRequest, NextApiResponse } from 'next'
import { getNotebook } from '~/lib/repo'
import { requireUserId } from '~/lib/requestAuth'
import { resolveNotebookCoverFilePath } from '~/lib/notebookCover/storage'

function resolveMediaType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  throw new Error(`Unsupported notebook cover file extension: ${ext}`)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    res.status(405).end()
    return
  }

  const userId = requireUserId(req, res)
  if (!userId) return

  const id = String(req.query.id || '').trim()
  if (!id) {
    res.status(400).json({ error: 'Missing required parameter: id' })
    return
  }

  const notebook = await getNotebook(userId, id)
  if (!notebook) {
    res.status(404).json({ error: 'Notebook not found' })
    return
  }

  const storedPath = String(notebook.cover_url || '').trim()
  if (!storedPath || String(notebook.cover_status || '') !== 'ready') {
    res.status(404).json({ error: 'Notebook cover not found' })
    return
  }

  try {
    const filePath = resolveNotebookCoverFilePath(storedPath)
    const bytes = await fs.readFile(filePath)
    res.setHeader('Content-Type', resolveMediaType(filePath))
    res.setHeader('Cache-Control', 'private, max-age=300')
    res.status(200).send(Buffer.from(bytes))
  } catch (error) {
    console.error('[api/notebooks/cover] failed to read cover', error)
    res.status(404).json({ error: 'Notebook cover not found' })
  }
}
