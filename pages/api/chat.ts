import type { NextApiRequest, NextApiResponse } from 'next'
import { streamText, convertToModelMessages, pipeUIMessageStreamToResponse, type UIMessage } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { randomUUID } from 'crypto'
import { pool } from '~/lib/db'
import { getVideo, listVideos } from '~/lib/repo'

// Initialize OpenAI client with custom baseURL (LiteLLM)
const baseURL = (process.env.LLM_BASE_URL_DEV || process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(
  /\/+$/,
  '',
)

console.log(`[Chat API] Initializing with baseURL: ${baseURL}`)

const openai = createOpenAI({
  baseURL,
  apiKey: process.env.LLM_API_KEY || 'sk-placeholder',
})

function buildVideoContext(video: any): string {
  const title = String(video?.title || '').trim()
  const summary = String(video?.summary || '').trim()
  const chapters = Array.isArray(video?.chapters) ? video.chapters : []
  const chapterText = chapters
    .map((c: any, idx: number) => {
      const chTitle = String(c?.title || `Chapter ${idx + 1}`).trim()
      const chBody = String(c?.summary || '').trim()
      return `## ${idx + 1}. ${chTitle}\n${chBody}`
    })
    .join('\n\n')

  const raw = [`Title: ${title}`, summary ? `Summary:\n${summary}` : '', chapterText ? `Chapters:\n${chapterText}` : '']
    .filter(Boolean)
    .join('\n\n')

  // Hard cap context size to avoid prompt overrun.
  return raw.slice(0, 30000)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log('[Chat API] Handler called')

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

    // Decide model per mode
    const model = !notebookId
      ? process.env.AI_CHAT_MODEL || process.env.LLM_MODEL || 'gpt-4o-mini'
      : process.env.LLM_MODEL || 'gpt-4o-mini'

    console.log('[Chat API] Request:', {
      notebookId,
      videoCount: videoIds?.length,
      messageCount: messages?.length,
      model,
    })

    // Convert UIMessage[] to ModelMessage[] (parts[] -> content format)
    const modelMessages = convertToModelMessages(messages)

    // --- Labs mode: no notebookId ---
    if (!notebookId) {
      console.log('[Chat API] Labs mode')

      const result = streamText({
        model: openai.chat(model),
        messages: modelMessages,
      })

      pipeUIMessageStreamToResponse({
        response: res,
        status: 200,
        stream: result.toUIMessageStream(),
      })
      return
    }

    // --- Notebook mode: with video context ---
    console.log('[Chat API] Notebook mode')

    // Fetch video context
    let videos: any[] = []
    if (Array.isArray(videoIds) && videoIds.length > 0) {
      videos = (await Promise.all(videoIds.map((id: string) => getVideo(id)))).filter(Boolean) as any[]
    } else {
      videos = await listVideos(notebookId)
    }

    const context = videos.map((v: any) => buildVideoContext(v)).join('\n\n---\n\n')

    const systemMessage = `You are a helpful assistant. Answer questions based on the provided video interpretation context (title, summary, chapters).\nDo not invent facts not grounded in this context. If context is insufficient, say what is missing.\n\nContext:\n${context}`

    // Extract last user message content for DB
    const lastMessage = messages[messages.length - 1]
    if (lastMessage && lastMessage.role === 'user') {
      const textContent =
        lastMessage.parts
          ?.filter((p: any) => p.type === 'text')
          .map((p: any) => p.text)
          .join('') || ''

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

    // Stream response
    const result = streamText({
      model: openai.chat(model),
      system: systemMessage,
      messages: modelMessages,
      async onFinish({ text }) {
        if (text) {
          try {
            await pool.query(
              `INSERT INTO chat_messages (id, notebook_id, role, content, video_ids) VALUES ($1, $2, $3, $4, $5)`,
              [randomUUID(), notebookId, 'assistant', text, JSON.stringify(videoIds || [])],
            )
            console.log('[Chat API] Saved assistant response')
          } catch (e) {
            console.error('[Chat API] DB Save Error (Assistant):', e)
          }
        }
      },
    })

    // Use pipeUIMessageStreamToResponse for Pages Router
    pipeUIMessageStreamToResponse({
      response: res,
      status: 200,
      stream: result.toUIMessageStream(),
    })
  } catch (error: any) {
    console.error('[Chat API] Error:', error)
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || 'Internal Server Error' })
    }
  }
}
