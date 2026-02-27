import type { NextApiRequest, NextApiResponse } from 'next'
import { createVideo, getVideo, updateVideo } from '~/lib/repo'
import { extractPageNumberFromUrl, isBilibiliUrl, normalizeBilibiliVideoId } from '~/lib/bilibili/preview'
import { isYouTubeUrl, normalizeYouTubeVideoId } from '~/lib/youtube/preview'
import { runVideoImportInBackground } from '~/lib/import/processVideoImport'
import { normalizeInterpretationMode } from '~/lib/interpretationMode'
import { VideoService } from '~/lib/types'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const { id } = req.query
    if (!id || typeof id !== 'string') {
      res.status(400).json({ error: '缺少参数 id' })
      return
    }
    const video = await getVideo(id)
    if (!video) {
      res.status(404).json({ error: '资源不存在' })
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
      res.status(400).json({ error: '缺少必要参数：url 和 notebookId' })
      return
    }

    const isBili = isBilibiliUrl(url)
    const isYT = isYouTubeUrl(url)
    if (!isBili && !isYT) {
      res.status(400).json({ error: '当前仅支持 B 站或 YouTube URL' })
      return
    }

    const service = isBili ? VideoService.Bilibili : VideoService.YouTube
    const sourceType = isBili ? 'bilibili' : 'youtube'
    const videoId = isBili ? normalizeBilibiliVideoId(url) : normalizeYouTubeVideoId(url)
    const pageNumber = isBili ? extractPageNumberFromUrl(url) : undefined

    const created = await createVideo({
      notebookId,
      platform: service,
      sourceType,
      generationProfile: 'full_interpretation',
      externalId: videoId,
      sourceUrl: url,
      title: '导入中...',
      status: 'queued',
      interpretationMode: normalizeInterpretationMode(interpretationMode),
    })

    runVideoImportInBackground({
      dbVideoId: created.id,
      sourceType,
      videoId,
      sourceUrl: url,
      service,
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
      res.status(400).json({ error: '缺少参数 id' })
      return
    }
    const updated = await updateVideo(id, { summary, status, title, chapters })
    if (!updated) {
      res.status(404).json({ error: '资源不存在' })
      return
    }
    res.status(200).json(updated)
    return
  }

  res.setHeader('Allow', 'GET,POST,PATCH')
  res.status(405).end()
}
