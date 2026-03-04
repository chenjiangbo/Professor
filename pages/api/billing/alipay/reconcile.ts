import type { NextApiRequest, NextApiResponse } from 'next'
import { alipayTradeClose, alipayTradeQuery } from '~/lib/billing/alipay'
import {
  closeBillingOrderByOutTradeNo,
  expireBillingOrderByOutTradeNo,
  listPendingBillingOrders,
  markBillingOrderPaidAndActivateSubscription,
} from '~/lib/billing/repo'
import { isAdminUserId, requireUserId } from '~/lib/requestAuth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).end()
    return
  }

  const userId = requireUserId(req, res)
  if (!userId) return

  if (!isAdminUserId(userId)) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }

  try {
    const limitRaw = Number((req.body || {}).limit)
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 50
    const pendingOrders = await listPendingBillingOrders(limit)
    const now = Date.now()

    const result = {
      scanned: pendingOrders.length,
      paid: 0,
      closed: 0,
      expired: 0,
      untouched: 0,
      failures: [] as Array<{ out_trade_no: string; reason: string }>,
    }

    for (const order of pendingOrders) {
      try {
        const outTradeNo = String(order.out_trade_no)
        const queryResp = await alipayTradeQuery({ outTradeNo })

        if (queryResp.code === '10000') {
          if (queryResp.trade_status === 'TRADE_SUCCESS' || queryResp.trade_status === 'TRADE_FINISHED') {
            if (!queryResp.trade_no || !queryResp.total_amount) {
              throw new Error('trade.query returned success status but missing trade_no or total_amount')
            }
            await markBillingOrderPaidAndActivateSubscription({
              outTradeNo,
              alipayTradeNo: queryResp.trade_no,
              totalAmount: queryResp.total_amount,
              rawNotify: {
                out_trade_no: outTradeNo,
                trade_no: queryResp.trade_no,
                total_amount: queryResp.total_amount,
                trade_status: queryResp.trade_status,
                source: 'trade.query',
              },
            })
            result.paid += 1
            continue
          }

          const expired = order.expire_at ? new Date(order.expire_at).getTime() < now : false
          if (expired) {
            const closeResp = await alipayTradeClose({ outTradeNo })
            if (closeResp.code !== '10000') {
              throw new Error(
                `trade.close failed: ${closeResp.sub_code || closeResp.code} ${closeResp.sub_msg || closeResp.msg}`,
              )
            }
            await closeBillingOrderByOutTradeNo(outTradeNo, 'closed by reconcile after expire')
            result.closed += 1
          } else {
            result.untouched += 1
          }
          continue
        }

        if (queryResp.sub_code === 'ACQ.TRADE_NOT_EXIST') {
          const expired = order.expire_at ? new Date(order.expire_at).getTime() < now : false
          if (expired) {
            await expireBillingOrderByOutTradeNo(outTradeNo, 'trade not found and expired')
            result.expired += 1
          } else {
            result.untouched += 1
          }
          continue
        }

        throw new Error(
          `trade.query failed: ${queryResp.sub_code || queryResp.code} ${queryResp.sub_msg || queryResp.msg}`,
        )
      } catch (err) {
        result.failures.push({
          out_trade_no: String(order.out_trade_no),
          reason: err instanceof Error ? err.message : 'unknown error',
        })
      }
    }

    if (result.failures.length > 0) {
      res.status(500).json(result)
      return
    }

    res.status(200).json(result)
  } catch (error) {
    console.error('[billing/reconcile] failed', error)
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' })
  }
}
