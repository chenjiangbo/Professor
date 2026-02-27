import type { NextApiRequest, NextApiResponse } from 'next'
import { getVideo, updateVideo } from '~/lib/repo'
import { runVideoImportInBackground } from '~/lib/import/processVideoImport'
import { extractPageNumberFromUrl } from '~/lib/bilibili/preview'
import { normalizeInterpretationMode } from '~/lib/interpretationMode'
import { VideoService } from '~/lib/types'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).end()
    return
  }

  const { id } = req.query
  if (!id || typeof id !== 'string') {
    res.status(400).json({ error: '缺少参数 id' })
    return
  }

  const current = await getVideo(id)
  if (!current) {
    res.status(404).json({ error: '资源不存在' })
    return
  }

  if (String(current.status || '').startsWith('processing')) {
    res.status(409).json({ error: '该资源正在处理中，请稍后重试。' })
    return
  }

  const rawRequestedMode = (req.body || {}).interpretationMode
  const requestedMode =
    rawRequestedMode === 'concise' || rawRequestedMode === 'detailed' || rawRequestedMode === 'none'
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
    | 'text'
    | 'file'
  const transcript = String(current.transcript || '').trim()

  const reset = await updateVideo(id, {
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

  if (sourceType === 'bilibili' || sourceType === 'youtube') {
    runVideoImportInBackground({
      dbVideoId: id,
      sourceType,
      videoId: bvid,
      sourceUrl,
      service: sourceType === 'bilibili' ? VideoService.Bilibili : VideoService.YouTube,
      pageNumber,
      interpretationMode,
    })
  } else {
    if (!transcript) {
      await updateVideo(id, {
        status: 'error',
        summary: '重新导入失败：原文内容为空。',
        last_error: '原文内容为空。',
      })
      res.status(422).json({ error: '重新导入失败：原文内容为空。' })
      return
    }
    runVideoImportInBackground({
      dbVideoId: id,
      sourceType,
      rawTitle: String(current.title || '导入内容'),
      rawText: transcript,
      sourceMime: String(current.source_mime || ''),
      generationProfile: interpretationMode === 'none' ? 'import_only' : 'full_interpretation',
      interpretationMode,
    })
  }

  res.status(202).json(reset)
}
