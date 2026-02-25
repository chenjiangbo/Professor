import type { NextApiRequest, NextApiResponse } from 'next'
import {
  buildBilibiliPreviewItems,
  isBilibiliUrl,
  splitInputUrls,
  type BilibiliExpandMode,
} from '~/lib/bilibili/preview'
import { runVideoImportInBackground } from '~/lib/import/processVideoImport'
import { createImportBatch, createVideo, getAppSetting } from '~/lib/repo'
import {
  DEFAULT_INTERPRETATION_MODE,
  DEFAULT_INTERPRETATION_MODE_SETTING_KEY,
  normalizeInterpretationMode,
  type InterpretationMode,
} from '~/lib/interpretationMode'
import { VideoService } from '~/lib/types'

const MAX_BATCH_ITEMS = Number(process.env.MAX_IMPORT_BATCH_ITEMS || 200)

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).end()
    return
  }

  const { notebookId, urls, expandMode, interpretationMode } = req.body || {}
  if (!notebookId || !urls) {
    res.status(400).json({ error: 'notebookId and urls are required' })
    return
  }
  if (typeof notebookId !== 'string' || !isUuid(notebookId)) {
    res.status(400).json({ error: 'notebookId must be a valid UUID' })
    return
  }
  if (expandMode && expandMode !== 'current' && expandMode !== 'all') {
    res.status(400).json({ error: 'expandMode must be "current" or "all"' })
    return
  }
  if (interpretationMode && interpretationMode !== 'concise' && interpretationMode !== 'detailed') {
    res.status(400).json({ error: 'interpretationMode must be "concise" or "detailed"' })
    return
  }

  const parsedUrls = Array.isArray(urls)
    ? urls.map((u: string) => String(u || '').trim()).filter(Boolean)
    : splitInputUrls(String(urls || ''))

  if (!parsedUrls.length) {
    res.status(400).json({ error: 'No valid URL found in input.' })
    return
  }

  const invalidUrls = parsedUrls.filter((u) => !isBilibiliUrl(u))
  const bilibiliUrls = parsedUrls.filter((u) => isBilibiliUrl(u))

  if (!bilibiliUrls.length) {
    res.status(400).json({ error: 'Only Bilibili URLs are supported now.', invalidUrls })
    return
  }

  try {
    const mode: BilibiliExpandMode = expandMode === 'all' ? 'all' : 'current'
    const defaultMode = normalizeInterpretationMode(
      (await getAppSetting(DEFAULT_INTERPRETATION_MODE_SETTING_KEY)) || DEFAULT_INTERPRETATION_MODE,
    )
    const selectedMode: InterpretationMode = normalizeInterpretationMode(interpretationMode || defaultMode)
    const expandedItems = (
      await Promise.all(
        bilibiliUrls.map(async (url) => {
          try {
            return await buildBilibiliPreviewItems(url, { expandMode: mode })
          } catch (e) {
            return []
          }
        }),
      )
    ).flat()

    if (!expandedItems.length) {
      res.status(422).json({ error: 'No importable Bilibili items found.', invalidUrls })
      return
    }
    if (expandedItems.length > MAX_BATCH_ITEMS) {
      res.status(422).json({
        error: `Too many expanded items (${expandedItems.length}). Please reduce URLs or use expandMode="current".`,
        invalidUrls,
      })
      return
    }

    const batch = await createImportBatch(notebookId, expandedItems.length)

    const createdItems = []
    for (const item of expandedItems) {
      const created = await createVideo({
        notebookId,
        batchId: batch.id,
        platform: VideoService.Bilibili,
        externalId: item.externalId,
        sourceUrl: item.sourceUrl,
        title: item.title || 'Importing...',
        status: 'queued',
        interpretationMode: selectedMode,
      })
      createdItems.push(created)

      const bvid = item.externalId.split('-p')[0]
      runVideoImportInBackground({
        dbVideoId: created.id,
        videoId: bvid,
        sourceUrl: item.sourceUrl,
        service: VideoService.Bilibili,
        pageNumber: item.pageNumber,
        interpretationMode: selectedMode,
      })
    }

    res.status(202).json({
      batchId: batch.id,
      total: createdItems.length,
      expandMode: mode,
      interpretationMode: selectedMode,
      invalidUrls,
      items: createdItems,
    })
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to create import batch' })
  }
}
