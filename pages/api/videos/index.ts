import type { NextApiRequest, NextApiResponse } from 'next'
import { createVideo, getVideo, updateVideo } from '~/lib/repo'
import { extractPageNumberFromUrl, isBilibiliUrl, normalizeBilibiliVideoId } from '~/lib/bilibili/preview'
import { runVideoImportInBackground } from '~/lib/import/processVideoImport'
import { normalizeInterpretationMode } from '~/lib/interpretationMode'
import { VideoService } from '~/lib/types'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const { id } = req.query
    if (!id || typeof id !== 'string') {
      res.status(400).json({ error: 'id required' })
      return
    }
    const video = await getVideo(id)
    if (!video) {
      res.status(404).json({ error: 'not found' })
      return
    }
    res.status(200).json(video)
    return
  }

  if (req.method === 'POST') {
    const {
      url,
      notebookId,
      detailLevel = 600,
      showEmoji = true,
      outlineLevel = 1,
      sentenceNumber = 5,
      outputLanguage,
      interpretationMode,
    } = req.body || {}
    if (!url || !notebookId) {
      res.status(400).json({ error: 'url and notebookId required' })
      return
    }

    if (!isBilibiliUrl(url)) {
      res.status(400).json({ error: 'Only Bilibili URLs are supported now.' })
      return
    }

    const videoId = normalizeBilibiliVideoId(url)
    const pageNumber = extractPageNumberFromUrl(url)

    const created = await createVideo({
      notebookId,
      platform: VideoService.Bilibili,
      sourceType: 'bilibili',
      generationProfile: 'full_interpretation',
      externalId: videoId,
      sourceUrl: url,
      title: 'Importing...',
      status: 'queued',
      interpretationMode: normalizeInterpretationMode(interpretationMode),
    })

    runVideoImportInBackground({
      dbVideoId: created.id,
      sourceType: 'bilibili',
      videoId,
      sourceUrl: url,
      service: VideoService.Bilibili,
      pageNumber,
      detailLevel,
      showEmoji,
      outlineLevel,
      sentenceNumber,
      outputLanguage,
      interpretationMode: normalizeInterpretationMode(interpretationMode),
    })

    res.status(201).json(created)
    return
  }

  if (req.method === 'PATCH') {
    const { id, summary, status, title, chapters } = req.body || {}
    if (!id) {
      res.status(400).json({ error: 'id required' })
      return
    }
    const updated = await updateVideo(id, { summary, status, title, chapters })
    if (!updated) {
      res.status(404).json({ error: 'not found' })
      return
    }
    res.status(200).json(updated)
    return
  }

  res.setHeader('Allow', 'GET,POST,PATCH')
  res.status(405).end()
}
