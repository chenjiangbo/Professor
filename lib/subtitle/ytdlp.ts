import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { runYtDlp, runYtDlpJson } from '~/lib/youtube/ytdlp'
import { buildYouTubeAuthArgs } from '~/lib/youtube/auth'
import { buildDouyinAuthArgs } from '~/lib/douyin/auth'
import { isDouyinUrl } from '~/lib/douyin/preview'

export type YtDlpSubtitle = {
  text: string
  language: 'zh' | 'en' | 'unknown'
  isAi: boolean
  filePath: string
}

type SubtitleCandidate = {
  lang: string
  langNorm: 'zh' | 'en' | 'unknown'
  isAi: boolean
  formats: string[]
}

function normalizeSubtitleText(raw: string): string {
  return String(raw || '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
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
  return normalizeSubtitleText(textLines.join('\n'))
}

function parseVttToPlainText(vtt: string): string {
  const lines = String(vtt || '')
    .replace(/\r/g, '')
    .split('\n')
  const textLines: string[] = []
  for (const line of lines) {
    const t = line.trim()
    if (!t) continue
    if (t === 'WEBVTT') continue
    if (/^\d+$/.test(t)) continue
    if (/^\d{2}:\d{2}:\d{2}\.\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}\.\d{3}/.test(t)) continue
    if (/^\d{2}:\d{2}\.\d{3}\s+-->\s+\d{2}:\d{2}\.\d{3}/.test(t)) continue
    if (/^(NOTE|STYLE|REGION)\b/.test(t)) continue
    textLines.push(t.replace(/<[^>]+>/g, ''))
  }
  return normalizeSubtitleText(textLines.join('\n'))
}

function parseAssToPlainText(ass: string): string {
  const lines = String(ass || '')
    .replace(/\r/g, '')
    .split('\n')
  const textLines: string[] = []
  for (const line of lines) {
    if (!line.startsWith('Dialogue:')) continue
    const parts = line.split(',')
    if (parts.length < 10) continue
    const text = parts
      .slice(9)
      .join(',')
      .replace(/\{[^}]+\}/g, '')
    if (text.trim()) textLines.push(text.trim())
  }
  return normalizeSubtitleText(textLines.join('\n'))
}

function detectLangFromCode(code: string): 'zh' | 'en' | 'unknown' {
  const l = String(code || '').toLowerCase()
  if (l === 'zh' || l.startsWith('zh-')) return 'zh'
  if (l === 'en' || l.startsWith('en-')) return 'en'
  return 'unknown'
}

function extRank(ext: string) {
  const e = String(ext || '').toLowerCase()
  if (e === 'vtt') return 3
  if (e === 'srt') return 2
  if (e === 'ass') return 1
  return 0
}

function candidatePriority(c: SubtitleCandidate): number {
  if (c.langNorm === 'zh' && !c.isAi) return 400
  if (c.langNorm === 'zh' && c.isAi) return 300
  if (c.langNorm === 'en' && !c.isAi) return 200
  if (c.langNorm === 'en' && c.isAi) return 100
  return 0
}

function collectCandidates(meta: any): SubtitleCandidate[] {
  const human = meta?.subtitles && typeof meta.subtitles === 'object' ? meta.subtitles : {}
  const auto = meta?.automatic_captions && typeof meta.automatic_captions === 'object' ? meta.automatic_captions : {}
  const out: SubtitleCandidate[] = []

  for (const [lang, tracks] of Object.entries(human)) {
    const formats = Array.isArray(tracks)
      ? tracks.map((t: any) => String(t?.ext || '').toLowerCase()).filter(Boolean)
      : []
    out.push({
      lang,
      langNorm: detectLangFromCode(lang),
      isAi: false,
      formats,
    })
  }

  for (const [lang, tracks] of Object.entries(auto)) {
    const formats = Array.isArray(tracks)
      ? tracks.map((t: any) => String(t?.ext || '').toLowerCase()).filter(Boolean)
      : []
    out.push({
      lang,
      langNorm: detectLangFromCode(lang),
      isAi: true,
      formats,
    })
  }

  return out
}

