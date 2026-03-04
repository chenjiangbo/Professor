import type { NextApiRequest, NextApiResponse } from 'next'
import { alipayTradeClose } from '~/lib/billing/alipay'
import { closeBillingOrderByOutTradeNo, getBillingOrderByIdForUser } from '~/lib/billing/repo'
import { requireUserId } from '~/lib/requestAuth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
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

    if (order.status === 'PAID' || order.status === 'CLOSED' || order.status === 'EXPIRED') {
      res.status(200).json({ ok: true, status: order.status })
      return
    }

    const closeResp = await alipayTradeClose({ outTradeNo: String(order.out_trade_no) })
    if (closeResp.code !== '10000') {
      throw new Error(
        `alipay.trade.close failed: ${closeResp.sub_code || closeResp.code} ${closeResp.sub_msg || closeResp.msg}`,
      )
    }

    const closed = await closeBillingOrderByOutTradeNo(String(order.out_trade_no), 'closed by user')
    res.status(200).json({ ok: true, status: closed?.status || 'CLOSED' })
  } catch (error) {
    console.error('[billing/close-order] failed', error)
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' })
  }
}
