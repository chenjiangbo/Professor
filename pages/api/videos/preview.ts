import type { NextApiRequest, NextApiResponse } from 'next'
import { buildBilibiliPreviewItems, isBilibiliUrl, resolveBilibiliUrl } from '~/lib/bilibili/preview'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).end()
    return
  }

  const { url } = req.body || {}
  if (!url) {
    res.status(400).json({ error: 'url required' })
    return
  }
  if (!isBilibiliUrl(url)) {
    res.status(400).json({ error: 'Only Bilibili URLs are supported now.' })
    return
  }

  try {
    const resolvedUrl = await resolveBilibiliUrl(url)
    const items = await buildBilibiliPreviewItems(resolvedUrl)
    res.status(200).json({
      items,
    })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
}
