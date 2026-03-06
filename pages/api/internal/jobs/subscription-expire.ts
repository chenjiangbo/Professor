import type { NextApiRequest, NextApiResponse } from 'next'
import { runSubscriptionExpiration } from '~/lib/billing/jobs'
import { requireInternalJobAuth } from '~/lib/internalJobAuth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).end()
    return
  }

  if (!requireInternalJobAuth(req, res)) return

  try {
    const result = await runSubscriptionExpiration(new Date())
    res.status(200).json(result)
  } catch (error) {
    console.error('[internal-job/subscription-expire] failed', error)
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' })
  }
}
