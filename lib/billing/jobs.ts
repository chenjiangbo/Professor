import { alipayTradeClose, alipayTradeQuery } from '~/lib/billing/alipay'
import {
  closeBillingOrderByOutTradeNo,
  expireBillingOrderByOutTradeNo,
  listPendingBillingOrders,
  markBillingOrderPaidAndActivateSubscription,
} from '~/lib/billing/repo'
import { pool } from '~/lib/db'

export type BillingReconcileResult = {
  scanned: number
  paid: number
  closed: number
  expired: number
  untouched: number
  failures: Array<{ out_trade_no: string; reason: string }>
}

export async function runBillingReconcile(limit = 50): Promise<BillingReconcileResult> {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 200) : 50
  const pendingOrders = await listPendingBillingOrders(safeLimit)
  const now = Date.now()

  const result: BillingReconcileResult = {
    scanned: pendingOrders.length,
    paid: 0,
    closed: 0,
    expired: 0,
    untouched: 0,
    failures: [],
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

  return result
}

export async function runSubscriptionExpiration(now = new Date()) {
  const { rowCount } = await pool.query(
    `UPDATE subscriptions
     SET status='EXPIRED', updated_at=now()
     WHERE status='ACTIVE'
       AND current_period_end <= $1`,
    [now.toISOString()],
  )
  return { expired: Number(rowCount || 0), scanned_at: now.toISOString() }
}
