import { decryptText, encryptText } from '~/lib/security/crypto'
import { deleteAppSetting, getAppSetting, setAppSetting } from '~/lib/repo'

export type BBDownAuthMode = 'sessdata' | 'cookie'
export type BBDownAuthStatus = 'unknown' | 'valid' | 'invalid'

const BBDOWN_AUTH_KEY = 'bbdown_auth'

type BBDownAuthRecord = {
  mode: BBDownAuthMode
  encryptedValue: string
  status: BBDownAuthStatus
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

function normalizeFullCookie(rawValue: string): string {
  const normalized = normalizeCookieHeaderText(rawValue)
  if (!normalized) throw new Error('Credential is required')

  // Accept single SESSDATA value even in full-cookie mode.
  if (!normalized.includes('=') && !normalized.includes(';')) {
    const sess = normalized
      .replace(/^SESSDATA=/i, '')
      .replace(/;.*$/, '')
      .trim()
    if (sess) return `SESSDATA=${sess}`
  }

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

  if (!pairs.length) throw new Error('Invalid Cookie string')
  return pairs.join('; ')
}

function isCookieStrong(cookie: string): boolean {
  const lower = cookie.toLowerCase()
  return lower.includes('sessdata=') && lower.includes('dedeuserid=') && lower.includes('bili_jct=')
}

function normalizeCookieFromInput(mode: BBDownAuthMode, rawValue: string): string {
  const value = normalizeCookieHeaderText(rawValue)
  if (!value) throw new Error('Credential is required')
  if (mode === 'sessdata') {
    const sanitized = value
      .replace(/^SESSDATA=/i, '')
      .replace(/;.*$/, '')
      .trim()
    if (!sanitized) throw new Error('Invalid SESSDATA')
    return `SESSDATA=${sanitized}`
  }
  return normalizeFullCookie(value)
}

function parseRecord(raw: string | null): BBDownAuthRecord | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed?.mode || !parsed?.encryptedValue) return null
    return parsed as BBDownAuthRecord
  } catch {
    return null
  }
}

export async function getBBDownAuthRecord(): Promise<BBDownAuthRecord | null> {
  const raw = await getAppSetting(BBDOWN_AUTH_KEY)
  return parseRecord(raw)
}

export async function setBBDownAuth(input: { mode: BBDownAuthMode; value: string }) {
  const cookie = normalizeCookieFromInput(input.mode, input.value)
  const now = new Date().toISOString()
  const record: BBDownAuthRecord = {
    mode: input.mode,
    encryptedValue: encryptText(cookie),
    status: 'unknown',
    updatedAt: now,
    lastValidatedAt: undefined,
    lastError: undefined,
  }
  await setAppSetting(BBDOWN_AUTH_KEY, JSON.stringify(record))
  return record
}

export async function clearBBDownAuth() {
  await deleteAppSetting(BBDOWN_AUTH_KEY)
}

export async function getDecryptedBBDownCookie(): Promise<string | null> {
  const record = await getBBDownAuthRecord()
  if (!record) return null
  return decryptText(record.encryptedValue)
}

export async function updateBBDownAuthValidation(status: BBDownAuthStatus, lastError?: string) {
  const record = await getBBDownAuthRecord()
  if (!record) return null
  const updated: BBDownAuthRecord = {
    ...record,
    status,
    lastValidatedAt: new Date().toISOString(),
    lastError: lastError || undefined,
  }
  await setAppSetting(BBDOWN_AUTH_KEY, JSON.stringify(updated))
  return updated
}

export async function validateBBDownAuthCookie(cookie: string): Promise<{ valid: boolean; message: string }> {
  try {
    const res = await fetch('https://api.bilibili.com/x/web-interface/nav', {
      headers: { cookie },
    })
    if (!res.ok) {
      return { valid: false, message: `Bilibili nav API returned ${res.status}` }
    }
    const json = await res.json()
    const isLogin = Boolean(json?.data?.isLogin)
    if (!isLogin) {
      return { valid: false, message: 'Bilibili cookie is not logged-in (isLogin=false)' }
    }
    return { valid: true, message: 'Cookie valid' }
  } catch (e: any) {
    return { valid: false, message: e?.message || 'Failed to validate cookie' }
  }
}

export function getCookieStrength(cookie: string): { level: 'strong' | 'basic'; message: string } {
  if (isCookieStrong(cookie)) {
    return { level: 'strong', message: 'Full cookie detected (SESSDATA + DedeUserID + bili_jct).' }
  }
  return {
    level: 'basic',
    message:
      'Only basic cookie fields detected. Some Bilibili videos may still fail subtitle fetch; full cookie is recommended.',
  }
}

export function maskCredential(input: string | null | undefined): string {
  const text = String(input || '')
  if (!text) return ''
  if (text.length <= 8) return '****'
  return `${text.slice(0, 4)}****${text.slice(-4)}`
}
