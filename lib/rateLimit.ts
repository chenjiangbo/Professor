import { FREE_LIMIT_COUNT, LOGIN_LIMIT_COUNT } from '~/utils/constants'
import { redis } from './redisClient'

type LimitResult = {
  success: boolean
  remaining: number
}

const ONE_DAY_SECONDS = 24 * 60 * 60

async function fixedWindow(key: string, limit: number, windowSeconds: number = ONE_DAY_SECONDS): Promise<LimitResult> {
  const count = await redis.incr(key)
  if (count === 1) {
    await redis.expire(key, windowSeconds)
  }
  const success = count <= limit
  return { success, remaining: Math.max(limit - count, 0) }
}

export async function limitForIp(ip: string): Promise<LimitResult> {
  return fixedWindow(`rate:ip:${ip}`, FREE_LIMIT_COUNT)
}

export async function limitForApiKeyIp(ip: string): Promise<LimitResult> {
  return fixedWindow(`rate:ip-api:${ip}`, FREE_LIMIT_COUNT * 2)
}

export async function limitForFreeAccount(userIdOrEmail: string): Promise<LimitResult> {
  return fixedWindow(`rate:user:${userIdOrEmail}`, LOGIN_LIMIT_COUNT)
}
