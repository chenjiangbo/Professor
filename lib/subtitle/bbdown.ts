import { spawn } from 'child_process'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { getDecryptedBBDownCookie } from '~/lib/bbdown/auth'

export type BBDownSubtitle = {
  text: string
  language: 'zh' | 'en' | 'unknown'
  isAi: boolean
  filePath: string
}

const CHI_HINTS = ['zh', 'chi', 'cn', 'hans', '中文', '简体']
const EN_HINTS = ['en', 'eng', 'english']
const AI_HINTS = ['ai', 'auto']

function detectLang(fileName: string): 'zh' | 'en' | 'unknown' {
  const n = fileName.toLowerCase()
  if (CHI_HINTS.some((h) => n.includes(h))) return 'zh'
  if (EN_HINTS.some((h) => n.includes(h))) return 'en'
  return 'unknown'
}

function detectAi(fileName: string): boolean {
  const n = fileName.toLowerCase()
  return AI_HINTS.some((h) => n.includes(h))
}

function normalizeSubtitleText(raw: string): string {
  return raw
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+|\s+$/g, '')
}

function parseSrtToPlainText(srt: string): string {
  const lines = srt.split('\n')
  const textLines = lines.filter((line) => {
    const t = line.trim()
    if (!t) return false
    if (/^\d+$/.test(t)) return false
    if (/^\d{2}:\d{2}:\d{2}[,\.]\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}[,\.]\d{3}$/.test(t)) return false
    return true
  })
  return normalizeSubtitleText(textLines.join('\n'))
}

function scoreSubtitleCandidate(fileName: string): number {
  const lang = detectLang(fileName)
  const isAi = detectAi(fileName)
  if (lang === 'zh' && !isAi) return 100
  if (lang === 'zh' && isAi) return 80
  if (lang === 'en' && !isAi) return 60
  if (lang === 'en' && isAi) return 40
  return 10
}

async function listSubtitleFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listSubtitleFiles(full)))
    } else {
      const ext = path.extname(entry.name).toLowerCase()
      if (ext === '.srt' || ext === '.ass' || ext === '.vtt') {
        files.push(full)
      }
    }
  }
  return files
}

async function runBBDown(url: string, pageNumber?: string): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bbdown-sub-'))
  const bbdownBin = process.env.BBDOWN_BIN || 'BBDown'

  const args = ['--sub-only', '--skip-ai', 'false']
  try {
    const cookie = await getDecryptedBBDownCookie()
    if (cookie) {
      args.push('-c', cookie)
    }
  } catch (e: any) {
    console.error('Failed to load persisted BBDown cookie, fallback to anonymous', e?.message || e)
  }
  if (pageNumber) {
    args.push('-p', pageNumber)
  }
  args.push(url)

  await new Promise<void>((resolve, reject) => {
    const child = spawn(bbdownBin, args, {
      cwd: tempDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stderr = ''
    child.stderr.on('data', (buf) => {
      stderr += String(buf)
    })

    child.on('error', (err) => {
      reject(err)
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`BBDown exited with code ${code}: ${stderr.slice(-1000)}`))
      }
    })
  })

  return tempDir
}

export async function fetchSubtitleByBBDown(url: string, pageNumber?: string): Promise<BBDownSubtitle | null> {
  const tempDir = await runBBDown(url, pageNumber)
  const subtitleFiles = await listSubtitleFiles(tempDir)
  if (!subtitleFiles.length) return null

  const scored = subtitleFiles
    .map((f) => ({ filePath: f, fileName: path.basename(f), score: scoreSubtitleCandidate(path.basename(f)) }))
    .sort((a, b) => b.score - a.score)

  const best = scored[0]
  const raw = await fs.readFile(best.filePath, 'utf8')
  const ext = path.extname(best.filePath).toLowerCase()
  const text = ext === '.srt' ? parseSrtToPlainText(raw) : normalizeSubtitleText(raw)

  return {
    text,
    language: detectLang(best.fileName),
    isAi: detectAi(best.fileName),
    filePath: best.filePath,
  }
}
