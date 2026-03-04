import type { NextApiRequest, NextApiResponse } from 'next'
import {
  getDecryptedYouTubeAuth,
  getYouTubeAuthRecord,
  updateYouTubeAuthValidation,
  validateYouTubeAuthLocal,
} from '~/lib/youtube/auth'
import { requireUserId } from '~/lib/requestAuth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = requireUserId(req, res)
  if (!userId) return

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).end()
    return
  }

  const record = await getYouTubeAuthRecord(userId)
  if (!record) {
    res.status(404).json({ error: 'YouTube credential is not configured' })
    return
  }

  try {
    const auth = await getDecryptedYouTubeAuth(userId)
    if (!auth) {
      res.status(422).json({ error: 'Credential decryption failed' })
      return
    }

    const validation = validateYouTubeAuthLocal(auth)
    await updateYouTubeAuthValidation(
      userId,
      validation.valid ? 'valid' : 'invalid',
      validation.valid ? undefined : validation.message,
    )
    const latest = await getYouTubeAuthRecord(userId)
    res.status(200).json({
      ok: validation.valid,
      validation,
      status: latest?.status || 'unknown',
      lastValidatedAt: latest?.lastValidatedAt || null,
      lastError: latest?.lastError || null,
    })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Credential validation failed' })
  }
}
