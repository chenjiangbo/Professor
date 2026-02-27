import type { NextApiRequest, NextApiResponse } from 'next'
import { getVideo, updateVideo } from '~/lib/repo'
import { generateVideoInterpretation } from '~/lib/openai/videoInterpretation'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).end()
    return
  }
  const { id } = req.query
  const { detailLevel = 600, showEmoji = true, outlineLevel = 1, sentenceNumber = 5, outputLanguage } = req.body || {}

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
    res.status(400).json({ error: '无可用于总结的原文内容' })
    return
  }

  try {
    let summary = ''
    let chapters: string | null = null
    try {
      const interpretation = await generateVideoInterpretation(video.title, video.transcript)
      summary = interpretation.summary
      chapters = JSON.stringify(interpretation.chapters)
    } catch (e: any) {
      const message = e?.message || '大纲生成未知错误'
      await updateVideo(id, { status: 'error', last_error: message, summary: `大纲生成失败：${message}` })
      res.status(422).json({ error: message })
      return
    }
    const updated = await updateVideo(id, { summary, chapters, status: 'ready', last_error: null })
    res.status(200).json(updated)
  } catch (e: any) {
    console.error('summarize failed', e.message)
    res.status(500).json({ error: e.message })
  }
}
