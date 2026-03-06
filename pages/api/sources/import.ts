import type { NextApiRequest, NextApiResponse } from 'next'
import { randomUUID } from 'crypto'
import { countUserImportsToday, createImportBatch, createVideo, getAppSetting } from '~/lib/repo'
import { runVideoImportInBackground } from '~/lib/import/processVideoImport'
import { extractFileToSource } from '~/lib/source/extract'
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

type ImportItem =
  | { type: 'text'; title?: string; text: string }
  | { type: 'file'; name: string; mimeType?: string; contentBase64: string }

const MAX_ITEMS = Number(process.env.MAX_IMPORT_BATCH_ITEMS || 200)

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '64mb',
    },
  },
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function modeToGenerationProfile(mode: InterpretationMode): 'full_interpretation' | 'summary_only' | 'import_only' {
  if (mode === 'none') return 'import_only'
  return 'full_interpretation'
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = requireUserId(req, res)
  if (!userId) return

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).end()
    return
  }

  const { notebookId, items, interpretationMode, contentLanguage } = req.body || {}
  if (!notebookId || !Array.isArray(items)) {
    res.status(400).json({ error: 'Missing required parameters: notebookId and items' })
    return
  }
  if (typeof notebookId !== 'string' || !isUuid(notebookId)) {
    res.status(400).json({ error: 'Invalid notebookId format (must be UUID)' })
    return
  }
  if (items.length < 1) {
    res.status(400).json({ error: 'items cannot be empty' })
    return
  }
  if (items.length > MAX_ITEMS) {
    res.status(422).json({ error: `Too many import items (${items.length}). Max allowed: ${MAX_ITEMS}` })
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

  const defaultMode = normalizeInterpretationMode(
    (await getAppSetting(userId, DEFAULT_INTERPRETATION_MODE_SETTING_KEY)) || DEFAULT_INTERPRETATION_MODE,
  )
  const selectedMode: InterpretationMode = normalizeInterpretationMode(interpretationMode || defaultMode)

  const { tier } = await getActiveSubscriptionTierByUserId(userId)
  const effectiveTier = isAdminUserId(userId) ? 'premium' : tier
  const dailyLimit = getDailyImportLimitByTier(effectiveTier)
  if (dailyLimit !== null) {
    const importedToday = await countUserImportsToday(userId)
    const projected = importedToday + items.length
    if (projected > dailyLimit) {
      const remaining = Math.max(0, dailyLimit - importedToday)
      res.status(403).json({
        error: `Daily import limit reached for ${effectiveTier} tier. Imported today: ${importedToday}/${dailyLimit}. Remaining today: ${remaining}.`,
        tier: effectiveTier,
        importedToday,
        dailyLimit,
        requested: items.length,
        remaining,
      })
      return
    }
  }

  let batch
  try {
    batch = await createImportBatch(userId, notebookId, items.length)
  } catch (error) {
    if (isOwnershipError(error)) {
      res.status(404).json({ error: (error as Error).message })
      return
    }
    throw error
  }
  const createdItems: any[] = []
  const errors: Array<{ index: number; reason: string }> = []

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i] as ImportItem
    try {
      if (item.type === 'text') {
        const rawText = String(item.text || '').trim()
        if (!rawText) {
          errors.push({ index: i, reason: 'Text content is empty' })
          continue
        }
        const title = String(item.title || '').trim() || `Text ${i + 1}`
        const created = await createVideo(userId, {
          notebookId,
          batchId: batch.id,
          platform: VideoService.Text,
          sourceType: 'text',
          generationProfile: modeToGenerationProfile(selectedMode),
          externalId: `text-${randomUUID()}`,
          sourceUrl: `text://${randomUUID()}`,
          title,
          status: 'queued',
          interpretationMode: selectedMode,
          sourceMime: 'text/plain',
        })
        createdItems.push(created)
        runVideoImportInBackground({
          userId,
          dbVideoId: created.id,
          sourceType: 'text',
          rawTitle: title,
          rawText,
          sourceMime: 'text/plain',
          generationProfile: modeToGenerationProfile(selectedMode),
          interpretationMode: selectedMode,
          contentLanguage: targetLanguage,
        })
        continue
      }

      if (item.type === 'file') {
        const extracted = await extractFileToSource({
          name: item.name,
          mimeType: item.mimeType,
          contentBase64: item.contentBase64,
        })
        const created = await createVideo(userId, {
          notebookId,
          batchId: batch.id,
          platform: VideoService.File,
          sourceType: 'file',
          generationProfile: modeToGenerationProfile(selectedMode),
          externalId: `file-${randomUUID()}`,
          sourceUrl: `file://${encodeURIComponent(item.name || `file-${i + 1}`)}`,
          title: extracted.title || item.name || `File ${i + 1}`,
          status: 'queued',
          interpretationMode: selectedMode,
          sourceMime: extracted.sourceMime || item.mimeType || 'application/octet-stream',
        })
        createdItems.push(created)
        runVideoImportInBackground({
          userId,
          dbVideoId: created.id,
          sourceType: 'file',
          rawTitle: extracted.title || item.name || `File ${i + 1}`,
          rawText: extracted.transcript,
          sourceMime: extracted.sourceMime || item.mimeType || 'application/octet-stream',
          generationProfile: modeToGenerationProfile(selectedMode),
          interpretationMode: selectedMode,
          contentLanguage: targetLanguage,
        })
        continue
      }

      errors.push({ index: i, reason: `Unsupported import type: ${(item as any)?.type || 'unknown'}` })
    } catch (e: any) {
      errors.push({ index: i, reason: e?.message || 'This item failed to import' })
    }
  }

  if (!createdItems.length) {
    res.status(422).json({ error: 'No importable content found', errors })
    return
  }

  res.status(202).json({
    batchId: batch.id,
    total: createdItems.length,
    interpretationMode: selectedMode,
    contentLanguage: targetLanguage,
    errors,
    items: createdItems,
  })
}
