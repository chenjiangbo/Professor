const { Queue, Worker } = require('bullmq')
const Redis = require('ioredis')

function requireEnv(name) {
  const value = process.env[name]
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return String(value).trim()
}

const redisUrl = requireEnv('REDIS_URL')
const jobToken = requireEnv('BILLING_JOB_TOKEN')
const appBaseUrl = requireEnv('INTERNAL_JOB_BASE_URL').replace(/\/+$/, '')

const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
})

const queueName = 'billing-jobs'
const queue = new Queue(queueName, { connection })

async function callInternalJob(path, body) {
  const resp = await fetch(`${appBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-job-token': jobToken,
    },
    body: JSON.stringify(body || {}),
  })

  const text = await resp.text()
  let payload = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = text
  }

  if (!resp.ok) {
    throw new Error(`internal job failed (${resp.status}): ${JSON.stringify(payload)}`)
  }
  return payload
}

async function ensureRepeatableJobs() {
  await queue.add(
    'billing-reconcile',
    { limit: 200 },
    {
      jobId: 'billing-reconcile-repeat-5m',
      repeat: { pattern: '*/5 * * * *' },
      removeOnComplete: 50,
      removeOnFail: 100,
    },
  )

  await queue.add(
    'subscription-expire',
    {},
    {
      jobId: 'subscription-expire-repeat-midnight-cn',
      repeat: { pattern: '0 0 * * *', tz: 'Asia/Shanghai' },
      removeOnComplete: 50,
      removeOnFail: 100,
    },
  )
}

const worker = new Worker(
  queueName,
  async (job) => {
    if (job.name === 'billing-reconcile') {
      const payload = await callInternalJob('/api/internal/jobs/billing-reconcile', {
        limit: Number(job.data?.limit || 200),
      })
      return payload
    }

    if (job.name === 'subscription-expire') {
      const payload = await callInternalJob('/api/internal/jobs/subscription-expire', {})
      return payload
    }

    throw new Error(`Unsupported billing job: ${job.name}`)
  },
  { connection, concurrency: 1 },
)

worker.on('ready', async () => {
  await ensureRepeatableJobs()
  console.log('[billing-worker] ready')
})

worker.on('completed', (job, result) => {
  console.log('[billing-worker] completed', job.name, JSON.stringify(result))
})

worker.on('failed', (job, error) => {
  console.error('[billing-worker] failed', job?.name, error)
})

process.on('SIGINT', async () => {
  await worker.close()
  await queue.close()
  await connection.quit()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  await worker.close()
  await queue.close()
  await connection.quit()
  process.exit(0)
})
