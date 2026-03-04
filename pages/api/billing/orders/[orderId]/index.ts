import type { NextApiRequest, NextApiResponse } from 'next'
import { getBillingOrderByIdForUser } from '~/lib/billing/repo'
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
    const { orderId } = req.query
    if (!orderId || typeof orderId !== 'string') {
      res.status(400).json({ error: 'Invalid orderId' })
      return
    }

    const order = await getBillingOrderByIdForUser(orderId, userId)
    if (!order) {
      res.status(404).json({ error: 'Order not found' })
      return
    }

    res.status(200).json({
      order_id: order.id,
      out_trade_no: order.out_trade_no,
      status: order.status,
      paid_at: order.paid_at,
      expire_at: order.expire_at,
      subscription_status: order.subscription_status || null,
      subscription_period_end: order.current_period_end || null,
    })
  } catch (error) {
    console.error('[billing/order-status] failed', error)
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' })
  }
}
