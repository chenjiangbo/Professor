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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const record = await getYouTubeAuthRecord()
    if (!record) {
      res.status(200).json({ configured: false })
      return
    }
    const decrypted = await getDecryptedYouTubeAuth()
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
      res.status(400).json({ error: 'mode 只能是 "cookie" 或 "cookies_txt"' })
      return
    }
    if (!value || typeof value !== 'string') {
      res.status(400).json({ error: '缺少凭据内容 value' })
      return
    }

    try {
      await setYouTubeAuth({ mode: mode as YouTubeAuthMode, value })
      const validation = validateYouTubeAuthLocal({ mode: mode as YouTubeAuthMode, value })
      await updateYouTubeAuthValidation(
        validation.valid ? 'valid' : 'invalid',
        validation.valid ? undefined : validation.message,
      )
      const record = await getYouTubeAuthRecord()
      res.status(200).json({
        ok: true,
        configured: true,
        mode: record?.mode,
        status: record?.status,
        lastValidatedAt: record?.lastValidatedAt || null,
        validation,
      })
    } catch (e: any) {
      res.status(500).json({ error: e?.message || '保存 YouTube 登录凭据失败' })
    }
    return
  }

  if (req.method === 'DELETE') {
    await clearYouTubeAuth()
    res.status(200).json({ ok: true })
    return
  }

  res.setHeader('Allow', 'GET,POST,DELETE')
  res.status(405).end()
}
