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
    res.status(400).json({ error: 'id required' })
    return
  }

  const current = await getVideo(id)
  if (!current) {
    res.status(404).json({ error: 'not found' })
    return
  }

  if (String(current.platform || '').toLowerCase() !== VideoService.Bilibili) {
    res.status(400).json({ error: 'Only Bilibili videos support re-import now.' })
    return
  }

  if (String(current.status || '').startsWith('processing')) {
    res.status(409).json({ error: 'Video is already processing.' })
    return
  }

  const sourceUrl = String(current.source_url || '')
  const externalId = String(current.external_id || '')
  const bvid = externalId.split('-p')[0] || externalId
  const pageNumber = extractPageNumberFromUrl(sourceUrl)
  const interpretationMode = normalizeInterpretationMode(current.interpretation_mode)

  const reset = await updateVideo(id, {
    status: 'queued',
    summary: null,
    chapters: null,
    transcript: null,
    subtitle_language: null,
    subtitle_source: null,
    last_error: null,
  })

  runVideoImportInBackground({
    dbVideoId: id,
    videoId: bvid,
    sourceUrl,
    service: VideoService.Bilibili,
    pageNumber,
    interpretationMode,
  })

  res.status(202).json(reset)
}
