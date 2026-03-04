import type { NextApiRequest, NextApiResponse } from 'next'
import { getActiveSubscriptionTierByUserId, PROFESSOR_PRODUCT_CODE } from '~/lib/billing/repo'
import { getUserEmailFromRequest, getUserNameFromRequest, isAdminUserId, requireUserId } from '~/lib/requestAuth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    res.status(405).end()
    return
  }

  const userId = requireUserId(req, res)
  if (!userId) return
  const userEmail = getUserEmailFromRequest(req)
  const userName = getUserNameFromRequest(req)

  try {
    const { tier, subscription } = await getActiveSubscriptionTierByUserId(userId)
    const admin = isAdminUserId(userId)
    const effectiveTier = admin ? 'premium' : tier

    res.status(200).json({
      user_id: userId,
      user_email: userEmail || null,
      display_name: userName || null,
      product_code: PROFESSOR_PRODUCT_CODE,
      tier: effectiveTier,
      is_admin: admin,
      subscription_status: subscription?.status || null,
      plan_id: subscription?.plan_id || null,
      current_period_end: subscription?.current_period_end || null,
    })
  } catch (error) {
    console.error('[auth/me] failed', error)
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' })
  }
}
