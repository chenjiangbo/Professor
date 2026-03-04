import type { NextApiRequest, NextApiResponse } from 'next'
import { getActiveSubscriptionTierByUserId, PROFESSOR_PRODUCT_CODE } from '~/lib/billing/repo'
import { requireUserId } from '~/lib/requestAuth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    res.status(405).end()
    return
  }

  const userId = requireUserId(req, res)
  if (!userId) return

  try {
    const { tier, subscription } = await getActiveSubscriptionTierByUserId(userId)
    res.status(200).json({
      user_id: userId,
      product_code: PROFESSOR_PRODUCT_CODE,
      tier,
      subscription_status: subscription?.status || null,
      plan_id: subscription?.plan_id || null,
      current_period_end: subscription?.current_period_end || null,
    })
  } catch (error) {
    console.error('[auth/me] failed', error)
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' })
  }
}
