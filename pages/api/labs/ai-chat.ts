import type { NextApiRequest, NextApiResponse } from 'next'

// Simple streaming proxy to LiteLLM for the dedicated lab chat page.
// It expects OpenAI-compatible streaming from LiteLLM and forwards raw text tokens.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const baseURL = process.env.LLM_BASE_URL_DEV || process.env.LLM_BASE_URL || 'https://api.openai.com/v1'
  const apiKey = process.env.LLM_API_KEY || ''
  const model =
    (req.body && (req.body.model as string)) ||
    process.env.AI_CHAT_MODEL ||
    process.env.LLM_MODEL ||
    'ollama/qwen3-vl:30b'

  const cleanBaseURL = baseURL.replace(/\/+$/, '')
  const endpoint = `${cleanBaseURL}/chat/completions`

  // Build messages, support both legacy {content} and new {parts} from ai-sdk
  const incomingMessages = req.body?.messages || []
  const images: string[] = req.body?.data?.images || []

  const normalizeContent = (msg: any) => {
    // If already parts (new ai-sdk), keep as-is
    if (Array.isArray(msg?.parts)) return msg.parts
    // If content is array, treat as parts already
    if (Array.isArray(msg?.content)) return msg.content
    // Fallback: plain text to parts
    if (msg?.content) return [{ type: 'text', text: msg.content }]
    return []
  }

  const messages = incomingMessages.map((m: any) => ({
    role: m.role,
    content: normalizeContent(m),
  }))

  // Inject images into last user message if provided
  if (images.length > 0) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        const imageParts = images.map((img) => ({
          type: 'image_url',
          image_url: { url: img },
        }))
        messages[i] = {
          ...messages[i],
          content: [...messages[i].content, ...imageParts],
        }
        break
      }
    }
  }

  // LiteLLM 的 ollama 模板不接受 content 为数组，需拍平成字符串（忽略非 text 部件）
  const normalizeForOllama = (msg: any) => {
    const parts = Array.isArray(msg.content) ? msg.content : []
    const textOnly = parts.filter((p: any) => p?.type === 'text' && typeof p.text === 'string').map((p: any) => p.text)
    const joined = textOnly.join('\n')
    return { role: msg.role, content: joined }
  }

  const payload = {
    model,
    messages: messages.map(normalizeForOllama),
    stream: true,
  }

  try {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    })

    if (!upstream.body || !upstream.ok) {
      const text = await upstream.text()
      res.status(upstream.status || 500).json({ error: text || 'Upstream error' })
      return
    }

    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache, no-transform',
    })

    const reader = upstream.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value)
      // Parse SSE lines and emit only the delta content
      for (const line of chunk.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed === 'data: [DONE]') continue
        if (trimmed.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmed.slice(6))
            const content = json.choices?.[0]?.delta?.content
            if (content) {
              res.write(content)
            }
          } catch (err) {
            // ignore partial JSON errors
          }
        }
      }
    }

    res.end()
  } catch (error: any) {
    console.error('[labs/ai-chat] proxy error', error)
    if (!res.headersSent) {
      res.status(500).json({ error: error?.message || 'Internal error' })
    }
  }
}
