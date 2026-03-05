import type { NextApiRequest, NextApiResponse } from 'next'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import {
  buildDouyinAuthArgs,
  getDecryptedDouyinAuth,
  getDouyinAuthRecord,
  updateDouyinAuthValidation,
  validateDouyinAuthLocal,
} from '~/lib/douyin/auth'
import { requireUserId } from '~/lib/requestAuth'
import { runYtDlpJson } from '~/lib/youtube/ytdlp'

const DOUYIN_VALIDATE_URL = 'https://www.douyin.com/video/7595190138609126265'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = requireUserId(req, res)
  if (!userId) return

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).end()
    return
  }

  const record = await getDouyinAuthRecord(userId)
  if (!record) {
    res.status(404).json({ error: 'Douyin credential is not configured' })
    return
  }

  try {
    const auth = await getDecryptedDouyinAuth(userId)
    if (!auth) {
      res.status(422).json({ error: 'Credential decryption failed' })
      return
    }

    const localValidation = validateDouyinAuthLocal(auth)
    if (!localValidation.valid) {
      await updateDouyinAuthValidation(userId, 'invalid', localValidation.message)
      const latest = await getDouyinAuthRecord(userId)
      res.status(200).json({
        ok: false,
        validation: localValidation,
        status: latest?.status || 'unknown',
        lastValidatedAt: latest?.lastValidatedAt || null,
        lastError: latest?.lastError || null,
      })
      return
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'douyin-auth-validate-'))
    let validation: { valid: boolean; message: string }
    try {
      const authArgs = await buildDouyinAuthArgs(userId, tempDir)
      await runYtDlpJson([...authArgs, '--no-playlist', DOUYIN_VALIDATE_URL], tempDir)
      validation = { valid: true, message: 'Remote validation passed via yt-dlp.' }
    } catch (e: any) {
      const message = String(e?.message || '')
      validation = {
        valid: false,
        message: `Remote validation failed: ${message || 'yt-dlp request failed'}`,
      }
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
    }

    await updateDouyinAuthValidation(
      userId,
      validation.valid ? 'valid' : 'invalid',
      validation.valid ? undefined : validation.message,
    )
    const latest = await getDouyinAuthRecord(userId)
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
