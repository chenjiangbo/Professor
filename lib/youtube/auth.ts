import fs from 'fs/promises'
import path from 'path'
import { decryptText, encryptText } from '~/lib/security/crypto'
import { deleteAppSetting, getAppSetting, setAppSetting } from '~/lib/repo'

export type YouTubeAuthMode = 'cookie' | 'cookies_txt'
export type YouTubeAuthStatus = 'unknown' | 'valid' | 'invalid'

const YOUTUBE_AUTH_KEY = 'youtube_auth'

type YouTubeAuthRecord = {
  mode: YouTubeAuthMode
  encryptedValue: string
  status: YouTubeAuthStatus
  updatedAt: string
  lastValidatedAt?: string
  lastError?: string
}

function normalizeCookieHeaderText(rawValue: string): string {
  return String(rawValue || '')
    .trim()
    .replace(/^cookie:\s*/i, '')
    .replace(/\r/g, '')
}

function normalizeCookieString(rawValue: string): string {
  const normalized = normalizeCookieHeaderText(rawValue)
  if (!normalized) throw new Error('Credential cannot be empty')

  const pairs = normalized
    .split(/[;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => {
      const idx = p.indexOf('=')
      if (idx < 1) return null
      const key = p.slice(0, idx).trim()
      const value = p.slice(idx + 1).trim()
      if (!key || !value) return null
      return `${key}=${value}`
    })
    .filter(Boolean) as string[]

  if (!pairs.length) throw new Error('Invalid Cookie format')
  return pairs.join('; ')
}

function normalizeCookiesTxt(rawValue: string): string {
  const text = String(rawValue || '')
    .replace(/\r/g, '')
    .trim()
  if (!text) throw new Error('cookies.txt content cannot be empty')
  if (!/\byoutube\.com\b/i.test(text)) {
    throw new Error('youtube.com domain was not detected in cookies.txt')
  }
  return text.endsWith('\n') ? text : `${text}\n`
}

function parseRecord(raw: string | null): YouTubeAuthRecord | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed?.mode || !parsed?.encryptedValue) return null
    return parsed as YouTubeAuthRecord
  } catch {
    return null
  }
}

function normalizeByMode(mode: YouTubeAuthMode, value: string): string {
  if (mode === 'cookie') return normalizeCookieString(value)
  return normalizeCookiesTxt(value)
}

export async function getYouTubeAuthRecord(userId: string): Promise<YouTubeAuthRecord | null> {
  const raw = await getAppSetting(userId, YOUTUBE_AUTH_KEY)
  return parseRecord(raw)
}

export async function setYouTubeAuth(userId: string, input: { mode: YouTubeAuthMode; value: string }) {
  const normalized = normalizeByMode(input.mode, input.value)
  const now = new Date().toISOString()
  const record: YouTubeAuthRecord = {
    mode: input.mode,
    encryptedValue: encryptText(normalized),
    status: 'unknown',
    updatedAt: now,
    lastValidatedAt: undefined,
    lastError: undefined,
  }
  await setAppSetting(userId, YOUTUBE_AUTH_KEY, JSON.stringify(record))
  return record
}

export async function clearYouTubeAuth(userId: string) {
  await deleteAppSetting(userId, YOUTUBE_AUTH_KEY)
}

export async function getDecryptedYouTubeAuth(
  userId: string,
): Promise<{ mode: YouTubeAuthMode; value: string } | null> {
  const record = await getYouTubeAuthRecord(userId)
  if (!record) return null
  return {
    mode: record.mode,
    value: decryptText(record.encryptedValue),
  }
}

export async function updateYouTubeAuthValidation(userId: string, status: YouTubeAuthStatus, lastError?: string) {
  const record = await getYouTubeAuthRecord(userId)
  if (!record) return null
  const updated: YouTubeAuthRecord = {
    ...record,
    status,
    lastValidatedAt: new Date().toISOString(),
    lastError: lastError || undefined,
  }
  await setAppSetting(userId, YOUTUBE_AUTH_KEY, JSON.stringify(updated))
  return updated
}

function hasImportantYouTubeCookie(cookie: string): boolean {
  const lower = cookie.toLowerCase()
  return (
    lower.includes('sapisi') || lower.includes('__secure-3psid=') || lower.includes('sid=') || lower.includes('hsid=')
  )
}

export function validateYouTubeAuthLocal(input: { mode: YouTubeAuthMode; value: string }): {
  valid: boolean
  message: string
} {
  try {
    const normalized = normalizeByMode(input.mode, input.value)
    if (input.mode === 'cookie') {
      if (!hasImportantYouTubeCookie(normalized)) {
        return {
          valid: false,
          message: 'Cookie is missing critical fields (a full browser-exported cookie is recommended).',
        }
      }
      return { valid: true, message: 'Cookie format check passed.' }
    }

    if (!/\tyoutube\.com\t|\t\.youtube\.com\t/i.test(normalized)) {
      return {
        valid: false,
        message: 'cookies.txt is missing youtube.com domain records.',
      }
    }
    return { valid: true, message: 'cookies.txt format check passed.' }
  } catch (e: any) {
    return { valid: false, message: e?.message || 'Credential format validation failed' }
  }
}

export function maskCredential(input: string | null | undefined): string {
  const text = String(input || '')
  if (!text) return ''
  if (text.length <= 8) return '****'
  return `${text.slice(0, 4)}****${text.slice(-4)}`
}

export async function buildYouTubeAuthArgs(userId: string, tempDir: string): Promise<string[]> {
  const auth = await getDecryptedYouTubeAuth(userId)
  if (!auth) return []

  if (auth.mode === 'cookies_txt') {
    const cookiesPath = path.join(tempDir, 'youtube-cookies.txt')
    await fs.writeFile(cookiesPath, auth.value, 'utf8')
    return ['--cookies', cookiesPath]
  }

  const cookiesPath = path.join(tempDir, 'youtube-cookies.txt')
  await fs.writeFile(cookiesPath, cookieHeaderToNetscape(auth.value), 'utf8')
  return ['--cookies', cookiesPath]
}

function cookieHeaderToNetscape(cookieHeader: string): string {
  const pairs = String(cookieHeader || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const idx = part.indexOf('=')
      if (idx < 1) return null
      return {
        name: part.slice(0, idx).trim(),
        value: part.slice(idx + 1).trim(),
      }
    })
    .filter(Boolean) as Array<{ name: string; value: string }>

  const domains = ['.youtube.com', '.google.com']
  const lines = ['# Netscape HTTP Cookie File']
  for (const pair of pairs) {
    if (!pair.name || !pair.value) continue
    const secure = pair.name.startsWith('__Secure-') || pair.name.startsWith('__Host-') ? 'TRUE' : 'FALSE'
    for (const domain of domains) {
      lines.push(`${domain}\tTRUE\t/\t${secure}\t0\t${pair.name}\t${pair.value}`)
    }
  }
  return `${lines.join('\n')}\n`
}
