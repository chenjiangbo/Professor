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

const MAX_BATCH_ITEMS = Number(process.env.MAX_IMPORT_BATCH_ITEMS || 200)
type ImportExpandMode = 'current' | 'all'

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
    res.status(400).json({ error: '缺少必要参数：notebookId 和 urls' })
    return
  }
  if (typeof notebookId !== 'string' || !isUuid(notebookId)) {
    res.status(400).json({ error: 'notebookId 格式不合法（必须是 UUID）' })
    return
  }
  if (expandMode && expandMode !== 'current' && expandMode !== 'all') {
    res.status(400).json({ error: 'expandMode 只能是 "current" 或 "all"' })
    return
  }
  if (
    interpretationMode &&
    interpretationMode !== 'concise' &&
    interpretationMode !== 'detailed' &&
    interpretationMode !== 'none'
  ) {
    res.status(400).json({ error: 'interpretationMode 只能是 "concise"、"detailed" 或 "none"' })
    return
  }

  const parsedUrls = Array.isArray(urls)
    ? urls.map((u: string) => String(u || '').trim()).filter(Boolean)
    : splitInputUrls(String(urls || ''))

  if (!parsedUrls.length) {
    res.status(400).json({ error: '未解析到有效 URL' })
    return
  }

  const invalidUrls = parsedUrls.filter((u) => !isBilibiliUrl(u) && !isYouTubeUrl(u))
  const bilibiliUrls = parsedUrls.filter((u) => isBilibiliUrl(u))
  const youtubeUrls = parsedUrls.filter((u) => isYouTubeUrl(u))

  if (!bilibiliUrls.length && !youtubeUrls.length) {
    res.status(400).json({ error: '当前仅支持 B 站或 YouTube URL', invalidUrls })
    return
  }

  try {
    const mode: ImportExpandMode = expandMode === 'all' ? 'all' : 'current'
    const defaultMode = normalizeInterpretationMode(
      (await getAppSetting(DEFAULT_INTERPRETATION_MODE_SETTING_KEY)) || DEFAULT_INTERPRETATION_MODE,
    )
    const selectedMode: InterpretationMode = normalizeInterpretationMode(interpretationMode || defaultMode)
    const previewErrors: Array<{ url: string; reason: string }> = []
    const bilibiliItems = (
      await Promise.all(
        bilibiliUrls.map(async (url) => {
          try {
            return await buildBilibiliPreviewItems(url, { expandMode: mode })
          } catch (e: any) {
            previewErrors.push({ url, reason: e?.message || 'B 站链接解析失败' })
            return []
          }
        }),
      )
    ).flat()
    const youtubeItems = (
      await Promise.all(
        youtubeUrls.map(async (url) => {
          try {
            return await buildYouTubePreviewItems(url, { expandMode: mode })
          } catch (e: any) {
            previewErrors.push({ url, reason: e?.message || 'YouTube 链接解析失败' })
            return []
          }
        }),
      )
    ).flat()
    const expandedItems = [...bilibiliItems, ...youtubeItems]

    if (!expandedItems.length) {
      res.status(422).json({ error: '未找到可导入的视频条目', invalidUrls, previewErrors })
      return
    }
    if (expandedItems.length > MAX_BATCH_ITEMS) {
      res.status(422).json({
        error: `展开后的条目过多（${expandedItems.length}），请减少 URL 数量或使用 expandMode="current"`,
        invalidUrls,
      })
      return
    }

    const batch = await createImportBatch(notebookId, expandedItems.length)

    const createdItems = []
    for (const item of expandedItems) {
      const sourceType = item.platform === VideoService.YouTube ? 'youtube' : 'bilibili'
      const importVideoId =
        sourceType === 'bilibili' ? String(item.externalId || '').split('-p')[0] : String(item.externalId || '')
      const created = await createVideo({
        notebookId,
        batchId: batch.id,
        platform: item.platform,
        sourceType,
        generationProfile: 'full_interpretation',
        externalId: item.externalId,
        sourceUrl: item.sourceUrl,
        title: item.title || '导入中...',
        status: 'queued',
        interpretationMode: selectedMode,
      })
      createdItems.push(created)

      runVideoImportInBackground({
        dbVideoId: created.id,
        sourceType,
        videoId: importVideoId,
        sourceUrl: item.sourceUrl,
        service: item.platform,
        pageNumber: sourceType === 'bilibili' ? (item as any).pageNumber : undefined,
        interpretationMode: selectedMode,
      })
    }

    res.status(202).json({
      batchId: batch.id,
      total: createdItems.length,
      expandMode: mode,
      interpretationMode: selectedMode,
      invalidUrls,
      previewErrors,
      items: createdItems,
    })
  } catch (e: any) {
    res.status(500).json({ error: e.message || '创建批量导入任务失败' })
  }
}
