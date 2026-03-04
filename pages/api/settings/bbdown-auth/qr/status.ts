import type { NextApiRequest, NextApiResponse } from 'next'
import { requireUserId } from '~/lib/requestAuth'
import { getBBDownQrLoginState } from '~/lib/bbdown/qrLogin'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = requireUserId(req, res)
  if (!userId) return

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    res.status(405).end()
    return
  }

  const state = await getBBDownQrLoginState(userId)
  res.status(200).json(state)
}
