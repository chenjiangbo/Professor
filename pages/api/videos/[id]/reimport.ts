import type { NextApiRequest, NextApiResponse } from 'next'
import { getVideo, updateVideoForUser } from '~/lib/repo'
import { runVideoImportInBackground } from '~/lib/import/processVideoImport'
import { extractPageNumberFromUrl } from '~/lib/bilibili/preview'
import { normalizeInterpretationMode } from '~/lib/interpretationMode'
import { VideoService } from '~/lib/types'
import { requireUserId } from '~/lib/requestAuth'
import { parseRequiredAppLanguage } from '~/lib/i18n'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = requireUserId(req, res)
  if (!userId) return

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).end()
    return
  }

  const { id } = req.query
  if (!id || typeof id !== 'string') {
    res.status(400).json({ error: 'Missing required parameter: id' })
    return
  }

  const current = await getVideo(userId, id)
  if (!current) {
    res.status(404).json({ error: 'Resource not found' })
    return
  }

  if (String(current.status || '').startsWith('processing')) {
    res.status(409).json({ error: 'This resource is still processing. Please retry later.' })
    return
  }

  const rawRequestedMode = (req.body || {}).interpretationMode
  let targetLanguage: 'zh-CN' | 'en-US'
  try {
    targetLanguage = parseRequiredAppLanguage((req.body || {}).contentLanguage)
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Invalid contentLanguage' })
    return
  }
  const requestedMode =
    rawRequestedMode === 'concise' ||
    rawRequestedMode === 'detailed' ||
    rawRequestedMode === 'extract' ||
    rawRequestedMode === 'none'
      ? normalizeInterpretationMode(rawRequestedMode)
      : null
  const sourceUrl = String(current.source_url || '')
  const externalId = String(current.external_id || '')
  const bvid = externalId.split('-p')[0] || externalId
  const pageNumber = extractPageNumberFromUrl(sourceUrl)
  const interpretationMode = normalizeInterpretationMode(requestedMode || current.interpretation_mode)
  const sourceType = (String(current.source_type || '').toLowerCase() || 'bilibili') as
    | 'bilibili'
    | 'youtube'
    | 'douyin'
    | 'text'
    | 'file'
  const transcript = String(current.transcript || '').trim()

  const reset = await updateVideoForUser(userId, id, {
    status: 'queued',
    summary: null,
    chapters: null,
    transcript: sourceType === 'bilibili' ? null : transcript,
    subtitle_language: sourceType === 'bilibili' ? null : current.subtitle_language || null,
    subtitle_source: sourceType === 'bilibili' ? null : current.subtitle_source || 'direct-import',
    interpretation_mode: interpretationMode,
    generation_profile: interpretationMode === 'none' ? 'import_only' : 'full_interpretation',
    last_error: null,
  })

  if (sourceType === 'bilibili' || sourceType === 'youtube' || sourceType === 'douyin') {
    runVideoImportInBackground({
      userId,
      dbVideoId: id,
      sourceType,
      videoId: bvid,
      sourceUrl,
      service:
        sourceType === 'bilibili'
          ? VideoService.Bilibili
          : sourceType === 'douyin'
          ? VideoService.Douyin
          : VideoService.YouTube,
      pageNumber,
      interpretationMode,
      contentLanguage: targetLanguage,
    })
  } else {
    if (!transcript) {
      await updateVideoForUser(userId, id, {
        status: 'error',
        summary: 'Reimport failed: source text is empty.',
        last_error: 'Source text is empty.',
      })
      res.status(422).json({ error: 'Reimport failed: source text is empty.' })
      return
    }
    runVideoImportInBackground({
      userId,
      dbVideoId: id,
      sourceType,
      rawTitle: String(current.title || 'Imported content'),
      rawText: transcript,
      sourceMime: String(current.source_mime || ''),
      generationProfile: interpretationMode === 'none' ? 'import_only' : 'full_interpretation',
      interpretationMode,
      contentLanguage: targetLanguage,
    })
  }

  res.status(202).json(reset)
}
