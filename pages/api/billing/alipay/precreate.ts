import type { NextApiRequest, NextApiResponse } from 'next'
import { alipayPrecreate, alipayTradeClose } from '~/lib/billing/alipay'
import {
  closeBillingOrderByOutTradeNo,
  createBillingOrder,
  expireBillingOrderByOutTradeNo,
  failBillingOrderByOutTradeNo,
  listUserUnpaidBillingOrders,
  PROFESSOR_PRODUCT_CODE,
  setBillingOrderQr,
} from '~/lib/billing/repo'
import { getBillingPlan } from '~/lib/billing/plans'
import { requireUserId } from '~/lib/requestAuth'

function toIsoString(value: unknown): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(String(value))
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function isFutureTime(value: unknown): boolean {
  const iso = toIsoString(value)
  if (!iso) return false
  return new Date(iso).getTime() > Date.now()
}

async function closeOrExpireOrder(outTradeNo: string, reasonPrefix: string) {
  const closeResp = await alipayTradeClose({ outTradeNo })
  if (closeResp.code === '10000') {
    await closeBillingOrderByOutTradeNo(outTradeNo, `${reasonPrefix}: closed before creating new order`)
    return
  }
  if (closeResp.sub_code === 'ACQ.TRADE_NOT_EXIST') {
    await expireBillingOrderByOutTradeNo(outTradeNo, `${reasonPrefix}: trade not exist`)
    return
  }
  throw new Error(
    `alipay.trade.close failed: ${closeResp.sub_code || closeResp.code} ${closeResp.sub_msg || closeResp.msg}`,
  )
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).end()
    return
  }

  const userId = requireUserId(req, res)
  if (!userId) return

  let outTradeNo = ''
  try {
    const { plan_id: planId } = req.body || {}
    if (!planId || typeof planId !== 'string') {
      res.status(400).json({ error: 'Missing required parameter: plan_id' })
      return
    }

    const plan = getBillingPlan(planId)
    const existingOrders = await listUserUnpaidBillingOrders({
      userId,
      productCode: PROFESSOR_PRODUCT_CODE,
      planId: plan.id,
    })

    const reusableOrder = existingOrders.find(
      (order) => order.status === 'QR_SENT' && String(order.qr_code || '').trim() && isFutureTime(order.expire_at),
    )

    if (reusableOrder) {
      const staleOrders = existingOrders.filter((order) => String(order.id) !== String(reusableOrder.id))
      for (const stale of staleOrders) {
        await closeOrExpireOrder(String(stale.out_trade_no), 'stale order')
      }

      const reusableExpireAt = toIsoString(reusableOrder.expire_at)
      if (!reusableExpireAt) {
        throw new Error('Reusable order has invalid expire_at')
      }

      res.status(200).json({
        order_id: reusableOrder.id,
        out_trade_no: reusableOrder.out_trade_no,
        qr_code: reusableOrder.qr_code,
        expire_at: reusableExpireAt,
      })
      return
    }

    for (const stale of existingOrders) {
      if (isFutureTime(stale.expire_at)) {
        await closeOrExpireOrder(String(stale.out_trade_no), 'stale order')
      } else {
        await expireBillingOrderByOutTradeNo(String(stale.out_trade_no), 'expired before creating new order')
      }
    }

    const order = await createBillingOrder({
      userId,
      productCode: PROFESSOR_PRODUCT_CODE,
      planId: plan.id,
      amount: plan.amount,
      subject: plan.subject,
    })
    outTradeNo = String(order.out_trade_no)

    const precreate = await alipayPrecreate({
      outTradeNo,
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
    if (outTradeNo) {
      await failBillingOrderByOutTradeNo(outTradeNo, error instanceof Error ? error.message : 'precreate failed').catch(
        () => undefined,
      )
    }
    console.error('[billing/precreate] failed', error)
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' })
  }
}
