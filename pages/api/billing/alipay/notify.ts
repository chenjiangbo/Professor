import type { NextApiRequest, NextApiResponse } from 'next'
import { markBillingOrderPaidAndActivateSubscription } from '~/lib/billing/repo'
import {
  parseNotifyPayload,
  validateNotifyApp,
  validateNotifyReceiver,
  verifyNotifySignature,
} from '~/lib/billing/alipay'

export const config = {
  api: {
    bodyParser: false,
  },
}

async function readRawBody(req: NextApiRequest): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    let data = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      data += String(chunk)
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).end('failure')
    return
  }

  try {
    const rawBody = await readRawBody(req)
    const payload = parseNotifyPayload(rawBody)

    const verified = verifyNotifySignature(payload)
    if (!verified) {
      throw new Error('Notify signature verification failed')
    }

    validateNotifyApp(payload)
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
