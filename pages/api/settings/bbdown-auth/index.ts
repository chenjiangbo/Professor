import type { NextApiRequest, NextApiResponse } from 'next'
import {
  clearBBDownAuth,
  getCookieStrength,
  getBBDownAuthRecord,
  getDecryptedBBDownCookie,
  maskCredential,
  setBBDownAuth,
  updateBBDownAuthValidation,
  validateBBDownAuthCookie,
  type BBDownAuthMode,
} from '~/lib/bbdown/auth'
import { requireUserId } from '~/lib/requestAuth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = requireUserId(req, res)
  if (!userId) return

  if (req.method === 'GET') {
    const record = await getBBDownAuthRecord(userId)
    if (!record) {
      res.status(200).json({ configured: false })
      return
    }
    const decrypted = await getDecryptedBBDownCookie(userId)
    const strength = decrypted ? getCookieStrength(decrypted) : null
    res.status(200).json({
      configured: true,
      mode: record.mode,
      status: record.status,
      updatedAt: record.updatedAt,
      lastValidatedAt: record.lastValidatedAt || null,
      lastError: record.lastError || null,
      maskedCredential: maskCredential(decrypted),
      cookieStrength: strength,
    })
    return
  }

  if (req.method === 'POST') {
    const { mode, value } = req.body || {}
    if (mode !== 'sessdata' && mode !== 'cookie') {
      res.status(400).json({ error: 'mode must be "sessdata" or "cookie"' })
      return
    }
    if (!value || typeof value !== 'string') {
      res.status(400).json({ error: 'Missing credential value' })
      return
    }

    try {
      await setBBDownAuth(userId, { mode: mode as BBDownAuthMode, value })
      const cookie = await getDecryptedBBDownCookie(userId)
      const validation = await validateBBDownAuthCookie(cookie || '')
      const strength = cookie ? getCookieStrength(cookie) : null
      await updateBBDownAuthValidation(
        userId,
        validation.valid ? 'valid' : 'invalid',
        validation.valid ? undefined : validation.message,
      )

      const record = await getBBDownAuthRecord(userId)
      res.status(200).json({
        ok: true,
        configured: true,
        mode: record?.mode,
        status: record?.status,
        lastValidatedAt: record?.lastValidatedAt || null,
        validation,
        cookieStrength: strength,
      })
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Failed to save BBDown credentials' })
    }
    return
  }

  if (req.method === 'DELETE') {
    await clearBBDownAuth(userId)
    res.status(200).json({ ok: true })
    return
  }

  res.setHeader('Allow', 'GET,POST,DELETE')
  res.status(405).end()
}
