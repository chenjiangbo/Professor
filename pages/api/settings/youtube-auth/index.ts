import type { NextApiRequest, NextApiResponse } from 'next'
import {
  clearYouTubeAuth,
  getDecryptedYouTubeAuth,
  getYouTubeAuthRecord,
  maskCredential,
  setYouTubeAuth,
  updateYouTubeAuthValidation,
  validateYouTubeAuthLocal,
  type YouTubeAuthMode,
} from '~/lib/youtube/auth'
import { requireUserId } from '~/lib/requestAuth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = requireUserId(req, res)
  if (!userId) return

  if (req.method === 'GET') {
    const record = await getYouTubeAuthRecord(userId)
    if (!record) {
      res.status(200).json({ configured: false })
      return
    }
    const decrypted = await getDecryptedYouTubeAuth(userId)
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
      await setYouTubeAuth(userId, { mode: mode as YouTubeAuthMode, value })
      const validation = validateYouTubeAuthLocal({ mode: mode as YouTubeAuthMode, value })
      await updateYouTubeAuthValidation(
        userId,
        validation.valid ? 'valid' : 'invalid',
        validation.valid ? undefined : validation.message,
      )
      const record = await getYouTubeAuthRecord(userId)
      res.status(200).json({
        ok: true,
        configured: true,
        mode: record?.mode,
        status: record?.status,
        lastValidatedAt: record?.lastValidatedAt || null,
        validation,
      })
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Failed to save YouTube credentials' })
    }
    return
  }

  if (req.method === 'DELETE') {
    await clearYouTubeAuth(userId)
    res.status(200).json({ ok: true })
    return
  }

  res.setHeader('Allow', 'GET,POST,DELETE')
  res.status(405).end()
}
