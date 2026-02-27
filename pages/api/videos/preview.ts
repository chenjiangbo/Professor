import type { NextApiRequest, NextApiResponse } from 'next'
import { buildBilibiliPreviewItems, isBilibiliUrl, resolveBilibiliUrl } from '~/lib/bilibili/preview'
import { buildYouTubePreviewItems, isYouTubeUrl } from '~/lib/youtube/preview'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).end()
    return
  }

  const { url } = req.body || {}
  if (!url) {
    res.status(400).json({ error: '缺少参数 url' })
    return
  }
  if (!isBilibiliUrl(url) && !isYouTubeUrl(url)) {
    res.status(400).json({ error: '当前仅支持 B 站或 YouTube URL' })
    return
  }

  try {
    const items = isBilibiliUrl(url)
      ? await buildBilibiliPreviewItems(await resolveBilibiliUrl(url))
      : await buildYouTubePreviewItems(url)
    res.status(200).json({
      items,
    })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
}
