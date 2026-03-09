import fs from 'fs/promises'
import path from 'path'
import { resolveNotebookCoverStorageDir } from './env'

export async function ensureNotebookCoverStorageDir() {
  await fs.mkdir(resolveNotebookCoverStorageDir(), { recursive: true })
}

export async function saveNotebookCoverImage(notebookId: string, bytes: Uint8Array, mediaType: string) {
  const ext =
    mediaType === 'image/png' ? 'png' : mediaType === 'image/webp' ? 'webp' : mediaType === 'image/jpeg' ? 'jpg' : null
  if (!ext) {
    throw new Error(`Unsupported cover image media type: ${mediaType}`)
  }

  const dir = resolveNotebookCoverStorageDir()
  await ensureNotebookCoverStorageDir()

  const filename = `${notebookId}-${Date.now()}.${ext}`
  const filePath = path.join(dir, filename)
  await fs.writeFile(filePath, bytes)
  return {
    absolutePath: filePath,
    storedPath: filename,
    mediaType,
  }
}

export function resolveNotebookCoverFilePath(storedPath: string): string {
  return path.join(resolveNotebookCoverStorageDir(), storedPath)
}