function pickBestCandidate(candidates: SubtitleCandidate[]): SubtitleCandidate | null {
  const supported = candidates.filter((c) => c.formats.some((f) => extRank(f) > 0))
  if (!supported.length) return null
  return supported
    .sort((a, b) => {
      const p = candidatePriority(b) - candidatePriority(a)
      if (p !== 0) return p
      const e = Math.max(...b.formats.map(extRank)) - Math.max(...a.formats.map(extRank))
      if (e !== 0) return e
      return a.lang.localeCompare(b.lang)
    })
    .at(0) as SubtitleCandidate
}

function sortCandidatesByPriority(candidates: SubtitleCandidate[]): SubtitleCandidate[] {
  return [...candidates]
    .filter((c) => c.formats.some((f) => extRank(f) > 0))
    .sort((a, b) => {
      const p = candidatePriority(b) - candidatePriority(a)
      if (p !== 0) return p
      const e = Math.max(...b.formats.map(extRank)) - Math.max(...a.formats.map(extRank))
      if (e !== 0) return e
      return a.lang.localeCompare(b.lang)
    })
}

function langCodeScore(code: string, langNorm: 'zh' | 'en' | 'unknown') {
  const c = String(code || '').toLowerCase()
  if (langNorm === 'zh') {
    if (c === 'zh-hans') return 100
    if (c === 'zh-cn') return 90
    if (c === 'zh') return 80
    if (c === 'zh-hant') return 70
    if (c === 'zh-tw') return 60
    if (c.startsWith('zh-')) return 50
    return 0
  }
  if (langNorm === 'en') {
    if (c === 'en') return 100
    if (c.startsWith('en-')) return 80
    return 0
  }
  return 0
}

