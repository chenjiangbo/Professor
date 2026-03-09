import type { NextApiRequest, NextApiResponse } from 'next'
import { buildBilibiliPreviewItems, isBilibiliUrl, splitInputUrls } from '~/lib/bilibili/preview'
import { buildYouTubePreviewItems, isYouTubeUrl } from '~/lib/youtube/preview'
import { buildDouyinPreviewItems, isDouyinUrl } from '~/lib/douyin/preview'
import { runVideoImportInBackground } from '~/lib/import/processVideoImport'
import { countUserImportsToday, createImportBatch, createVideo, getAppSetting } from '~/lib/repo'
import {
  DEFAULT_INTERPRETATION_MODE,
  DEFAULT_INTERPRETATION_MODE_SETTING_KEY,
  normalizeInterpretationMode,
  type InterpretationMode,
} from '~/lib/interpretationMode'
import { VideoService } from '~/lib/types'
import { isOwnershipError } from '~/lib/repo-errors'
import { isAdminUserId, requireUserId } from '~/lib/requestAuth'
import { parseRequiredAppLanguage } from '~/lib/i18n'
import { getActiveSubscriptionTierByUserId } from '~/lib/billing/repo'
import { getDailyImportLimitByTier } from '~/lib/billing/entitlements'

const MAX_BATCH_ITEMS = Number(process.env.MAX_IMPORT_BATCH_ITEMS || 200)
type ImportExpandMode = 'current' | 'all'

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function tx(lang: 'zh-CN' | 'en-US', en: string, zh: string) {
  return lang === 'zh-CN' ? zh : en
}

function mapDouyinPreviewError(reason: string, lang: 'zh-CN' | 'en-US') {
  const raw = String(reason || '')
  if (/fresh cookies/i.test(raw) || /requires fresh cookies/i.test(raw)) {
    return tx(
      lang,
      'Douyin request was blocked by risk control. This can happen even with newly pasted cookies. Common causes: cookie freshness, IP/environment mismatch, or upstream extractor limitations. Go to Settings and reconfigure Douyin auth (cookies.txt recommended).',
      '抖音请求被风控拦截，这在刚更新 Cookie 后也可能发生。常见原因包括：Cookie 新鲜度、IP/环境不一致，或上游解析器限制。请前往设置页重新配置抖音认证（推荐 cookies.txt）。',
    )
  }
  if (/no douyin credential is configured/i.test(raw)) {
    return tx(
      lang,
      'Douyin auth is not configured. Go to Settings and add Douyin cookie/cookies.txt first.',
      '抖音认证尚未配置。请先前往设置页添加抖音 Cookie/cookies.txt。',
    )
  }
  if (/could not be decrypted|invalid/i.test(raw) && /douyin/i.test(raw)) {
    return tx(
      lang,
      'Saved Douyin auth is invalid. Go to Settings and save/validate it again.',
      '已保存的抖音认证无效。请前往设置页重新保存并校验。',
    )
  }
  return raw || tx(lang, 'Douyin URL parse failed', '抖音链接解析失败')
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
    interpretationMode !== 'extract' &&
    interpretationMode !== 'none'
  ) {
    res.status(400).json({ error: 'interpretationMode must be "concise", "detailed", "extract", or "none"' })
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

  const invalidUrls = parsedUrls.filter((u) => !isBilibiliUrl(u) && !isYouTubeUrl(u) && !isDouyinUrl(u))
  const bilibiliUrls = parsedUrls.filter((u) => isBilibiliUrl(u))
  const youtubeUrls = parsedUrls.filter((u) => isYouTubeUrl(u))
  const douyinUrls = parsedUrls.filter((u) => isDouyinUrl(u))

  if (!bilibiliUrls.length && !youtubeUrls.length && !douyinUrls.length) {
    res.status(400).json({ error: 'Only Bilibili, YouTube, or Douyin URLs are supported', invalidUrls })
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
    const douyinItems = (
      await Promise.all(
        douyinUrls.map(async (url) => {
          try {
            return await buildDouyinPreviewItems(userId, url, { expandMode: 'current' })
          } catch (e: any) {
            previewErrors.push({ url, reason: mapDouyinPreviewError(e?.message || '', targetLanguage) })
            return []
          }
        }),
      )
    ).flat()
    const expandedItems = [...bilibiliItems, ...youtubeItems, ...douyinItems]

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

    const { tier } = await getActiveSubscriptionTierByUserId(userId)
    const effectiveTier = isAdminUserId(userId) ? 'premium' : tier
    const dailyLimit = getDailyImportLimitByTier(effectiveTier)
    if (dailyLimit !== null) {
      const importedToday = await countUserImportsToday(userId)
      const projected = importedToday + expandedItems.length
      if (projected > dailyLimit) {
        const remaining = Math.max(0, dailyLimit - importedToday)
        res.status(403).json({
          error: `Daily import limit reached for ${effectiveTier} tier. Imported today: ${importedToday}/${dailyLimit}. Remaining today: ${remaining}.`,
          tier: effectiveTier,
          importedToday,
          dailyLimit,
          requested: expandedItems.length,
          remaining,
        })
        return
      }
    }

    const batch = await createImportBatch(userId, notebookId, expandedItems.length)

    const createdItems = []
    for (const item of expandedItems) {
      const sourceType =
        item.platform === VideoService.YouTube
          ? 'youtube'
          : item.platform === VideoService.Douyin
          ? 'douyin'
          : 'bilibili'
      const importVideoId =
        sourceType === 'bilibili' ? String(item.externalId || '').split('-p')[0] : String(item.externalId || '')
      const created = await createVideo(userId, {
        notebookId,
        batchId: batch.id,
        platform: item.platform,
        sourceType,
        generationProfile: selectedMode === 'none' ? 'import_only' : 'full_interpretation',
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
