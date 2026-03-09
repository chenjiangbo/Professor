import fs from 'fs/promises'
import sharp from 'sharp'
import { getNotebook, updateNotebookCoverForUser } from '~/lib/repo'
import { resolveNotebookCoverFilePath, saveNotebookCoverImage } from './storage'

export type NotebookCoverUploadInput = {
  mimeType?: string
  bytes?: Uint8Array
}

const MAX_COVER_BYTES = 8 * 1024 * 1024
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

function normalizeMimeType(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
}

export async function saveUploadedNotebookCover(userId: string, notebookId: string, upload: NotebookCoverUploadInput) {
  const notebook = await getNotebook(userId, notebookId)
  if (!notebook) {
    throw new Error('Notebook not found')
  }

  const mimeType = normalizeMimeType(upload.mimeType)
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error('Unsupported cover image type. Only PNG, JPEG, and WebP are allowed.')
  }

  const bytes = upload.bytes
  if (!bytes || !bytes.length) {
    throw new Error('Missing required cover image payload.')
  }
  if (bytes.length > MAX_COVER_BYTES) {
    throw new Error('Cover image is too large. Current limit is 8MB.')
  }

  const processed = await sharp(bytes)
    .rotate()
    .resize(1600, 900, {
      fit: 'cover',
      position: 'centre',
    })
    .webp({ quality: 82 })
    .toBuffer()

  const saved = await saveNotebookCoverImage(notebookId, Uint8Array.from(processed), 'image/webp')
  const previousStoredPath = String(notebook.cover_url || '').trim()

  const updated = await updateNotebookCoverForUser(userId, notebookId, {
    coverUrl: saved.storedPath,
    coverStatus: 'ready',
    touchCoverUpdatedAt: true,
  })

  if (!updated) {
    throw new Error('Failed to save notebook cover.')
  }

  if (previousStoredPath && previousStoredPath !== saved.storedPath) {
    try {
      await fs.unlink(resolveNotebookCoverFilePath(previousStoredPath))
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        throw error
      }
    }
  }

  return updated
}
