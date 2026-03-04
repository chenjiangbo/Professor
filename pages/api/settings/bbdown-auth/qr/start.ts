import type { NextApiRequest, NextApiResponse } from 'next'
import { requireUserId } from '~/lib/requestAuth'
import { startBBDownQrLogin } from '~/lib/bbdown/qrLogin'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = requireUserId(req, res)
  if (!userId) return

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).end()
    return
  }

  try {
    const state = await startBBDownQrLogin(userId)
    res.status(200).json({ ok: true, ...state })
  } catch (e: any) {
    res.status(409).json({ error: e?.message || 'Failed to start BBDown QR login' })
  }
}
