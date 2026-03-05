import type { NextApiRequest, NextApiResponse } from 'next'
import {
  clearDouyinAuth,
  getDecryptedDouyinAuth,
  getDouyinAuthRecord,
  maskCredential,
  setDouyinAuth,
  updateDouyinAuthValidation,
  validateDouyinAuthLocal,
  type DouyinAuthMode,
} from '~/lib/douyin/auth'
import { requireUserId } from '~/lib/requestAuth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = requireUserId(req, res)
  if (!userId) return

  if (req.method === 'GET') {
    const record = await getDouyinAuthRecord(userId)
    if (!record) {
      res.status(200).json({ configured: false })
      return
    }
    const decrypted = await getDecryptedDouyinAuth(userId)
    res.status(200).json({
      configured: true,
      mode: record.mode,
      status: record.status,
      updatedAt: record.updatedAt,
      lastValidatedAt: record.lastValidatedAt || null,
      lastError: record.lastError || null,
      maskedCredential: maskCredential(decrypted?.value || ''),
    })
    return
  }

  if (req.method === 'POST') {
    const { mode, value } = req.body || {}
    if (mode !== 'cookie' && mode !== 'cookies_txt') {
      res.status(400).json({ error: 'mode must be "cookie" or "cookies_txt"' })
      return
    }
    if (!value || typeof value !== 'string') {
      res.status(400).json({ error: 'Missing credential value' })
      return
    }

    try {
      await setDouyinAuth(userId, { mode: mode as DouyinAuthMode, value })
      const validation = validateDouyinAuthLocal({ mode: mode as DouyinAuthMode, value })
      await updateDouyinAuthValidation(
        userId,
        validation.valid ? 'valid' : 'invalid',
        validation.valid ? undefined : validation.message,
      )
      const record = await getDouyinAuthRecord(userId)
      res.status(200).json({
        ok: true,
        configured: true,
        mode: record?.mode,
        status: record?.status,
        lastValidatedAt: record?.lastValidatedAt || null,
        validation,
      })
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Failed to save Douyin credentials' })
    }
    return
  }

  if (req.method === 'DELETE') {
    await clearDouyinAuth(userId)
    res.status(200).json({ ok: true })
    return
  }

  res.setHeader('Allow', 'GET,POST,DELETE')
  res.status(405).end()
}
