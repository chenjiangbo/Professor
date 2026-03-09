import type { NextApiRequest, NextApiResponse } from 'next'
import { requireInternalJobAuth } from '~/lib/internalJobAuth'
import { updateNotebookCoverForUser } from '~/lib/repo'
import { generateNotebookCoverForNotebook } from '~/lib/notebookCover/service'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).end()
    return
  }

  if (!requireInternalJobAuth(req, res)) return

  const userId = String(req.body?.userId || '').trim()
  const notebookId = String(req.body?.notebookId || '').trim()
  if (!userId || !notebookId) {
    res.status(400).json({ error: 'Missing required parameters: userId, notebookId' })
    return
  }

  try {
    const notebook = await generateNotebookCoverForNotebook(userId, notebookId)
    res.status(200).json({
      notebookId,
      status: notebook.cover_status,
      coverUpdatedAt: notebook.cover_updated_at || null,
    })
  } catch (error) {
    try {
      await updateNotebookCoverForUser(userId, notebookId, {
        coverStatus: 'error',
      })
    } catch (updateError) {
      console.error('[internal-job/notebook-cover] failed to mark error state', updateError)
    }
    console.error('[internal-job/notebook-cover] failed', error)
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' })
  }
}
