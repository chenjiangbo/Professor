import type { NextApiRequest, NextApiResponse } from 'next'
import { runBillingReconcile } from '~/lib/billing/jobs'
import { requireInternalJobAuth } from '~/lib/internalJobAuth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).end()
    return
  }

  if (!requireInternalJobAuth(req, res)) return

  try {
    const limitRaw = Number((req.body || {}).limit)
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 50
    const result = await runBillingReconcile(limit)
    if (result.failures.length > 0) {
      res.status(500).json(result)
      return
    }
    res.status(200).json(result)
  } catch (error) {
    console.error('[internal-job/billing-reconcile] failed', error)
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' })
  }
}
