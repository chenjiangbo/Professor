import Head from 'next/head'
import { useChat } from '@ai-sdk/react'
import { useEffect, useRef, useState } from 'react'

const containerStyle = 'mx-auto flex min-h-screen max-w-4xl flex-col gap-4 px-4 py-6 text-slate-100 bg-slate-950'

export default function LabsAIChat() {
  const [model, setModel] = useState<string | undefined>(undefined)
  const [attachments, setAttachments] = useState<string[]>([])
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Dedicated API path to avoid clashing with existing /chat usage
  const { messages, sendMessage, status, setMessages, error } = useChat({
    api: '/api/labs/ai-chat',
    body: { model },
  } as any) as any

  // Focus textarea on load
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const isStreaming = status === 'streaming' || status === 'submitted'

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    const value = inputRef.current?.value || ''
    if (!value.trim()) return
    inputRef.current!.value = ''
    await sendMessage({ text: value, data: { images: attachments } })
    setAttachments([])
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result as string
      setAttachments((prev) => [...prev, base64])
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  return (
    <>
      <Head>
        <title>AI Chat (Labs)</title>
      </Head>
      <main className={containerStyle}>
        <header className="flex flex-col gap-2">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Labs</div>
          <h1 className="text-2xl font-semibold text-white">Vision Chat · Vertex Gemini</h1>
          <p className="text-sm text-slate-400">
            Uses Google Vertex AI directly. This page is isolated from the main app so you can iterate safely.
          </p>
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
            <label className="flex items-center gap-2">
              <span className="text-slate-400">Model</span>
              <input
                className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100 outline-none focus:border-sky-500"
                placeholder="google/gemini-2.5-pro"
                value={model || ''}
                onChange={(e) => setModel(e.target.value || undefined)}
              />
            </label>
            <span className="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-400">
              Status: {isStreaming ? 'Streaming' : 'Idle'}
            </span>
            {error && <span className="text-xs text-red-400">Error: {String(error)}</span>}
          </div>
        </header>

        <section className="flex-1 rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-inner">
          <div className="flex flex-col gap-3 overflow-y-auto">
            {messages.length === 0 && (
              <div className="rounded-lg border border-dashed border-slate-700 px-4 py-6 text-sm text-slate-400">
                Send a message to start chatting with Vertex Gemini.
              </div>
            )}
            {messages.map((m: any, idx: number) => (
              <div
                key={idx}
                className={`flex flex-col gap-2 rounded-lg border px-3 py-2 ${
                  m.role === 'user' ? 'border-sky-800 bg-sky-900/30' : 'border-slate-800 bg-slate-800/50'
                }`}
              >
                <div className="text-xs uppercase tracking-wide text-slate-400">{m.role}</div>
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-100">{m.content}</div>
              </div>
            ))}
            {isStreaming && (
              <div className="text-xs text-slate-500" aria-live="polite">
                Generating...
              </div>
            )}
            <div ref={messages.length ? undefined : null} />
          </div>
        </section>

        <form onSubmit={handleSend} className="sticky bottom-6 flex flex-col gap-3">
          <textarea
            ref={inputRef}
            placeholder="Ask me anything…"
            className="min-h-[96px] w-full resize-none rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-slate-100 shadow-inner outline-none focus:border-sky-500"
            disabled={isStreaming}
          />
          <div className="flex items-center justify-between text-sm text-slate-400">
            <button
              type="submit"
              disabled={isStreaming}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-700"
            >
              {isStreaming ? 'Waiting…' : 'Send'}
            </button>
            <button
              type="button"
              onClick={() => setMessages([])}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              Clear
            </button>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-400">
            <label className="flex items-center gap-2">
              <input type="file" accept="image/*" onChange={handleFile} className="text-slate-300" />
              <span>Attach image (vision)</span>
            </label>
            {attachments.length > 0 && (
              <span className="rounded-full border border-sky-700 px-2 py-0.5 text-xs text-sky-300">
                {attachments.length} image ready
              </span>
            )}
          </div>
        </form>
      </main>
    </>
  )
}
