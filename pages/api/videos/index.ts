import type { NextApiRequest, NextApiResponse } from 'next'
import { createVideo, getVideo, updateVideoForUser } from '~/lib/repo'
import { extractPageNumberFromUrl, isBilibiliUrl, normalizeBilibiliVideoId } from '~/lib/bilibili/preview'
import { isYouTubeUrl, normalizeYouTubeVideoId } from '~/lib/youtube/preview'
import { isDouyinUrl, normalizeDouyinVideoId } from '~/lib/douyin/preview'
import { runVideoImportInBackground } from '~/lib/import/processVideoImport'
import { normalizeInterpretationMode } from '~/lib/interpretationMode'
import { VideoService } from '~/lib/types'
import { isOwnershipError } from '~/lib/repo-errors'
import { requireUserId } from '~/lib/requestAuth'
import { normalizeAppLanguage, parseRequiredAppLanguage } from '~/lib/i18n'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = requireUserId(req, res)
  if (!userId) return

  if (req.method === 'GET') {
    const { id, lang } = req.query
    if (!id || typeof id !== 'string') {
      res.status(400).json({ error: 'Missing required parameter: id' })
      return
    }
    const language = typeof lang === 'string' ? normalizeAppLanguage(lang) : undefined
    const video = await getVideo(userId, id, language)
    if (!video) {
      res.status(404).json({ error: 'Resource not found' })
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
      contentLanguage,
    } = req.body || {}
    if (!url || !notebookId) {
      res.status(400).json({ error: 'Missing required parameters: url and notebookId' })
      return
    }

    const isBili = isBilibiliUrl(url)
    const isYT = isYouTubeUrl(url)
    const isDY = isDouyinUrl(url)
    if (!isBili && !isYT && !isDY) {
      res.status(400).json({ error: 'Only Bilibili, YouTube, or Douyin URLs are supported' })
      return
    }
    let targetLanguage: 'zh-CN' | 'en-US'
    try {
      targetLanguage = parseRequiredAppLanguage(contentLanguage)
    } catch (e: any) {
      res.status(400).json({ error: e?.message || 'Invalid contentLanguage' })
      return
    }

    const service = isBili ? VideoService.Bilibili : isDY ? VideoService.Douyin : VideoService.YouTube
    const sourceType = isBili ? 'bilibili' : isDY ? 'douyin' : 'youtube'
    const videoId = isBili
      ? normalizeBilibiliVideoId(url)
      : isDY
      ? normalizeDouyinVideoId(url)
      : normalizeYouTubeVideoId(url)
    const pageNumber = isBili ? extractPageNumberFromUrl(url) : undefined

    let created
    try {
      created = await createVideo(userId, {
        notebookId,
        platform: service,
        sourceType,
        generationProfile: 'full_interpretation',
        externalId: videoId,
        sourceUrl: url,
        title: 'Importing...',
        status: 'queued',
        interpretationMode: normalizeInterpretationMode(interpretationMode),
      })
    } catch (error) {
      if (isOwnershipError(error)) {
        res.status(404).json({ error: (error as Error).message })
        return
      }
      throw error
    }

    runVideoImportInBackground({
      userId,
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
      contentLanguage: targetLanguage,
    })

    res.status(201).json(created)
    return
  }

  if (req.method === 'PATCH') {
    const { id, summary, status, title, chapters } = req.body || {}
    if (!id) {
      res.status(400).json({ error: 'Missing required parameter: id' })
      return
    }
    const updated = await updateVideoForUser(userId, id, { summary, status, title, chapters })
    if (!updated) {
      res.status(404).json({ error: 'Resource not found' })
      return
    }
    res.status(200).json(updated)
    return
  }

  res.setHeader('Allow', 'GET,POST,PATCH')
  res.status(405).end()
}
