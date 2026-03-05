import type { NextApiRequest, NextApiResponse } from 'next'
import { buildBilibiliPreviewItems, isBilibiliUrl, resolveBilibiliUrl } from '~/lib/bilibili/preview'
import { buildYouTubePreviewItems, isYouTubeUrl } from '~/lib/youtube/preview'
import { buildDouyinPreviewItems, isDouyinUrl } from '~/lib/douyin/preview'
import { requireUserId } from '~/lib/requestAuth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = requireUserId(req, res)
  if (!userId) return

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).end()
    return
  }

  const { url } = req.body || {}
  if (!url) {
    res.status(400).json({ error: 'Missing required parameter: url' })
    return
  }
  if (!isBilibiliUrl(url) && !isYouTubeUrl(url) && !isDouyinUrl(url)) {
    res.status(400).json({ error: 'Only Bilibili, YouTube, or Douyin URLs are supported' })
    return
  }

  try {
    const items = isBilibiliUrl(url)
      ? await buildBilibiliPreviewItems(await resolveBilibiliUrl(url))
      : isYouTubeUrl(url)
      ? await buildYouTubePreviewItems(userId, url)
      : await buildDouyinPreviewItems(userId, url)
    res.status(200).json({
      items,
    })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
}
