import type { NextApiRequest, NextApiResponse } from 'next'
import { randomUUID } from 'crypto'
import { createImportBatch, createVideo, getAppSetting } from '~/lib/repo'
import { runVideoImportInBackground } from '~/lib/import/processVideoImport'
import { extractFileToSource } from '~/lib/source/extract'
import {
  DEFAULT_INTERPRETATION_MODE,
  DEFAULT_INTERPRETATION_MODE_SETTING_KEY,
  normalizeInterpretationMode,
  type InterpretationMode,
} from '~/lib/interpretationMode'
import { VideoService } from '~/lib/types'

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
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).end()
    return
  }

  const { notebookId, items, interpretationMode } = req.body || {}
  if (!notebookId || !Array.isArray(items)) {
    res.status(400).json({ error: 'notebookId and items are required' })
    return
  }
  if (typeof notebookId !== 'string' || !isUuid(notebookId)) {
    res.status(400).json({ error: 'notebookId must be a valid UUID' })
    return
  }
  if (items.length < 1) {
    res.status(400).json({ error: 'items must not be empty' })
    return
  }
  if (items.length > MAX_ITEMS) {
    res.status(422).json({ error: `Too many items (${items.length}), max is ${MAX_ITEMS}` })
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

  const defaultMode = normalizeInterpretationMode(
    (await getAppSetting(DEFAULT_INTERPRETATION_MODE_SETTING_KEY)) || DEFAULT_INTERPRETATION_MODE,
  )
  const selectedMode: InterpretationMode = normalizeInterpretationMode(interpretationMode || defaultMode)

  const batch = await createImportBatch(notebookId, items.length)
  const createdItems: any[] = []
  const errors: Array<{ index: number; reason: string }> = []

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i] as ImportItem
    try {
      if (item.type === 'text') {
        const rawText = String(item.text || '').trim()
        if (!rawText) {
          errors.push({ index: i, reason: 'Empty text' })
          continue
        }
        const title = String(item.title || '').trim() || `Text ${i + 1}`
        const created = await createVideo({
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
          dbVideoId: created.id,
          sourceType: 'text',
          rawTitle: title,
          rawText,
          sourceMime: 'text/plain',
          generationProfile: modeToGenerationProfile(selectedMode),
          interpretationMode: selectedMode,
        })
        continue
      }

      if (item.type === 'file') {
        const extracted = await extractFileToSource({
          name: item.name,
          mimeType: item.mimeType,
          contentBase64: item.contentBase64,
        })
        const created = await createVideo({
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
          dbVideoId: created.id,
          sourceType: 'file',
          rawTitle: extracted.title || item.name || `File ${i + 1}`,
          rawText: extracted.transcript,
          sourceMime: extracted.sourceMime || item.mimeType || 'application/octet-stream',
          generationProfile: modeToGenerationProfile(selectedMode),
          interpretationMode: selectedMode,
        })
        continue
      }

      errors.push({ index: i, reason: `Unsupported item type: ${(item as any)?.type || 'unknown'}` })
    } catch (e: any) {
      errors.push({ index: i, reason: e?.message || 'Import item failed' })
    }
  }

  if (!createdItems.length) {
    res.status(422).json({ error: 'No importable items found.', errors })
    return
  }

  res.status(202).json({
    batchId: batch.id,
    total: createdItems.length,
    interpretationMode: selectedMode,
    errors,
    items: createdItems,
  })
}
