import path from 'path'
import mammoth from 'mammoth'

export type ImportFilePayload = {
  name: string
  mimeType?: string
  contentBase64: string
}

export type ExtractedSource = {
  title: string
  transcript: string
  sourceMime?: string
}

function parseSrtToPlainText(srt: string): string {
  const lines = String(srt || '').split('\n')
  const textLines = lines.filter((line) => {
    const t = line.trim()
    if (!t) return false
    if (/^\d+$/.test(t)) return false
    if (/^\d{2}:\d{2}:\d{2}[,\.]\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}[,\.]\d{3}$/.test(t)) return false
    return true
  })
  return textLines.join('\n').trim()
}

function stripSubtitleArtifacts(text: string): string {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/^\s*WEBVTT.*$/gim, '')
    .replace(/^\s*NOTE.*$/gim, '')
    .replace(/^\s*\d+\s*$/gim, '')
    .replace(/^\s*\d{1,2}:\d{2}:\d{2}(?:[.,]\d{3})?\s*-->\s*\d{1,2}:\d{2}:\d{2}(?:[.,]\d{3})?.*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function guessMime(name: string, mimeType?: string): string {
  if (mimeType && mimeType !== 'application/octet-stream') return mimeType
  const ext = path.extname(name || '').toLowerCase()
  if (ext === '.pdf') return 'application/pdf'
  if (ext === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  if (ext === '.md') return 'text/markdown'
  if (ext === '.txt') return 'text/plain'
  if (ext === '.srt') return 'application/x-subrip'
  if (ext === '.vtt') return 'text/vtt'
  if (ext === '.ass') return 'text/x-ass'
  return 'application/octet-stream'
}

export async function extractFileToSource(payload: ImportFilePayload): Promise<ExtractedSource> {
  const name = String(payload?.name || 'Untitled file').trim()
  const mime = guessMime(name, payload?.mimeType)
  const buf = Buffer.from(String(payload?.contentBase64 || ''), 'base64')
  if (!buf.length) {
    throw new Error(`Empty file content: ${name}`)
  }

  const ext = path.extname(name).toLowerCase()
  let transcript = ''

  if (mime === 'application/pdf' || ext === '.pdf') {
    try {
      const pdfParseModule: any = await import('pdf-parse')
      if (typeof pdfParseModule?.PDFParse === 'function') {
        const parser = new pdfParseModule.PDFParse({ data: buf })
        const parsed = await parser.getText()
        transcript = String(parsed?.text || '').trim()
        if (typeof parser?.destroy === 'function') {
          await parser.destroy()
        }
      } else {
        const legacy = pdfParseModule?.default || pdfParseModule
        if (typeof legacy !== 'function') {
          throw new Error('unsupported pdf-parse module shape')
        }
        const parsed = await legacy(buf)
        transcript = String(parsed?.text || '').trim()
      }
    } catch (e: any) {
      throw new Error(`PDF parse failed for ${name}: ${e?.message || 'unknown parser error'}`)
    }
  } else if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || ext === '.docx') {
    const parsed = await mammoth.extractRawText({ buffer: buf })
    transcript = String(parsed?.value || '').trim()
  } else if (ext === '.srt') {
    transcript = parseSrtToPlainText(buf.toString('utf8'))
  } else if (ext === '.vtt' || ext === '.ass') {
    transcript = stripSubtitleArtifacts(buf.toString('utf8'))
  } else if (ext === '.md' || ext === '.txt' || mime.startsWith('text/')) {
    transcript = buf.toString('utf8').replace(/\r/g, '').trim()
  } else {
    throw new Error(`Unsupported file type: ${name}`)
  }

  if (!transcript) {
    if (mime === 'application/pdf' || ext === '.pdf') {
      throw new Error(
        `No readable text extracted from ${name}. This PDF may be scanned/image-only, encrypted, or malformed.`,
      )
    }
    throw new Error(`No readable text extracted from ${name}`)
  }

  return {
    title: name.replace(/\.[^.]+$/, ''),
    transcript,
    sourceMime: mime,
  }
}
