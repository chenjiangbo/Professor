import type { NextApiRequest, NextApiResponse } from 'next'
import {
  getCookieStrength,
  getBBDownAuthRecord,
  getDecryptedBBDownCookie,
  updateBBDownAuthValidation,
  validateBBDownAuthCookie,
} from '~/lib/bbdown/auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).end()
    return
  }

  const record = await getBBDownAuthRecord()
  if (!record) {
    res.status(404).json({ error: 'BBDown auth is not configured' })
    return
  }

  try {
    const cookie = await getDecryptedBBDownCookie()
    if (!cookie) {
      res.status(422).json({ error: 'Failed to decrypt credential' })
      return
    }
    const strength = getCookieStrength(cookie)
    const validation = await validateBBDownAuthCookie(cookie)
    await updateBBDownAuthValidation(
      validation.valid ? 'valid' : 'invalid',
      validation.valid ? undefined : validation.message,
    )
    const latest = await getBBDownAuthRecord()
    res.status(200).json({
      ok: validation.valid,
      validation,
      cookieStrength: strength,
      status: latest?.status || 'unknown',
      lastValidatedAt: latest?.lastValidatedAt || null,
      lastError: latest?.lastError || null,
    })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Validation failed' })
  }
}
