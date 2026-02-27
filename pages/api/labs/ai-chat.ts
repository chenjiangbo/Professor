import type { NextApiRequest, NextApiResponse } from 'next'
import { convertToModelMessages, pipeUIMessageStreamToResponse, streamText, type UIMessage } from 'ai'
import { createVertexProvider, resolveVertexModel } from '~/lib/ai/vertex'

function normalizeModelName(input: unknown) {
  const requested = String(input || '').trim()
  const fallback = resolveVertexModel()
  const model = requested || fallback
  return model.replace(/^google\//, '')
}

function normalizeIncomingMessages(messages: UIMessage[]) {
  return messages.map((msg: any) => {
    if (msg?.role === 'developer') {
      return { ...msg, role: 'system' }
    }
    return msg
  }) as UIMessage[]
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: '不支持该请求方法' })
    return
  }

  try {
    const messages = (req.body?.messages || []) as UIMessage[]
    const model = normalizeModelName(req.body?.model)
    const vertex = createVertexProvider()
    const modelMessages = convertToModelMessages(normalizeIncomingMessages(messages))

    const result = streamText({
      model: vertex(model),
      messages: modelMessages,
    })

    pipeUIMessageStreamToResponse({
      response: res,
      status: 200,
      stream: result.toUIMessageStream(),
    })
  } catch (error: any) {
    console.error('[labs/ai-chat] vertex chat error', error)
    if (!res.headersSent) {
      res.status(500).json({ error: error?.message || '内部服务错误' })
    }
  }
}
