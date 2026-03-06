import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

const API_PREFIX = '/api/'
const INTERNAL_JOB_PREFIX = '/api/internal/jobs/'

function getDevAuthMode(): string {
  return String(process.env.DEV_AUTH_MODE || '')
    .trim()
    .toLowerCase()
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (!pathname.startsWith(API_PREFIX)) {
    return NextResponse.next()
  }

  if (process.env.NODE_ENV === 'production' && getDevAuthMode() === 'mock') {
    return NextResponse.json(
      { error: 'Invalid configuration: DEV_AUTH_MODE=mock is forbidden in production.' },
      { status: 500 },
    )
  }

  if (pathname.startsWith(INTERNAL_JOB_PREFIX)) {
    const expectedToken = String(process.env.BILLING_JOB_TOKEN || '').trim()
    if (!expectedToken) {
      return NextResponse.json({ error: 'Missing required environment variable: BILLING_JOB_TOKEN' }, { status: 500 })
    }

    const token = String(req.headers.get('x-job-token') || '').trim()
    if (!token || token !== expectedToken) {
      return NextResponse.json({ error: 'Unauthorized job request' }, { status: 401 })
    }

    return NextResponse.next()
  }

  const userId = req.headers.get('x-user-id')
  if (!userId || !userId.trim()) {
    if (getDevAuthMode() === 'mock' && process.env.NODE_ENV !== 'production') {
      const mockUserId = String(process.env.DEV_AUTH_MOCK_USER_ID || '').trim()
      if (!mockUserId) {
        return NextResponse.json(
          { error: 'DEV_AUTH_MODE=mock requires DEV_AUTH_MOCK_USER_ID to be configured.' },
          { status: 500 },
        )
      }

      const requestHeaders = new Headers(req.headers)
      requestHeaders.set('x-user-id', mockUserId)
      return NextResponse.next({ request: { headers: requestHeaders } })
    }

    return NextResponse.json({ error: 'Unauthorized: missing X-User-ID' }, { status: 401 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/:path*'],
}
