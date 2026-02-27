import type { NextApiRequest, NextApiResponse } from 'next'
import {
  getDecryptedYouTubeAuth,
  getYouTubeAuthRecord,
  updateYouTubeAuthValidation,
  validateYouTubeAuthLocal,
} from '~/lib/youtube/auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).end()
    return
  }

  const record = await getYouTubeAuthRecord()
  if (!record) {
    res.status(404).json({ error: '尚未配置 YouTube 登录凭据' })
    return
  }

  try {
    const auth = await getDecryptedYouTubeAuth()
    if (!auth) {
      res.status(422).json({ error: '凭据解密失败' })
      return
    }

    const validation = validateYouTubeAuthLocal(auth)
    await updateYouTubeAuthValidation(
      validation.valid ? 'valid' : 'invalid',
      validation.valid ? undefined : validation.message,
    )
    const latest = await getYouTubeAuthRecord()
    res.status(200).json({
      ok: validation.valid,
      validation,
      status: latest?.status || 'unknown',
      lastValidatedAt: latest?.lastValidatedAt || null,
      lastError: latest?.lastError || null,
    })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || '凭据校验失败' })
  }
}
