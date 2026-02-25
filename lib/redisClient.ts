import Redis from 'ioredis'

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379/0'
const useTls = (process.env.REDIS_TLS || '').toLowerCase() === 'true'

export const redis = new Redis(redisUrl, {
  tls: useTls ? {} : undefined,
  password: process.env.REDIS_PASSWORD || undefined,
})
