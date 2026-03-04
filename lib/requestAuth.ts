import type { NextApiRequest, NextApiResponse } from 'next'

function normalizeHeaderValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return String(value[0] || '').trim()
  }
  return String(value || '').trim()
}

export function getUserIdFromRequest(req: NextApiRequest): string {
  return normalizeHeaderValue(req.headers['x-user-id'])
}

export function getUserEmailFromRequest(req: NextApiRequest): string {
  return normalizeHeaderValue(req.headers['x-user-email'])
}

export function getUserNameB64FromRequest(req: NextApiRequest): string {
  return normalizeHeaderValue(req.headers['x-user-name-b64'])
}

export function decodeUserNameFromB64(raw: string): string {
  const val = String(raw || '').trim()
  if (!val) return ''
  try {
    return Buffer.from(val, 'base64url').toString('utf8').trim()
  } catch {
    return ''
  }
}

function getDevAuthMode(): string {
  return String(process.env.DEV_AUTH_MODE || '')
    .trim()
    .toLowerCase()
}

function ensureDevAuthModeSafe() {
  if (process.env.NODE_ENV === 'production' && getDevAuthMode() === 'mock') {
    throw new Error('Invalid configuration: DEV_AUTH_MODE=mock is forbidden in production.')
  }
}

export function assertAuthConfiguration() {
  ensureDevAuthModeSafe()
}

function resolveMockUserIdForNonProd(): string | null {
  ensureDevAuthModeSafe()
  if (getDevAuthMode() !== 'mock') return null

  const mockUserId = String(process.env.DEV_AUTH_MOCK_USER_ID || '').trim()
  if (!mockUserId) {
    throw new Error('DEV_AUTH_MODE=mock requires DEV_AUTH_MOCK_USER_ID to be configured.')
  }
  return mockUserId
}

export function requireUserId(req: NextApiRequest, res: NextApiResponse): string | null {
  ensureDevAuthModeSafe()
  const userId = getUserIdFromRequest(req)
  if (userId) {
    return userId
  }

  const mockUserId = resolveMockUserIdForNonProd()
  if (mockUserId) {
    return mockUserId
  }

  res.status(401).json({ error: 'Unauthorized: missing X-User-ID' })
  return null
}

export function isAdminUserId(userId: string): boolean {
  const raw = process.env.PROFESSOR_ADMIN_USER_IDS
  if (!raw) {
    return false
  }

  const ids = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  return ids.includes(userId)
}
