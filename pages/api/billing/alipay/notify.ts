import type { NextApiRequest, NextApiResponse } from 'next'
import { markBillingOrderPaidAndActivateSubscription } from '~/lib/billing/repo'
import { parseNotifyPayload, validateNotifyReceiver, verifyNotifySignature } from '~/lib/billing/alipay'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).end('failure')
    return
  }

  try {
    const payload = parseNotifyPayload(req.body)

    const verified = verifyNotifySignature(payload)
    if (!verified) {
      throw new Error('Notify signature verification failed')
    }

    validateNotifyReceiver(payload)

    const outTradeNo = payload.out_trade_no
    const totalAmount = payload.total_amount
    const tradeStatus = payload.trade_status

    if (!outTradeNo) {
      throw new Error('Notify payload missing out_trade_no')
    }
    if (!totalAmount) {
      throw new Error('Notify payload missing total_amount')
    }

    if (tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED') {
      const alipayTradeNo = payload.trade_no
      if (!alipayTradeNo) {
        throw new Error('Notify payload missing trade_no')
      }

      await markBillingOrderPaidAndActivateSubscription({
        outTradeNo,
        alipayTradeNo,
        totalAmount,
        rawNotify: payload,
      })
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.status(200).send('success')
  } catch (error) {
    console.error('[billing/notify] failed', error)
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.status(400).send('failure')
  }
}
