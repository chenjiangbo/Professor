import fs from 'fs/promises'
import path from 'path'
import { decryptText, encryptText } from '~/lib/security/crypto'
import { deleteAppSetting, getAppSetting, setAppSetting } from '~/lib/repo'

export type DouyinAuthMode = 'cookie' | 'cookies_txt'
export type DouyinAuthStatus = 'unknown' | 'valid' | 'invalid'

const DOUYIN_AUTH_KEY = 'douyin_auth'

type DouyinAuthRecord = {
  mode: DouyinAuthMode
  encryptedValue: string
  status: DouyinAuthStatus
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
  if (!/\b(douyin\.com|iesdouyin\.com)\b/i.test(text)) {
    throw new Error('douyin.com or iesdouyin.com domain was not detected in cookies.txt')
  }
  return text.endsWith('\n') ? text : `${text}\n`
}

function hasDouyinCookieDomainRecords(cookiesTxt: string): boolean {
  const lines = String(cookiesTxt || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))

  return lines.some((line) => {
    const firstCol = line.split(/\s+/)[0]?.toLowerCase() || ''
    return (
      firstCol === 'douyin.com' ||
      firstCol === '.douyin.com' ||
      firstCol === 'www.douyin.com' ||
      firstCol === 'iesdouyin.com' ||
      firstCol === '.iesdouyin.com' ||
      firstCol === 'www.iesdouyin.com'
    )
  })
}

function parseRecord(raw: string | null): DouyinAuthRecord | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed?.mode || !parsed?.encryptedValue) return null
    return parsed as DouyinAuthRecord
  } catch {
    return null
  }
}

function normalizeByMode(mode: DouyinAuthMode, value: string): string {
  if (mode === 'cookie') return normalizeCookieString(value)
  return normalizeCookiesTxt(value)
}

export async function getDouyinAuthRecord(userId: string): Promise<DouyinAuthRecord | null> {
  const raw = await getAppSetting(userId, DOUYIN_AUTH_KEY)
  return parseRecord(raw)
}

export async function setDouyinAuth(userId: string, input: { mode: DouyinAuthMode; value: string }) {
  const normalized = normalizeByMode(input.mode, input.value)
  const now = new Date().toISOString()
  const record: DouyinAuthRecord = {
    mode: input.mode,
    encryptedValue: encryptText(normalized),
    status: 'unknown',
    updatedAt: now,
    lastValidatedAt: undefined,
    lastError: undefined,
  }
  await setAppSetting(userId, DOUYIN_AUTH_KEY, JSON.stringify(record))
  return record
}

export async function clearDouyinAuth(userId: string) {
  await deleteAppSetting(userId, DOUYIN_AUTH_KEY)
}

export async function getDecryptedDouyinAuth(userId: string): Promise<{ mode: DouyinAuthMode; value: string } | null> {
  const record = await getDouyinAuthRecord(userId)
  if (!record) return null
  return {
    mode: record.mode,
    value: decryptText(record.encryptedValue),
  }
}

export async function updateDouyinAuthValidation(userId: string, status: DouyinAuthStatus, lastError?: string) {
  const record = await getDouyinAuthRecord(userId)
  if (!record) return null
  const updated: DouyinAuthRecord = {
    ...record,
    status,
    lastValidatedAt: new Date().toISOString(),
    lastError: lastError || undefined,
  }
  await setAppSetting(userId, DOUYIN_AUTH_KEY, JSON.stringify(updated))
  return updated
}

function hasImportantDouyinCookie(cookie: string): boolean {
  const lower = cookie.toLowerCase()
  return lower.includes('sessionid=') || lower.includes('ttwid=')
}

export function validateDouyinAuthLocal(input: { mode: DouyinAuthMode; value: string }): {
  valid: boolean
  message: string
} {
  try {
    const normalized = normalizeByMode(input.mode, input.value)
    if (input.mode === 'cookie') {
      if (!hasImportantDouyinCookie(normalized)) {
        return {
          valid: false,
          message: 'Cookie is missing critical fields (sessionid or ttwid is recommended).',
        }
      }
      return { valid: true, message: 'Cookie format check passed.' }
    }

    if (!hasDouyinCookieDomainRecords(normalized)) {
      return {
        valid: false,
        message: 'cookies.txt is missing douyin.com/iesdouyin.com domain records.',
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

export async function buildDouyinAuthArgs(userId: string, tempDir: string): Promise<string[]> {
  const auth = await getDecryptedDouyinAuth(userId)
  if (!auth) return []

  const cookiesPath = path.join(tempDir, 'douyin-cookies.txt')
  if (auth.mode === 'cookies_txt') {
    await fs.writeFile(cookiesPath, auth.value, 'utf8')
    return ['--cookies', cookiesPath]
  }

  return ['--add-headers', `Cookie: ${auth.value}`]
}
