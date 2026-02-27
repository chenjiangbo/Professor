import type { NextApiRequest, NextApiResponse } from 'next'
import { streamText, convertToModelMessages, pipeUIMessageStreamToResponse, type UIMessage } from 'ai'
import { randomUUID } from 'crypto'
import { pool } from '~/lib/db'
import { getVideo, listVideos } from '~/lib/repo'
import { createVertexProvider, resolveVertexModel } from '~/lib/ai/vertex'

function buildVideoContext(video: any): string {
  const title = String(video?.title || '').trim()
  const summary = String(video?.summary || '').trim()
  const transcript = String(video?.transcript || '').trim()
  const chapters = Array.isArray(video?.chapters) ? video.chapters : []
  const chapterText = chapters
    .map((c: any, idx: number) => {
      const chTitle = String(c?.title || `Chapter ${idx + 1}`).trim()
      const chBody = String(c?.summary || '').trim()
      return `## ${idx + 1}. ${chTitle}\n${chBody}`
    })
    .join('\n\n')

  return [
    `Title: ${title}`,
    summary ? `Summary:\n${summary}` : '',
    chapterText ? `Chapters:\n${chapterText}` : '',
    transcript ? `Source Text:\n${transcript}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

function buildPromptPrefix(context: string) {
  return `
你是一位深受学生喜爱的、博学且极具启发性的深度学习导师。

【当前学习资料】：
${context || '(当前未选择资料，上下文为空)'}

【你的辅导哲学】：
1. 融会贯通：解答用户疑问时，请先从【当前学习资料】中提取核心观点作为解答基石。
2. 无界知识：如果用户提问超出资料范围（例如追问底层原理、实操方法或最新案例），不要回答“资料未提及”。请直接调动你的知识储备补充解答。
3. 透明交流：在自然流畅的对话中，让用户感知知识来源。例如：“视频中提到了...，另外结合目前研究...”
4. 拒绝机械：像真正聪明的人类导师一样交流。可使用恰当比喻解释复杂概念。
5. 事实求证：当涉及具体数据、文献、政策或时效性事件时，请明确说明结论依据，避免武断表达。

【输出要求】：
- 回答使用清晰的 Markdown。
- 直接输出最终答案，不要输出你的内部思考、草稿、评估过程、查核清单或“我将如何回答”的计划。
- 不要输出类似“测评：”“结构化草稿：”“Let's refine...”“Response draft...”这类中间过程文本。
`.trim()
}

function normalizeModelName(input: unknown) {
  const requested = String(input || '').trim()
  const fallback = resolveVertexModel()
  const model = requested || fallback
  return model.replace(/^google\//, '')
}

function normalizeIncomingMessages(messages: UIMessage[]) {
  const allowedRoles = new Set(['system', 'user', 'assistant', 'tool'])
  return (Array.isArray(messages) ? messages : [])
    .map((msg: any, idx: number) => {
      const rawRole = String(msg?.role || '').trim()
      const role = rawRole === 'developer' ? 'system' : rawRole
      if (!allowedRoles.has(role)) return null

      const rawParts = Array.isArray(msg?.parts) ? msg.parts : []
      const parts = rawParts.length
        ? rawParts
        : typeof msg?.content === 'string' && msg.content.trim()
        ? [{ type: 'text', text: msg.content }]
        : []

      if (!parts.length && role !== 'tool') return null

      return {
        ...msg,
        id: String(msg?.id || `m-${Date.now()}-${idx}`),
        role,
        parts,
      }
    })
    .filter(Boolean) as UIMessage[]
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: '不支持该请求方法' })
    return
  }

  try {
    const { messages, notebookId, videoIds } = req.body as {
      messages: UIMessage[]
      notebookId?: string
      videoIds?: string[]
    }

    const model = normalizeModelName((req.body as any)?.model)
    const vertex = createVertexProvider()

    const safeMessages = normalizeIncomingMessages(Array.isArray(messages) ? messages : [])
    const modelMessages = convertToModelMessages(safeMessages)

    if (!notebookId) {
      const result = streamText({
        model: vertex(model),
        messages: modelMessages,
      })
      pipeUIMessageStreamToResponse({
        response: res,
        status: 200,
        stream: result.toUIMessageStream(),
      })
      return
    }

    let videos: any[] = []
    if (Array.isArray(videoIds) && videoIds.length > 0) {
      videos = (await Promise.all(videoIds.map((id: string) => getVideo(id)))).filter(Boolean) as any[]
    } else {
      videos = await listVideos(notebookId)
    }

    const context = videos.map((v: any) => buildVideoContext(v)).join('\n\n---\n\n')
    const promptPrefix = buildPromptPrefix(context)

    const lastMessage = safeMessages[safeMessages.length - 1]
    if (lastMessage && lastMessage.role === 'user') {
      const textContent =
        lastMessage.parts
          ?.filter((p: any) => p.type === 'text')
          .map((p: any) => p.text)
          .join('') || String((lastMessage as any).content || '')

      if (textContent) {
        try {
          await pool.query(
            `INSERT INTO chat_messages (id, notebook_id, role, content, video_ids) VALUES ($1, $2, $3, $4, $5)`,
            [randomUUID(), notebookId, 'user', textContent, JSON.stringify(videoIds || [])],
          )
        } catch (e) {
          console.error('[Chat API] DB Save Error (User):', e)
        }
      }
    }

    const result = streamText({
      model: vertex(model),
      system: promptPrefix,
      messages: modelMessages,
      async onFinish({ text }: { text?: string }) {
        if (!text) return
        try {
          await pool.query(
            `INSERT INTO chat_messages (id, notebook_id, role, content, video_ids) VALUES ($1, $2, $3, $4, $5)`,
            [randomUUID(), notebookId, 'assistant', text, JSON.stringify(videoIds || [])],
          )
        } catch (e) {
          console.error('[Chat API] DB Save Error (Assistant):', e)
        }
      },
    })

    pipeUIMessageStreamToResponse({
      response: res,
      status: 200,
      stream: result.toUIMessageStream(),
    })
  } catch (error: any) {
    console.error('[Chat API] Error:', error)
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || '聊天服务内部错误' })
    }
  }
}
