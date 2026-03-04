import { randomUUID } from 'crypto'
import { spawn, type ChildProcess } from 'child_process'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import {
  getCookieStrength,
  setBBDownAuth,
  updateBBDownAuthValidation,
  validateBBDownAuthCookie,
} from '~/lib/bbdown/auth'

type QRLoginStatus = 'pending' | 'waiting_scan' | 'confirmed' | 'success' | 'error' | 'cancelled'

type InternalSession = {
  id: string
  userId: string
  status: QRLoginStatus
  message: string
  startedAt: string
  updatedAt: string
  expiresAt: string
  qrImageDataUrl: string | null
  cookieStrength: ReturnType<typeof getCookieStrength> | null
  error: string | null
  process: ChildProcess | null
  workDir: string
  stdoutTail: string
  stderrTail: string
  extractedCookie: string | null
}

export type QRLoginPublicState = {
  active: boolean
  sessionId: string | null
  status: QRLoginStatus | null
  message: string | null
  startedAt: string | null
  updatedAt: string | null
  expiresAt: string | null
  qrImageDataUrl: string | null
  cookieStrength: ReturnType<typeof getCookieStrength> | null
  error: string | null
}

const sessionsByUser = new Map<string, InternalSession>()
const SESSION_TTL_MS = 3 * 60 * 1000
const FINAL_STATE_KEEP_MS = 5 * 60 * 1000

function nowIso(): string {
  return new Date().toISOString()
}

function cropTail(input: string, max = 8000): string {
  if (input.length <= max) return input
  return input.slice(input.length - max)
}

function toPublicState(session: InternalSession | null): QRLoginPublicState {
  if (!session) {
    return {
      active: false,
      sessionId: null,
      status: null,
      message: null,
      startedAt: null,
      updatedAt: null,
      expiresAt: null,
      qrImageDataUrl: null,
      cookieStrength: null,
      error: null,
    }
  }

  return {
    active: ['pending', 'waiting_scan', 'confirmed'].includes(session.status),
    sessionId: session.id,
    status: session.status,
    message: session.message,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    expiresAt: session.expiresAt,
    qrImageDataUrl: session.qrImageDataUrl,
    cookieStrength: session.cookieStrength,
    error: session.error,
  }
}

function setStatus(session: InternalSession, status: QRLoginStatus, message: string, error?: string) {
  session.status = status
  session.message = message
  session.updatedAt = nowIso()
  session.error = error || null
}

async function tryReadQrImageDataUrl(session: InternalSession) {
  const qrPath = path.join(session.workDir, 'qrcode.png')
  try {
    const buf = await fs.readFile(qrPath)
    session.qrImageDataUrl = `data:image/png;base64,${buf.toString('base64')}`
  } catch {
    // Ignore until the file exists.
  }
}

function extractCookieFromOutput(output: string): string | null {
  const lines = output.split(/\r?\n/)
  for (const rawLine of lines.reverse()) {
    const line = rawLine.trim()
    if (!line) continue
    const marker = '登录成功:'
    const idx = line.indexOf(marker)
    if (idx >= 0) {
      const cookie = line.slice(idx + marker.length).trim()
      if (cookie) return cookie
    }
  }
  return null
}

async function cleanupSession(session: InternalSession) {
  try {
    await fs.rm(session.workDir, { recursive: true, force: true })
  } catch {
    // Cleanup failure is non-fatal for business flow.
  }
}

function ensureNoActiveSession(userId: string) {
  const current = sessionsByUser.get(userId)
  if (!current) return
  if (['pending', 'waiting_scan', 'confirmed'].includes(current.status)) {
    throw new Error('A BBDown QR login session is already running. Cancel it or wait until it finishes.')
  }
}

