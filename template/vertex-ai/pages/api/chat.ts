import type { NextApiRequest, NextApiResponse } from 'next'
import { streamText, convertToModelMessages, pipeUIMessageStreamToResponse, type UIMessage } from 'ai'
import { randomUUID } from 'crypto'
import { pool } from '~/lib/db'
import { getNotebook, getVideo, listVideos } from '~/lib/repo'
import { createVertexProvider, resolveVertexModel } from '~/lib/ai/vertex'
import { requireUserId } from '~/lib/requestAuth'

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
You are a knowledgeable and inspiring learning coach.

[Current Learning Materials]
${context || '(No material selected; context is empty.)'}

[Guidance Principles]
1. Start from the provided learning materials whenever they are relevant.
2. If the question goes beyond the materials, use your general knowledge to fill in the gaps instead of refusing.
3. Be transparent about source grounding in natural language when useful (for example: "In the video..., and based on current research...").
4. Avoid robotic phrasing. Explain complex ideas with clear analogies when helpful.
5. For concrete data, policies, papers, or time-sensitive events, state your basis and avoid overconfident claims.

[Output Requirements]
- Respond in clear Markdown.
- Output only the final answer.
- Do not output hidden reasoning, scratch notes, checklists, or drafting text such as "Response draft" or "Let's refine...".
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
  const userId = requireUserId(req, res)
  if (!userId) return

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
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
      videos = (await Promise.all(videoIds.map((id: string) => getVideo(userId, id)))).filter(Boolean) as any[]
    } else {
      const notebook = await getNotebook(userId, notebookId)
      if (!notebook) {
        res.status(404).json({ error: 'Notebook not found' })
        return
      }
      videos = await listVideos(userId, notebookId)
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
      res.status(500).json({ error: error.message || 'Chat service internal error' })
    }
  }
}
