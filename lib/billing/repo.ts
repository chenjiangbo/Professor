import { randomUUID } from 'crypto'
import { pool } from '~/lib/db'
import { getBillingPlan } from '~/lib/billing/plans'
export const PROFESSOR_PRODUCT_CODE = 'professor'

export type BillingOrderStatus = 'CREATED' | 'QR_SENT' | 'PAID' | 'CLOSED' | 'EXPIRED' | 'FAILED'

type CreateOrderInput = {
  userId: string
  productCode: string
  planId: string
  amount: string
  subject: string
}

type ListUserUnpaidOrdersInput = {
  userId: string
  productCode: string
  planId: string
}

type MarkPaidInput = {
  outTradeNo: string
  alipayTradeNo: string
  totalAmount: string
  rawNotify: Record<string, string>
}

function normalizeMoney(value: string): string {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Invalid amount: ${value}`)
  }
  return amount.toFixed(2)
}

function buildOutTradeNo(userId: string): string {
  const safeUser = userId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || 'U'
  const stamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, '')
    .slice(0, 14)
  const random = Math.floor(Math.random() * 900000 + 100000)
  return `SUB_${safeUser}_${stamp}_${random}`
}

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000)
}

export async function createBillingOrder(input: CreateOrderInput) {
  const outTradeNo = buildOutTradeNo(input.userId)
  const id = randomUUID()
  const normalizedAmount = normalizeMoney(input.amount)

  const { rows } = await pool.query(
    `INSERT INTO billing_orders (
      id, out_trade_no, user_id, product_code, plan_id, amount, subject, status
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,'CREATED')
    RETURNING *`,
    [id, outTradeNo, input.userId, input.productCode, input.planId, normalizedAmount, input.subject],
  )

  return rows[0]
}

export async function setBillingOrderQr(outTradeNo: string, qrCode: string, expireAt: Date) {
  const { rows } = await pool.query(
    `UPDATE billing_orders
     SET status='QR_SENT', qr_code=$2, expire_at=$3, updated_at=now()
     WHERE out_trade_no=$1
     RETURNING *`,
    [outTradeNo, qrCode, expireAt.toISOString()],
  )

  if (!rows[0]) {
    throw new Error('Billing order not found when setting QR code')
  }
  return rows[0]
}

export async function getBillingOrderByIdForUser(orderId: string, userId: string) {
  const { rows } = await pool.query(
    `SELECT o.*, s.status AS subscription_status, s.current_period_end
     FROM billing_orders o
     LEFT JOIN subscriptions s ON s.user_id = o.user_id AND s.product_code = o.product_code
     WHERE o.id=$1 AND o.user_id=$2 AND o.product_code=$3`,
    [orderId, userId, PROFESSOR_PRODUCT_CODE],
  )
  return rows[0] || null
}

export async function getBillingOrderByOutTradeNo(outTradeNo: string) {
  const { rows } = await pool.query('SELECT * FROM billing_orders WHERE out_trade_no=$1', [outTradeNo])
  return rows[0] || null
}

export async function markBillingOrderPaidAndActivateSubscription(input: MarkPaidInput) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: orderRows } = await client.query('SELECT * FROM billing_orders WHERE out_trade_no=$1 FOR UPDATE', [
      input.outTradeNo,
    ])
    const order = orderRows[0]
    if (!order) {
      throw new Error(`Billing order not found for out_trade_no=${input.outTradeNo}`)
    }

    const expectedAmount = normalizeMoney(String(order.amount))
    const paidAmount = normalizeMoney(input.totalAmount)
    if (expectedAmount !== paidAmount) {
      throw new Error(`Amount mismatch: order=${expectedAmount}, notify=${paidAmount}`)
    }

    if (order.status === 'PAID') {
      await client.query('COMMIT')
      return { order, alreadyPaid: true }
    }

    if (order.status === 'CLOSED' || order.status === 'EXPIRED') {
      throw new Error(`Order already closed or expired. status=${order.status}`)
    }

    const paidAt = new Date()
    const { rows: updatedOrderRows } = await client.query(
      `UPDATE billing_orders
       SET status='PAID', alipay_trade_no=$2, paid_at=$3, notify_payload=$4::jsonb, updated_at=now()
       WHERE out_trade_no=$1
       RETURNING *`,
      [input.outTradeNo, input.alipayTradeNo, paidAt.toISOString(), JSON.stringify(input.rawNotify)],
    )
    const updatedOrder = updatedOrderRows[0]

    const plan = getBillingPlan(String(order.plan_id))
    const { rows: subRows } = await client.query(
      'SELECT * FROM subscriptions WHERE user_id=$1 AND product_code=$2 FOR UPDATE',
      [order.user_id, String(order.product_code || PROFESSOR_PRODUCT_CODE)],
    )
    const subscription = subRows[0]
    const now = new Date()
    const nextStart =
      subscription?.status === 'ACTIVE' &&
      subscription?.current_period_end &&
      new Date(subscription.current_period_end) > now
        ? new Date(subscription.current_period_end)
        : now
    const nextEnd = addDays(nextStart, plan.durationDays)

    if (!subscription) {
      await client.query(
        `INSERT INTO subscriptions (
          id, user_id, product_code, plan_id, current_period_start, current_period_end, status, last_order_id
        ) VALUES ($1,$2,$3,$4,$5,$6,'ACTIVE',$7)`,
        [
          randomUUID(),
          order.user_id,
          String(order.product_code || PROFESSOR_PRODUCT_CODE),
          order.plan_id,
          nextStart.toISOString(),
          nextEnd.toISOString(),
          order.id,
        ],
      )
    } else {
      await client.query(
        `UPDATE subscriptions
         SET plan_id=$2,
             current_period_start=$3,
             current_period_end=$4,
             status='ACTIVE',
             last_order_id=$5,
             updated_at=now()
         WHERE user_id=$1 AND product_code=$6`,
        [
          order.user_id,
          order.plan_id,
          nextStart.toISOString(),
          nextEnd.toISOString(),
          order.id,
          String(order.product_code || PROFESSOR_PRODUCT_CODE),
        ],
      )
    }

    await client.query('COMMIT')
    return { order: updatedOrder, alreadyPaid: false }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function closeBillingOrderByOutTradeNo(outTradeNo: string, reason: string) {
  const { rows } = await pool.query(
    `UPDATE billing_orders
     SET status='CLOSED', close_reason=$2, updated_at=now()
     WHERE out_trade_no=$1 AND status IN ('CREATED','QR_SENT')
     RETURNING *`,
    [outTradeNo, reason],
  )
  return rows[0] || null
}

export async function failBillingOrderByOutTradeNo(outTradeNo: string, reason: string) {
  const { rows } = await pool.query(
    `UPDATE billing_orders
     SET status='FAILED', close_reason=$2, updated_at=now()
     WHERE out_trade_no=$1 AND status IN ('CREATED','QR_SENT')
     RETURNING *`,
    [outTradeNo, reason],
  )
  return rows[0] || null
}

export async function expireBillingOrderByOutTradeNo(outTradeNo: string, reason: string) {
  const { rows } = await pool.query(
    `UPDATE billing_orders
     SET status='EXPIRED', close_reason=$2, updated_at=now()
     WHERE out_trade_no=$1 AND status IN ('CREATED','QR_SENT')
     RETURNING *`,
    [outTradeNo, reason],
  )
  return rows[0] || null
}

export async function listPendingBillingOrders(limit = 50) {
  const { rows } = await pool.query(
    `SELECT *
     FROM billing_orders
     WHERE status IN ('CREATED','QR_SENT') AND product_code=$2
     ORDER BY created_at ASC
     LIMIT $1`,
    [limit, PROFESSOR_PRODUCT_CODE],
  )
  return rows
}

export async function listUserUnpaidBillingOrders(input: ListUserUnpaidOrdersInput) {
  const { rows } = await pool.query(
    `SELECT *
     FROM billing_orders
     WHERE user_id=$1
       AND product_code=$2
       AND plan_id=$3
       AND status IN ('CREATED','QR_SENT')
     ORDER BY created_at DESC`,
    [input.userId, input.productCode, input.planId],
  )
  return rows
}

export type SubscriptionTier = 'free' | 'pro' | 'premium'

export function resolveTierFromPlanId(planId: string | null | undefined): SubscriptionTier {
  if (!planId) return 'free'
  if (planId.includes('premium')) return 'premium'
  if (planId.includes('pro')) return 'pro'
  return 'free'
}

export async function getSubscriptionByUserId(userId: string, productCode = PROFESSOR_PRODUCT_CODE) {
  const { rows } = await pool.query(
    `SELECT id, user_id, product_code, plan_id, current_period_start, current_period_end, status, last_order_id
     FROM subscriptions
     WHERE user_id=$1 AND product_code=$2`,
    [userId, productCode],
  )
  return rows[0] || null
}

export async function getActiveSubscriptionTierByUserId(userId: string): Promise<{
  tier: SubscriptionTier
  subscription: any | null
}> {
  const subscription = await getSubscriptionByUserId(userId, PROFESSOR_PRODUCT_CODE)
  if (!subscription) {
    return { tier: 'free', subscription: null }
  }

  const endAt = subscription.current_period_end ? new Date(subscription.current_period_end).getTime() : 0
  const active = subscription.status === 'ACTIVE' && endAt > Date.now()
  if (!active) {
    return { tier: 'free', subscription }
  }

  return {
    tier: resolveTierFromPlanId(String(subscription.plan_id || '')),
    subscription,
  }
}
