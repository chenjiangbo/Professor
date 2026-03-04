import type { NextApiRequest, NextApiResponse } from 'next'
import { alipayPrecreate } from '~/lib/billing/alipay'
import { createBillingOrder, PROFESSOR_PRODUCT_CODE, setBillingOrderQr } from '~/lib/billing/repo'
import { getBillingPlan } from '~/lib/billing/plans'
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
    const { plan_id: planId } = req.body || {}
    if (!planId || typeof planId !== 'string') {
      res.status(400).json({ error: 'Missing required parameter: plan_id' })
      return
    }

    const plan = getBillingPlan(planId)
    const order = await createBillingOrder({
      userId,
      productCode: PROFESSOR_PRODUCT_CODE,
      planId: plan.id,
      amount: plan.amount,
      subject: plan.subject,
    })

    const precreate = await alipayPrecreate({
      outTradeNo: String(order.out_trade_no),
      totalAmount: plan.amount,
      subject: plan.subject,
      timeoutExpress: '15m',
    })

    if (precreate.code !== '10000') {
      throw new Error(
        `alipay.trade.precreate failed: ${precreate.sub_code || precreate.code} ${precreate.sub_msg || precreate.msg}`,
      )
    }

    if (!precreate.qr_code) {
      throw new Error('alipay.trade.precreate returned empty qr_code')
    }

    const expireAt = new Date(Date.now() + 15 * 60 * 1000)
    const updatedOrder = await setBillingOrderQr(String(order.out_trade_no), precreate.qr_code, expireAt)

    res.status(200).json({
      order_id: updatedOrder.id,
      out_trade_no: updatedOrder.out_trade_no,
      qr_code: precreate.qr_code,
      expire_at: expireAt.toISOString(),
    })
  } catch (error) {
    console.error('[billing/precreate] failed', error)
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' })
  }
}
