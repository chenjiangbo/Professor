import type { NextApiRequest, NextApiResponse } from 'next'
import {
  getCookieStrength,
  getBBDownAuthRecord,
  getDecryptedBBDownCookie,
  updateBBDownAuthValidation,
  validateBBDownAuthCookie,
} from '~/lib/bbdown/auth'
import { requireUserId } from '~/lib/requestAuth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = requireUserId(req, res)
  if (!userId) return

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).end()
    return
  }

  const record = await getBBDownAuthRecord(userId)
  if (!record) {
    res.status(404).json({ error: 'BBDown credential is not configured' })
    return
  }

  try {
    const cookie = await getDecryptedBBDownCookie(userId)
    if (!cookie) {
      res.status(422).json({ error: 'Credential decryption failed' })
      return
    }
    const strength = getCookieStrength(cookie)
    const validation = await validateBBDownAuthCookie(cookie)
    await updateBBDownAuthValidation(
      userId,
      validation.valid ? 'valid' : 'invalid',
      validation.valid ? undefined : validation.message,
    )
    const latest = await getBBDownAuthRecord(userId)
    res.status(200).json({
      ok: validation.valid,
      validation,
      cookieStrength: strength,
      status: latest?.status || 'unknown',
      lastValidatedAt: latest?.lastValidatedAt || null,
      lastError: latest?.lastError || null,
    })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Credential validation failed' })
  }
}