export async function startBBDownQrLogin(userId: string): Promise<QRLoginPublicState> {
  ensureNoActiveSession(userId)

  const bbdownBin = process.env.BBDOWN_BIN || 'BBDown'
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bbdown-login-'))
  const session: InternalSession = {
    id: randomUUID(),
    userId,
    status: 'pending',
    message: 'Starting BBDown QR login...',
    startedAt: nowIso(),
    updatedAt: nowIso(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    qrImageDataUrl: null,
    cookieStrength: null,
    error: null,
    process: null,
    workDir,
    stdoutTail: '',
    stderrTail: '',
    extractedCookie: null,
  }

  const child = spawn(bbdownBin, ['login'], {
    cwd: workDir,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  session.process = child
  sessionsByUser.set(userId, session)

  const expireTimer = setTimeout(() => {
    const latest = sessionsByUser.get(userId)
    if (!latest || latest.id !== session.id) return
    if (!latest.process || latest.process.killed) return
    latest.process.kill('SIGINT')
    setStatus(latest, 'error', 'QR login expired. Please start again.', 'QR login timed out')
  }, SESSION_TTL_MS)

  child.stdout.on('data', async (buf: Buffer) => {
    const chunk = String(buf)
    session.stdoutTail = cropTail(session.stdoutTail + chunk)

    if (chunk.includes('生成二维码成功')) {
      await tryReadQrImageDataUrl(session)
      setStatus(session, 'waiting_scan', 'QR generated. Scan in Bilibili app.')
      return
    }
    if (chunk.includes('手机端确认登录后继续操作')) {
      setStatus(session, 'confirmed', 'Scanned. Waiting for confirmation in app.')
      return
    }
    if (chunk.includes('登录成功')) {
      const cookie = extractCookieFromOutput(session.stdoutTail + '\n' + chunk)
      if (cookie) {
        session.extractedCookie = cookie
      }
      setStatus(session, 'success', 'Login succeeded. Saving credential...')
    }
  })

  child.stderr.on('data', (buf: Buffer) => {
    const chunk = String(buf)
    session.stderrTail = cropTail(session.stderrTail + chunk)
  })

  child.on('error', (err) => {
    clearTimeout(expireTimer)
    setStatus(session, 'error', 'Failed to start BBDown login.', err.message)
    session.process = null
    void cleanupSession(session)
    setTimeout(() => {
      const latest = sessionsByUser.get(userId)
      if (latest?.id === session.id) sessionsByUser.delete(userId)
    }, FINAL_STATE_KEEP_MS)
  })

  child.on('close', async (code) => {
    clearTimeout(expireTimer)
    session.process = null

    if (session.status === 'cancelled') {
      await cleanupSession(session)
      setTimeout(() => {
        const latest = sessionsByUser.get(userId)
        if (latest?.id === session.id) sessionsByUser.delete(userId)
      }, FINAL_STATE_KEEP_MS)
      return
    }

    if (session.status === 'success' && session.extractedCookie) {
      try {
        await setBBDownAuth(userId, { mode: 'cookie', value: session.extractedCookie })
        const validation = await validateBBDownAuthCookie(session.extractedCookie)
        await updateBBDownAuthValidation(
          userId,
          validation.valid ? 'valid' : 'invalid',
          validation.valid ? undefined : validation.message,
        )
        session.cookieStrength = getCookieStrength(session.extractedCookie)
        setStatus(
          session,
          validation.valid ? 'success' : 'error',
          validation.valid
            ? 'Login succeeded and credential validated.'
            : `Login succeeded but validation failed: ${validation.message}`,
          validation.valid ? undefined : validation.message,
        )
      } catch (e: any) {
        setStatus(session, 'error', 'Login succeeded but failed to persist credential.', e?.message || 'Unknown error')
      } finally {
        await cleanupSession(session)
        setTimeout(() => {
          const latest = sessionsByUser.get(userId)
          if (latest?.id === session.id) sessionsByUser.delete(userId)
        }, FINAL_STATE_KEEP_MS)
      }
      return
    }

    if (code === 0 && !session.extractedCookie) {
      setStatus(
        session,
        'error',
        'BBDown completed but returned no credential.',
        'Login output did not include a cookie payload.',
      )
    } else if (session.status !== 'error') {
      const tail = session.stderrTail || session.stdoutTail
      setStatus(session, 'error', 'BBDown login failed.', tail ? tail.slice(-500) : `BBDown exited with code ${code}`)
    }

    await cleanupSession(session)
    setTimeout(() => {
      const latest = sessionsByUser.get(userId)
      if (latest?.id === session.id) sessionsByUser.delete(userId)
    }, FINAL_STATE_KEEP_MS)
  })

  return toPublicState(session)
}

export async function getBBDownQrLoginState(userId: string): Promise<QRLoginPublicState> {
  const session = sessionsByUser.get(userId) || null
  if (session && ['pending', 'waiting_scan', 'confirmed'].includes(session.status) && !session.qrImageDataUrl) {
    await tryReadQrImageDataUrl(session)
    if (session.qrImageDataUrl && session.status === 'pending') {
      setStatus(session, 'waiting_scan', 'QR generated. Scan in Bilibili app.')
    }
  }
  return toPublicState(session)
}

export function cancelBBDownQrLogin(userId: string): QRLoginPublicState {
  const session = sessionsByUser.get(userId) || null
  if (!session) return toPublicState(null)
  if (!session.process || session.process.killed) return toPublicState(session)

  setStatus(session, 'cancelled', 'QR login cancelled by user.')
  session.process.kill('SIGINT')
  return toPublicState(session)
}
