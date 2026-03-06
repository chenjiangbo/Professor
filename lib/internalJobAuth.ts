import type { NextApiRequest, NextApiResponse } from 'next'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return String(value).trim()
}

export function requireInternalJobAuth(req: NextApiRequest, res: NextApiResponse): boolean {
  const expectedToken = requireEnv('BILLING_JOB_TOKEN')
  const token = String(req.headers['x-job-token'] || '').trim()
  if (!token || token !== expectedToken) {
    res.status(401).json({ error: 'Unauthorized job request' })
    return false
  }
  return true
}
