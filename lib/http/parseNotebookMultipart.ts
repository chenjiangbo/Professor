import fs from 'fs/promises'
import type { NextApiRequest } from 'next'
import formidable from 'formidable'

export type ParsedNotebookMultipart = {
  fields: Record<string, string>
  coverFile: {
    bytes: Uint8Array
    mimeType: string
    originalFilename: string
  } | null
}

export async function parseNotebookMultipart(req: NextApiRequest): Promise<ParsedNotebookMultipart> {
  const form = formidable({
    multiples: false,
    maxFileSize: 20 * 1024 * 1024,
    allowEmptyFiles: false,
  })

  const { fields, files } = await new Promise<{ fields: formidable.Fields; files: formidable.Files }>(
    (resolve, reject) => {
      form.parse(req, (err, parsedFields, parsedFiles) => {
        if (err) {
          reject(err)
          return
        }
        resolve({ fields: parsedFields, files: parsedFiles })
      })
    },
  )

  const normalizedFields: Record<string, string> = {}
  for (const [key, value] of Object.entries(fields)) {
    normalizedFields[key] = Array.isArray(value) ? String(value[0] || '') : String(value || '')
  }

  const rawCoverFile = files.cover
  const coverFile = Array.isArray(rawCoverFile) ? rawCoverFile[0] : rawCoverFile

  if (!coverFile) {
    return {
      fields: normalizedFields,
      coverFile: null,
    }
  }

  const bytes = await fs.readFile(coverFile.filepath)
  return {
    fields: normalizedFields,
    coverFile: {
      bytes: Uint8Array.from(bytes),
      mimeType: String(coverFile.mimetype || '')
        .trim()
        .toLowerCase(),
      originalFilename: String(coverFile.originalFilename || '').trim(),
    },
  }
}
