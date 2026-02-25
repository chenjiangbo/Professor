import Head from 'next/head'
import { NextPage } from 'next'
import { useRouter } from 'next/router'
import useSWR from 'swr'
import { useMemo, useState } from 'react'
import { ModeToggle } from '~/components/mode-toggle'

type Video = {
  id: string
  title: string
  summary?: string
  chapters?: Array<{ title: string; time?: string; summary?: string }>
  status: string
  platform?: string
  duration?: string
  source_url?: string
  notebook_id?: string
}

type Notebook = { id: string; title: string }
type Note = { id: string; body: string; created_at: string }

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function parseTimeToSeconds(time?: string) {
  if (!time) return null
  const parts = time.split(':').map((p) => Number(p))
  if (parts.some((n) => Number.isNaN(n))) return null
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parts[0] || null
}

const VideoDetail: NextPage = () => {
  const router = useRouter()
  const { id } = router.query
  const videoId = typeof id === 'string' ? id : ''
  const { data: video } = useSWR<Video>(videoId ? `/api/videos?id=${videoId}` : null, fetcher, {
    refreshInterval: 4000,
  })
  const { data: notebook } = useSWR<Notebook>(
    video?.notebook_id ? `/api/notebooks/${video.notebook_id}` : null,
    fetcher,
  )
  const { data: videoList = [] } = useSWR<Video[]>(
    video?.notebook_id ? `/api/notebooks/${video.notebook_id}/videos` : null,
    fetcher,
    { refreshInterval: 4000 },
  )
  const { data: notes = [], mutate: mutateNotes } = useSWR<Note[]>(
    videoId ? `/api/notes?videoId=${videoId}` : null,
    fetcher,
    { refreshInterval: 5000 },
  )

  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [asking, setAsking] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [addingNote, setAddingNote] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [search, setSearch] = useState('')

  const statusColor = useMemo(() => {
    if (video?.status === 'ready') return 'text-success dark:text-green-400'
    if (video?.status === 'processing') return 'text-amber-500 dark:text-yellow-300'
    if (video?.status === 'error') return 'text-red-500 dark:text-red-400'
    return 'text-text-muted dark:text-white/70'
  }, [video?.status])

  const filteredList = useMemo(() => {
    if (!search) return videoList
    return videoList.filter((item) => item.title.toLowerCase().includes(search.toLowerCase()))
  }, [search, videoList])

  const handleDownloadSubtitle = async () => {
    if (!videoId) return
    setDownloading(true)
    try {
      const res = await fetch(`/api/videos/subtitle?id=${videoId}`)
      if (!res.ok) {
        alert('No transcript available to export.')
        setDownloading(false)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${video?.title || 'subtitle'}.txt`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert('Download failed.')
    } finally {
      setDownloading(false)
    }
  }

  const handleAsk = async () => {
    if (!question || !videoId) return
    setAsking(true)
    setAnswer('Generating...')
    const res = await fetch('/api/qa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoIds: [videoId], question, notebookId: video?.notebook_id }),
    })
    const json = await res.json()
    setAnswer(json.answer || '')
    setAsking(false)
  }

  const handleAddNote = async () => {
    if (!noteText || !video?.notebook_id || !videoId) return
    setAddingNote(true)
    await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notebookId: video.notebook_id, videoId, body: noteText }),
    })
    setNoteText('')
    setAddingNote(false)
    mutateNotes()
  }

  const currentChapter = useMemo(() => video?.chapters || [], [video?.chapters])

  return (
    <>
      <Head>
        <title>{video?.title ? `${video.title} · Professor` : 'Video Detail · Professor'}</title>
      </Head>
      <div className="relative flex min-h-screen w-full flex-col bg-surface font-display text-text-main dark:bg-background-dark dark:text-white">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between whitespace-nowrap border-b border-border-strong bg-surface/80 px-6 backdrop-blur-sm dark:border-white/10 dark:bg-background-dark/80">
          <div className="flex items-center gap-3 text-text-main dark:text-white">
            <img src="/logo.svg" alt="Professor logo" className="h-6 w-6" />
            <h2 className="text-lg font-bold leading-tight tracking-[-0.015em] text-text-main dark:text-white">
              Professor
            </h2>
            <div className="flex items-center gap-2 text-sm text-text-muted dark:text-white/60">
              <span className="text-text-muted dark:text-white/30">/</span>
              <button
                className="hover:text-text-main dark:hover:text-white"
                onClick={() => notebook?.id && router.push(`/notebooks/${notebook.id}`)}
                disabled={!notebook?.id}
              >
                {notebook?.title || 'Notebook'}
              </button>
              <span className="text-text-muted dark:text-white/30">/</span>
              <span className="text-text-main dark:text-white">{video?.title || 'Loading...'}</span>
            </div>
          </div>
          <div className="flex flex-1 items-center justify-end gap-6">
            <a
              className="text-sm font-medium leading-normal text-text-main hover:text-text-muted dark:text-white/80 dark:hover:text-white"
              href="/settings"
            >
              Settings
            </a>
            <div className="flex items-center gap-3">
              <ModeToggle />
              <div
                className="size-8 rounded-full border border-border-strong bg-cover bg-center dark:border-white/10"
                data-alt="User avatar with a colorful gradient"
                style={{ backgroundImage: "url('/assets/img-affae12a21cae7aa.jpg')" }}
              />
            </div>
          </div>
        </header>
        <main className="grid w-full grid-cols-12 gap-6 px-6 py-6">
          <aside className="col-span-12 flex flex-col gap-4 rounded-lg border border-border-strong bg-card p-4 shadow-[0_10px_30px_rgba(12,18,38,0.05)] dark:border-white/10 dark:bg-white/5 dark:shadow-none lg:col-span-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-text-main dark:text-white">Videos</h3>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-text-muted dark:bg-white/10 dark:text-white/60">
                <span className="material-symbols-outlined text-lg">list</span>
              </div>
            </div>
            <label className="flex w-full flex-col">
              <div className="flex h-10 w-full flex-1 items-stretch rounded-lg">
                <div className="flex items-center justify-center rounded-l-lg border border-r-0 border-border-strong bg-white pl-3 text-text-muted dark:border-white/20 dark:bg-black/20 dark:text-[#9da6b9]">
                  <span className="material-symbols-outlined !text-[20px]">search</span>
                </div>
                <input
                  className="form-input flex h-full w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg rounded-l-none border border-l-0 border-border-strong bg-white px-4 pl-2 text-sm font-normal text-text-main placeholder:text-text-muted focus:border-accent focus:outline-0 focus:ring-2 focus:ring-accent/40 dark:border-white/20 dark:bg-black/20 dark:text-white/90 dark:placeholder:text-white/40 dark:focus:ring-primary/50"
                  placeholder="Search videos"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </label>
            <div className="-mr-1 flex-1 space-y-2 overflow-y-auto pr-1">
              {filteredList.map((item) => (
                <div
                  key={item.id}
                  onClick={() => router.push(`/videos/${item.id}`)}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border border-transparent p-2 transition hover:border-accent/40 hover:bg-accent/5 dark:hover:border-primary/40 dark:hover:bg-white/5 ${
                    item.id === videoId ? 'border-accent/50 bg-accent/5 dark:border-primary/50 dark:bg-white/5' : ''
                  }`}
                >
                  <div
                    className="h-14 w-24 shrink-0 rounded bg-cover bg-center"
                    data-alt={item.title}
                    style={{ backgroundImage: "url('/assets/img-3a5b20d76c536ed6.jpg')" }}
                  />
                  <div className="flex min-w-0 flex-col">
                    <h4 className="truncate text-sm font-semibold text-text-main dark:text-white">{item.title}</h4>
                    <p className="text-xs text-text-muted dark:text-white/50">{item.duration || ''}</p>
                    <span
                      className={`text-xs capitalize ${
                        item.status === 'ready'
                          ? 'text-green-400'
                          : item.status === 'processing'
                          ? 'text-yellow-300'
                          : 'text-red-400'
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <div className="col-span-12 flex flex-col gap-6 lg:col-span-9">
            <section className="rounded-xl border border-border-strong bg-card p-6 shadow-[0_10px_30px_rgba(12,18,38,0.05)] dark:border-white/10 dark:bg-[#1A1A1B] dark:shadow-md">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-base text-red-400">play_circle</span>
                  <p className="text-sm capitalize text-text-muted dark:text-white/80">{video?.platform || 'video'}</p>
                </div>
                {video?.duration ? (
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-base text-text-muted dark:text-white/60">
                      schedule
                    </span>
                    <p className="text-sm text-text-muted dark:text-white/80">Duration: {video.duration}</p>
                  </div>
                ) : null}
                <span className={`text-sm font-semibold capitalize ${statusColor}`}>{video?.status || ''}</span>
                <div className="flex-grow" />
                {video?.source_url ? (
                  <a
                    href={video.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-10 items-center gap-2 rounded-lg border border-border-strong bg-white px-4 text-sm font-semibold text-text-main transition hover:border-accent/70 hover:text-text-main dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                  >
                    <span className="material-symbols-outlined text-base">open_in_new</span>
                    <span>Open original page</span>
                  </a>
                ) : null}
                <button
                  onClick={handleDownloadSubtitle}
                  disabled={downloading}
                  className="flex h-10 items-center gap-2 rounded-lg border border-border-strong bg-white px-4 text-sm font-semibold text-text-main transition hover:border-accent/70 hover:text-text-main disabled:opacity-60 dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                >
                  <span className="material-symbols-outlined text-base">download</span>
                  <span>{downloading ? 'Exporting...' : 'Export subtitles'}</span>
                </button>
              </div>
              <h1 className="mt-4 text-3xl font-bold leading-tight text-text-main dark:text-white">
                {video?.title || 'Loading...'}
              </h1>
              <p className="mt-2 text-sm text-text-muted dark:text-white/60">
                {video?.status === 'processing' ? 'Transcripts/summary are being generated, please wait...' : ''}
                {video?.status === 'error' ? 'Import failed, please try again.' : ''}
              </p>
            </section>

            <section className="rounded-xl border border-border-strong bg-card p-6 shadow-[0_10px_30px_rgba(12,18,38,0.05)] dark:border-white/10 dark:bg-[#1A1A1B]">
              <div className="flex items-center justify-between border-b border-border-strong pb-4 dark:border-white/10">
                <h2 className="text-lg font-semibold text-text-main dark:text-white">Summary</h2>
                <span className="text-xs text-text-muted dark:text-white/50">Auto-generated</span>
              </div>
              <div className="prose prose-p:leading-relaxed dark:prose-invert max-w-none pt-4 leading-7 text-text-main dark:text-white/80">
                {video?.summary ? (
                  video.summary.split('\n').map((line, idx) => (
                    <p key={idx} className="whitespace-pre-wrap">
                      {line}
                    </p>
                  ))
                ) : (
                  <p className="text-text-muted dark:text-white/60">
                    Waiting for summary. The video is still processing.
                  </p>
                )}
              </div>
            </section>

            <section>
              <h2 className="mb-4 text-lg font-semibold text-text-main dark:text-white">Chapter Outline</h2>
              <div className="flex flex-col gap-2">
                {currentChapter.length === 0 ? (
                  <p className="text-sm text-text-muted dark:text-white/60">No chapter info yet.</p>
                ) : (
                  currentChapter.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex cursor-pointer items-start gap-4 rounded-lg border border-transparent p-4 hover:border-accent/50 hover:bg-accent/5 dark:hover:border-primary/40 dark:hover:bg-white/5"
                    >
                      <span className="pt-1 font-mono text-sm text-primary/90">{item.time || '--:--'}</span>
                      <div className="flex-1">
                        <h3 className="font-semibold text-text-main dark:text-white">{item.title}</h3>
                        <p className="mt-1 text-sm leading-relaxed text-text-muted dark:text-white/60">
                          {item.summary}
                        </p>
                      </div>
                      {video?.source_url ? (
                        <a
                          className="rounded-full p-2 text-text-muted hover:bg-accent/10 hover:text-text-main dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
                          href={`${video.source_url}${
                            parseTimeToSeconds(item.time) ? `?t=${parseTimeToSeconds(item.time)}` : ''
                          }`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <span className="material-symbols-outlined">play_arrow</span>
                        </a>
                      ) : (
                        <span className="rounded-full p-2 text-white/40">▶</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          <aside className="col-span-12 flex flex-col gap-6 lg:col-span-3">
            <div className="rounded-xl border border-border-strong bg-card p-6 shadow-[0_10px_30px_rgba(12,18,38,0.05)] dark:border-white/10 dark:bg-[#1A1A1B]">
              <h3 className="mb-4 text-lg font-semibold text-text-main dark:text-white">Ask about this video</h3>
              <div className="mb-4 flex flex-wrap gap-2">
                <button
                  className="rounded-lg border border-border-strong bg-white px-3 py-1.5 text-xs text-text-main hover:border-accent/70 hover:text-text-main dark:border-white/10 dark:bg-white/10 dark:text-white/80 dark:hover:bg-white/20"
                  onClick={() => setQuestion('Summarize the key takeaways from this video.')}
                >
                  Key takeaways
                </button>
                <button
                  className="rounded-lg border border-border-strong bg-white px-3 py-1.5 text-xs text-text-main hover:border-accent/70 hover:text-text-main dark:border-white/10 dark:bg-white/10 dark:text-white/80 dark:hover:bg-white/20"
                  onClick={() => setQuestion('How are the examples in this video derived?')}
                >
                  Example derivation
                </button>
              </div>
              <div className="mb-4 flex h-48 flex-col space-y-4 overflow-y-auto pr-2 text-sm">
                {question ? (
                  <div className="flex flex-col items-start">
                    <p className="rounded-lg rounded-bl-none border border-border-strong bg-card p-3 dark:border-white/10 dark:bg-white/10">
                      {question}
                    </p>
                  </div>
                ) : null}
                {answer ? (
                  <div className="flex flex-col items-end">
                    <p className="rounded-lg rounded-br-none bg-success/20 p-3 text-text-main dark:bg-primary/30 dark:text-white/90">
                      {answer}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-text-muted dark:text-white/50">
                    Ask a question and the AI will answer based on this video.
                  </p>
                )}
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Ask a question..."
                  className="h-10 w-full rounded-lg border border-border-strong bg-white pl-4 pr-24 text-sm text-text-main placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/40 dark:border-white/20 dark:bg-background-dark dark:text-white dark:placeholder:text-white/50 dark:focus:border-primary dark:focus:ring-primary"
                />
                <button
                  onClick={handleAsk}
                  disabled={asking || !question}
                  className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-md bg-success px-3 py-1 text-xs font-semibold text-white disabled:opacity-60 dark:bg-primary"
                >
                  <span className="material-symbols-outlined text-base">send</span>
                  {asking ? 'Generating' : 'Send'}
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-border-strong bg-card p-6 shadow-[0_10px_30px_rgba(12,18,38,0.05)] dark:border-white/10 dark:bg-[#1A1A1B]">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-text-main dark:text-white">Notes</h3>
              </div>
              <div className="space-y-3">
                {notes.length === 0 ? (
                  <p className="text-sm text-text-muted dark:text-white/60">No notes yet.</p>
                ) : (
                  notes.map((note) => (
                    <div
                      key={note.id}
                      className="rounded-lg border border-border-strong bg-card p-3 hover:border-accent/70 dark:border-transparent dark:bg-white/5 dark:hover:border-white/20"
                    >
                      <p className="whitespace-pre-wrap text-sm font-medium text-text-main dark:text-white/90">
                        {note.body}
                      </p>
                      <p className="mt-1 text-xs text-text-muted dark:text-white/50">
                        {note.created_at ? new Date(note.created_at).toLocaleString() : ''}
                      </p>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-4">
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  className="min-h-[80px] w-full rounded-lg border border-border-strong bg-white p-3 text-sm text-text-main placeholder:text-text-muted focus:border-accent focus:outline-none dark:border-white/20 dark:bg-black/30 dark:text-white dark:placeholder:text-white/40 dark:focus:border-primary"
                  placeholder="Add a new note..."
                />
                <div className="mt-2 flex justify-end">
                  <button
                    onClick={handleAddNote}
                    disabled={addingNote || !noteText}
                    className="flex items-center gap-2 rounded-lg bg-success px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60 dark:bg-primary"
                  >
                    <span className="material-symbols-outlined text-base">add</span>
                    {addingNote ? 'Saving...' : 'Save note'}
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </main>
      </div>
    </>
  )
}

export default VideoDetail
