import type { NextApiRequest, NextApiResponse } from 'next'
import { buildBilibiliPreviewItems, isBilibiliUrl, splitInputUrls } from '~/lib/bilibili/preview'
import { buildYouTubePreviewItems, isYouTubeUrl } from '~/lib/youtube/preview'
import { runVideoImportInBackground } from '~/lib/import/processVideoImport'
import { createImportBatch, createVideo, getAppSetting } from '~/lib/repo'
import {
  DEFAULT_INTERPRETATION_MODE,
  DEFAULT_INTERPRETATION_MODE_SETTING_KEY,
  normalizeInterpretationMode,
  type InterpretationMode,
} from '~/lib/interpretationMode'
import { VideoService } from '~/lib/types'
import { isOwnershipError } from '~/lib/repo-errors'
import { requireUserId } from '~/lib/requestAuth'
import { parseRequiredAppLanguage } from '~/lib/i18n'

const MAX_BATCH_ITEMS = Number(process.env.MAX_IMPORT_BATCH_ITEMS || 200)
type ImportExpandMode = 'current' | 'all'

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = requireUserId(req, res)
  if (!userId) return

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).end()
    return
  }

  const { notebookId, urls, expandMode, interpretationMode, contentLanguage } = req.body || {}
  if (!notebookId || !urls) {
    res.status(400).json({ error: 'Missing required parameters: notebookId and urls' })
    return
  }
  if (typeof notebookId !== 'string' || !isUuid(notebookId)) {
    res.status(400).json({ error: 'Invalid notebookId format (must be UUID)' })
    return
  }
  if (expandMode && expandMode !== 'current' && expandMode !== 'all') {
    res.status(400).json({ error: 'expandMode must be "current" or "all"' })
    return
  }
  if (
    interpretationMode &&
    interpretationMode !== 'concise' &&
    interpretationMode !== 'detailed' &&
    interpretationMode !== 'none'
  ) {
    res.status(400).json({ error: 'interpretationMode must be "concise", "detailed", or "none"' })
    return
  }
  let targetLanguage: 'zh-CN' | 'en-US'
  try {
    targetLanguage = parseRequiredAppLanguage(contentLanguage)
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Invalid contentLanguage' })
    return
  }

  const parsedUrls = Array.isArray(urls)
    ? urls.map((u: string) => String(u || '').trim()).filter(Boolean)
    : splitInputUrls(String(urls || ''))

  if (!parsedUrls.length) {
    res.status(400).json({ error: 'No valid URLs were parsed' })
    return
  }

  const invalidUrls = parsedUrls.filter((u) => !isBilibiliUrl(u) && !isYouTubeUrl(u))
  const bilibiliUrls = parsedUrls.filter((u) => isBilibiliUrl(u))
  const youtubeUrls = parsedUrls.filter((u) => isYouTubeUrl(u))

  if (!bilibiliUrls.length && !youtubeUrls.length) {
    res.status(400).json({ error: 'Only Bilibili or YouTube URLs are supported', invalidUrls })
    return
  }

  try {
    const mode: ImportExpandMode = expandMode === 'all' ? 'all' : 'current'
    const defaultMode = normalizeInterpretationMode(
      (await getAppSetting(userId, DEFAULT_INTERPRETATION_MODE_SETTING_KEY)) || DEFAULT_INTERPRETATION_MODE,
    )
    const selectedMode: InterpretationMode = normalizeInterpretationMode(interpretationMode || defaultMode)
    const previewErrors: Array<{ url: string; reason: string }> = []
    const bilibiliItems = (
      await Promise.all(
        bilibiliUrls.map(async (url) => {
          try {
            return await buildBilibiliPreviewItems(url, { expandMode: mode })
          } catch (e: any) {
            previewErrors.push({ url, reason: e?.message || 'Bilibili URL parse failed' })
            return []
          }
        }),
      )
    ).flat()
    const youtubeItems = (
      await Promise.all(
        youtubeUrls.map(async (url) => {
          try {
            return await buildYouTubePreviewItems(userId, url, { expandMode: mode })
          } catch (e: any) {
            previewErrors.push({ url, reason: e?.message || 'YouTube URL parse failed' })
            return []
          }
        }),
      )
    ).flat()
    const expandedItems = [...bilibiliItems, ...youtubeItems]

    if (!expandedItems.length) {
      res.status(422).json({ error: 'No importable video items found', invalidUrls, previewErrors })
      return
    }
    if (expandedItems.length > MAX_BATCH_ITEMS) {
      res.status(422).json({
        error: `Too many expanded items (${expandedItems.length}). Reduce URL count or use expandMode="current".`,
        invalidUrls,
      })
      return
    }

    const batch = await createImportBatch(userId, notebookId, expandedItems.length)

    const createdItems = []
    for (const item of expandedItems) {
      const sourceType = item.platform === VideoService.YouTube ? 'youtube' : 'bilibili'
      const importVideoId =
        sourceType === 'bilibili' ? String(item.externalId || '').split('-p')[0] : String(item.externalId || '')
      const created = await createVideo(userId, {
        notebookId,
        batchId: batch.id,
        platform: item.platform,
        sourceType,
        generationProfile: 'full_interpretation',
        externalId: item.externalId,
        sourceUrl: item.sourceUrl,
        title: item.title || 'Importing...',
        status: 'queued',
        interpretationMode: selectedMode,
      })
      createdItems.push(created)

      runVideoImportInBackground({
        userId,
        dbVideoId: created.id,
        sourceType,
        videoId: importVideoId,
        sourceUrl: item.sourceUrl,
        service: item.platform,
        pageNumber: sourceType === 'bilibili' ? (item as any).pageNumber : undefined,
        interpretationMode: selectedMode,
        contentLanguage: targetLanguage,
      })
    }

    res.status(202).json({
      batchId: batch.id,
      total: createdItems.length,
      expandMode: mode,
      interpretationMode: selectedMode,
      contentLanguage: targetLanguage,
      invalidUrls,
      previewErrors,
      items: createdItems,
    })
  } catch (e: any) {
    if (isOwnershipError(e)) {
      res.status(404).json({ error: e.message })
      return
    }
    res.status(500).json({ error: e.message || 'Failed to create batch import task' })
  }
}
