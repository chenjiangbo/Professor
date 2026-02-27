import type { NextApiRequest, NextApiResponse } from 'next'
import { getImportBatch, getImportBatchStats } from '~/lib/repo'

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    res.status(405).end()
    return
  }

  const { id } = req.query
  if (!id || typeof id !== 'string') {
    res.status(400).json({ error: '缺少参数 id' })
    return
  }
  if (!isUuid(id)) {
    res.status(400).json({ error: 'id 格式不合法（必须是 UUID）' })
    return
  }

  const batch = await getImportBatch(id)
  if (!batch) {
    res.status(404).json({ error: '批次不存在' })
    return
  }

  const stats = await getImportBatchStats(id)
  res.status(200).json({ ...batch, stats })
}
