import type { NextApiRequest, NextApiResponse } from 'next'
import { getVideo } from '~/lib/repo'

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

  const video = await getVideo(id)
  if (!video) {
    res.status(404).json({ error: '资源不存在' })
    return
  }
  if (!video.transcript) {
    res.status(404).json({ error: '无可导出的原文内容' })
    return
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="subtitle-${id}.txt"`)
  res.status(200).send(video.transcript)
}
