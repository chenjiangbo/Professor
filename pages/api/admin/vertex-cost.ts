import type { NextApiRequest, NextApiResponse } from 'next'
import { fetchVertexCostSummary } from '~/lib/monitoring/vertexCost'

function parseWindowDays(raw: string | string[] | undefined) {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (!value) {
    return 7
  }
  const numeric = Number.parseInt(value, 10)
  if (!Number.isInteger(numeric) || numeric <= 0 || numeric > 90) {
    throw new Error(`查询参数 days 非法：${value}。必须是 1 到 90 之间的整数。`)
  }
  return numeric
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: '不支持该请求方法' })
    return
  }

  try {
    const days = parseWindowDays(req.query.days)
    const summary = await fetchVertexCostSummary(days)
    res.status(200).json(summary)
  } catch (error: any) {
    console.error('[Vertex Cost Dashboard] API Error:', error)
    res.status(500).json({
      error: error?.message || '获取 Vertex 成本指标失败',
    })
  }
}
