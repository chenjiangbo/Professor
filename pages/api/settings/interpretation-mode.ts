import type { NextApiRequest, NextApiResponse } from 'next'
import {
  DEFAULT_INTERPRETATION_MODE,
  DEFAULT_INTERPRETATION_MODE_SETTING_KEY,
  normalizeInterpretationMode,
} from '~/lib/interpretationMode'
import { getAppSetting, setAppSetting } from '~/lib/repo'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const saved = await getAppSetting(DEFAULT_INTERPRETATION_MODE_SETTING_KEY)
    const mode = normalizeInterpretationMode(saved || DEFAULT_INTERPRETATION_MODE)
    res.status(200).json({ mode })
    return
  }

  if (req.method === 'POST') {
    const { mode } = req.body || {}
    if (mode !== 'concise' && mode !== 'detailed') {
      res.status(400).json({ error: 'mode must be "concise" or "detailed"' })
      return
    }
    await setAppSetting(DEFAULT_INTERPRETATION_MODE_SETTING_KEY, mode)
    res.status(200).json({ ok: true, mode })
    return
  }

  res.setHeader('Allow', 'GET,POST')
  res.status(405).end()
}
