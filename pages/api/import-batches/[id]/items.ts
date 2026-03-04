import type { NextApiRequest, NextApiResponse } from 'next'
import { listImportBatchItems } from '~/lib/repo'
import { requireUserId } from '~/lib/requestAuth'

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = requireUserId(req, res)
  if (!userId) return

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    res.status(405).end()
    return
  }

  const { id } = req.query
  if (!id || typeof id !== 'string') {
    res.status(400).json({ error: 'Missing required parameter: id' })
    return
  }
  if (!isUuid(id)) {
    res.status(400).json({ error: 'Invalid id format (must be UUID)' })
    return
  }

  const items = await listImportBatchItems(userId, id)
  res.status(200).json(items)
}
