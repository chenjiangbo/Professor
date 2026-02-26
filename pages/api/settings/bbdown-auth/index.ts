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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const record = await getBBDownAuthRecord()
    if (!record) {
      res.status(200).json({ configured: false })
      return
    }
    const decrypted = await getDecryptedBBDownCookie()
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
      res.status(400).json({ error: 'value is required' })
      return
    }

    try {
      await setBBDownAuth({ mode: mode as BBDownAuthMode, value })
      const cookie = await getDecryptedBBDownCookie()
      const validation = await validateBBDownAuthCookie(cookie || '')
      const strength = cookie ? getCookieStrength(cookie) : null
      await updateBBDownAuthValidation(
        validation.valid ? 'valid' : 'invalid',
        validation.valid ? undefined : validation.message,
      )

      const record = await getBBDownAuthRecord()
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
      res.status(500).json({ error: e?.message || 'Failed to save BBDown auth' })
    }
    return
  }

  if (req.method === 'DELETE') {
    await clearBBDownAuth()
    res.status(200).json({ ok: true })
    return
  }

  res.setHeader('Allow', 'GET,POST,DELETE')
  res.status(405).end()
}