function buildAttemptPlan(
  sortedCandidates: SubtitleCandidate[],
  preferredLanguage: 'zh-CN' | 'en-US',
): SubtitleCandidate[] {
  const preferredLangNorm: 'zh' | 'en' = preferredLanguage === 'zh-CN' ? 'zh' : 'en'
  const secondaryLangNorm: 'zh' | 'en' = preferredLangNorm === 'zh' ? 'en' : 'zh'
  const buckets: Array<{ langNorm: 'zh' | 'en'; isAi: boolean }> = [
    { langNorm: preferredLangNorm, isAi: false },
    { langNorm: preferredLangNorm, isAi: true },
    { langNorm: secondaryLangNorm, isAi: false },
    { langNorm: secondaryLangNorm, isAi: true },
  ]
  const picked: SubtitleCandidate[] = []

  for (const bucket of buckets) {
    const candidate = sortedCandidates
      .filter((c) => c.langNorm === bucket.langNorm && c.isAi === bucket.isAi)
      .sort((a, b) => langCodeScore(b.lang, b.langNorm) - langCodeScore(a.lang, a.langNorm))[0]
    if (candidate) picked.push(candidate)
  }

  return picked
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

function parseSubtitleFile(ext: string, raw: string): string {
  if (ext === '.srt') return parseSrtToPlainText(raw)
  if (ext === '.vtt') return parseVttToPlainText(raw)
  if (ext === '.ass') return parseAssToPlainText(raw)
  return normalizeSubtitleText(raw)
}

function pickDownloadedSubtitleFile(files: string[], candidate: SubtitleCandidate): string | null {
  if (!files.length) return null
  const lang = candidate.lang.toLowerCase()
  const scored = files
    .map((filePath) => {
      const base = path.basename(filePath).toLowerCase()
      const ext = path.extname(filePath).toLowerCase()
      let score = 0
      if (base.includes(lang)) score += 50
      if (candidate.isAi && /(auto|asr|ai)/.test(base)) score += 20
      if (!candidate.isAi && !/(auto|asr|ai)/.test(base)) score += 10
      score += extRank(ext)
      return { filePath, score }
    })
    .sort((a, b) => b.score - a.score)
  return scored[0]?.filePath || null
}

export async function fetchSubtitleByYtDlp(
  userId: string,
  url: string,
  preferredLanguage: 'zh-CN' | 'en-US' = 'en-US',
): Promise<YtDlpSubtitle | null> {
  const metaDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ytdlp-meta-'))
  const metaAuthArgs = await resolveYtDlpAuthArgs(userId, url, metaDir)
  const meta = await runYtDlpJson([...metaAuthArgs, '--no-playlist', url], metaDir)
  const title = String(meta?.title || '').trim()
  const videoId = String(meta?.id || '').trim()
  const candidates = collectCandidates(meta)
  const picked = pickBestCandidate(candidates)
  const sortedCandidates = sortCandidatesByPriority(candidates)
  const attemptPlan = buildAttemptPlan(sortedCandidates, preferredLanguage)

  console.info(
    `[ytdlp-subtitle-meta] ${JSON.stringify({
      title,
      videoId,
      candidateCount: candidates.length,
      attemptPlan: attemptPlan.map((c) => ({
        lang: c.lang,
        langNorm: c.langNorm,
        isAi: c.isAi,
      })),
      candidatesTop: sortedCandidates.slice(0, 12).map((c) => ({
        lang: c.lang,
        langNorm: c.langNorm,
        isAi: c.isAi,
        formats: c.formats,
      })),
      selected: picked
        ? {
            lang: picked.lang,
            langNorm: picked.langNorm,
            isAi: picked.isAi,
            formats: picked.formats,
          }
        : null,
    })}`,
  )

  if (!picked || !attemptPlan.length) return null

  const attemptErrors: string[] = []
  for (const candidate of attemptPlan) {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ytdlp-sub-'))
    const outputTemplate = path.join(tempDir, 'subtitle.%(ext)s')
    const args = [
      '--no-playlist',
      '--skip-download',
      '--sub-format',
      'vtt/srt/ass',
      '--sub-langs',
      candidate.lang,
      '-o',
      outputTemplate,
    ]
    const authArgs = await resolveYtDlpAuthArgs(userId, url, tempDir)
    if (authArgs.length) args.unshift(...authArgs)
    if (candidate.isAi) {
      args.push('--write-auto-subs', '--no-write-subs')
    } else {
      args.push('--write-subs', '--no-write-auto-subs')
    }
    args.push(url)

    try {
      await runYtDlp({ args, cwd: tempDir })
      const subtitleFiles = await listSubtitleFiles(tempDir)
      if (!subtitleFiles.length) {
        attemptErrors.push(`${candidate.lang}(${candidate.isAi ? 'auto' : 'human'}): subtitle file was not downloaded`)
        continue
      }

      const selectedPath = pickDownloadedSubtitleFile(subtitleFiles, candidate)
      if (!selectedPath) {
        attemptErrors.push(
          `${candidate.lang}(${candidate.isAi ? 'auto' : 'human'}): target subtitle file was not matched`,
        )
        continue
      }
      const raw = await fs.readFile(selectedPath, 'utf8')
      const ext = path.extname(selectedPath).toLowerCase()
      const text = parseSubtitleFile(ext, raw)
      if (!text) {
        attemptErrors.push(`${candidate.lang}(${candidate.isAi ? 'auto' : 'human'}): subtitle content is empty`)
        continue
      }

      console.info(
        `[ytdlp-subtitle-selected] ${JSON.stringify({
          title,
          videoId,
          lang: candidate.lang,
          langNorm: candidate.langNorm,
          isAi: candidate.isAi,
          filePath: selectedPath,
        })}`,
      )

      return {
        text,
        language: candidate.langNorm,
        isAi: candidate.isAi,
        filePath: selectedPath,
      }
    } catch (e: any) {
      attemptErrors.push(`${candidate.lang}(${candidate.isAi ? 'auto' : 'human'}): ${e?.message || 'download failed'}`)
    }
  }

  throw new Error(`yt-dlp subtitle download failed: ${attemptErrors.slice(0, 5).join(' | ')}`)
}

async function resolveYtDlpAuthArgs(userId: string, url: string, tempDir: string): Promise<string[]> {
  if (isDouyinUrl(url)) {
    return buildDouyinAuthArgs(userId, tempDir)
  }
  return buildYouTubeAuthArgs(userId, tempDir)
}
