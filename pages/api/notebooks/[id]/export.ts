import type { NextApiRequest, NextApiResponse } from 'next'
import JSZip from 'jszip'
import { getNotebook, listVideos } from '~/lib/repo'
import { normalizeAppLanguage } from '~/lib/i18n'
import { isAdminUserId, requireUserId } from '~/lib/requestAuth'
import { getActiveSubscriptionTierByUserId } from '~/lib/billing/repo'
import { canExportNotebookZip } from '~/lib/billing/entitlements'

function sanitizeFileName(input: string, fallback: string) {
  const raw = String(input || '').trim()
  const base = raw || fallback
  return base
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90)
}

function asChapterList(chapters: unknown): Array<{ title?: string; summary?: string; time?: string }> {
  if (!Array.isArray(chapters)) return []
  return chapters as Array<{ title?: string; summary?: string; time?: string }>
}

function toText(v: unknown) {
  return String(v || '').trim()
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = requireUserId(req, res)
  if (!userId) return

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    res.status(405).end()
    return
  }

  const { id } = req.query
  if (!id || typeof id !== 'string') {
    res.status(400).json({ error: 'Missing required parameter: id' })
    return
  }

  const notebook = await getNotebook(userId, id)
  if (!notebook) {
    res.status(404).json({ error: 'Notebook not found' })
    return
  }

  const { tier } = await getActiveSubscriptionTierByUserId(userId)
  const effectiveTier = isAdminUserId(userId) ? 'premium' : tier
  if (!canExportNotebookZip(effectiveTier)) {
    res.status(403).json({ error: 'Notebook export is not available for free tier.' })
    return
  }

  const language = typeof req.query.lang === 'string' ? normalizeAppLanguage(req.query.lang) : undefined
  const includeInterpretation = String(req.query.includeInterpretation || '').toLowerCase() !== '0'
  const includeSubtitle = String(req.query.includeSubtitle || '').toLowerCase() === '1'
  if (!includeInterpretation && !includeSubtitle) {
    res.status(400).json({ error: 'At least one export content type must be selected.' })
    return
  }
  const videos = await listVideos(userId, id, language)
  if (!videos.length) {
    res.status(422).json({ error: 'No videos available in notebook' })
    return
  }

  const zip = new JSZip()
  videos.forEach((video: any, idx: number) => {
    const serial = String(idx + 1).padStart(2, '0')
    const safeTitle = sanitizeFileName(video?.title, `video-${serial}`)

    const summary = toText(video?.summary)
    const transcript = toText(video?.transcript)
    const chapters = asChapterList(video?.chapters)
    const chapterText = chapters
      .map((c, chapterIdx) => {
        const title = toText(c?.title) || `Chapter ${chapterIdx + 1}`
        const time = toText(c?.time)
        const body = toText(c?.summary)
        return [`## ${chapterIdx + 1}. ${title}${time ? ` (${time})` : ''}`, body].filter(Boolean).join('\n\n')
      })
      .join('\n\n')

    if (includeInterpretation) {
      const interpretation = [
        `# ${toText(video?.title) || safeTitle}`,
        `Status: ${toText(video?.status) || 'unknown'}`,
        summary ? `\n## Summary\n\n${summary}` : '',
        chapterText ? `\n## Chapters\n\n${chapterText}` : '',
      ]
        .filter(Boolean)
        .join('\n')
      zip.file(`${serial}-${safeTitle}-interpretation.md`, interpretation)
    }

    if (includeSubtitle && transcript) {
      zip.file(`${serial}-${safeTitle}-subtitle.txt`, transcript)
    }
  })

  const notebookName = sanitizeFileName(notebook.title, 'notebook')
  const payload = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })

  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename=\"${notebookName}.zip\"`)
  res.status(200).send(payload)
}
