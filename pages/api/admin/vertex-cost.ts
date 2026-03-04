import type { NextApiRequest, NextApiResponse } from 'next'
import { fetchVertexCostSummary } from '~/lib/monitoring/vertexCost'
import { isAdminUserId, requireUserId } from '~/lib/requestAuth'

function parseWindowDays(raw: string | string[] | undefined) {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (!value) {
    return 7
  }
  const numeric = Number.parseInt(value, 10)
  if (!Number.isInteger(numeric) || numeric <= 0 || numeric > 90) {
    throw new Error(`Invalid query parameter days: ${value}. It must be an integer between 1 and 90.`)
  }
  return numeric
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = requireUserId(req, res)
  if (!userId) return

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  if (!isAdminUserId(userId)) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }

  try {
    const days = parseWindowDays(req.query.days)
    const summary = await fetchVertexCostSummary(days)
    res.status(200).json(summary)
  } catch (error: any) {
    console.error('[Vertex Cost Dashboard] API Error:', error)
    res.status(500).json({
      error: error?.message || 'Failed to fetch Vertex cost metrics',
    })
  }
}
