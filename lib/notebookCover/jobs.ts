import { Queue } from 'bullmq'
import IORedis from 'ioredis'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return String(value).trim()
}

const queueName = 'billing-jobs'

let queueInstance: Queue | null = null

function getQueue() {
  if (!queueInstance) {
    const redisUrl = requireEnv('REDIS_URL')
    const connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    })
    queueInstance = new Queue(queueName, { connection })
  }
  return queueInstance
}

export async function enqueueNotebookCoverGeneration(userId: string, notebookId: string) {
  const queue = getQueue()
  await queue.add(
    'notebook-cover-generate',
    { userId, notebookId },
    {
      jobId: `notebook-cover-${notebookId}`,
      removeOnComplete: 100,
      removeOnFail: 200,
    },
  )
}
