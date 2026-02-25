// @ts-nocheck
import Head from 'next/head'
import { NextPage } from 'next'
import { useRouter } from 'next/router'
import useSWR from 'swr'
import { useMemo, useState, useRef, useEffect } from 'react'
import { useChat } from '@ai-sdk/react'
import { ModeToggle } from '~/components/mode-toggle'
import Markdown from 'marked-react'

type Video = {
  id: string
  title: string
  duration?: string
  status: string
  summary?: string
  last_error?: string
  transcript?: string
  chapters?: Array<{ title: string; time?: string; summary?: string }>
}

type Notebook = {
  id: string
  title: string
  description?: string
}

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

type ImportBatchSummary = {
  id: string
  total_count: number
  stats: {
    total: number
    ready: number
    failed: number
    processing: number
  }
}

type ImportBatchItem = {
  id: string
  title: string
  status: string
  summary?: string
  updated_at: string
}

type ImportExpandMode = 'current' | 'all'
type InterpretationMode = 'concise' | 'detailed'
type MainTab = 'learn' | 'subtitle' | 'notes'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getVideoStatusMeta(status: string) {
  if (status === 'ready') return { label: 'Ready', color: 'text-green-500', pill: 'bg-green-500/15 text-green-300' }
  if (status === 'error' || status === 'no-subtitle') {
    return { label: 'Failed', color: 'text-red-500', pill: 'bg-red-500/15 text-red-300' }
  }
  if (status === 'queued')
    return { label: 'Queued', color: 'text-yellow-500', pill: 'bg-yellow-500/15 text-yellow-200' }
  if (status === 'processing_subtitle') {
    return { label: 'Subtitle', color: 'text-amber-400', pill: 'bg-amber-500/15 text-amber-200' }
  }
  if (status === 'processing_outline') {
    return { label: 'Outline', color: 'text-blue-400', pill: 'bg-blue-500/15 text-blue-200' }
  }
  if (status === 'processing_explaining') {
    return { label: 'Explaining', color: 'text-violet-300', pill: 'bg-violet-500/15 text-violet-200' }
  }
  if (status.includes('processing')) {
    return { label: 'Processing', color: 'text-yellow-500', pill: 'bg-yellow-500/15 text-yellow-200' }
  }
  return { label: status || 'Unknown', color: 'text-slate-400', pill: 'bg-slate-500/15 text-slate-300' }
}

function getStageDescription(status: string) {
  if (status === 'queued') return 'Waiting in queue'
  if (status === 'processing_subtitle') return 'Downloading subtitles (BBDown)'
  if (status === 'processing_outline') return 'Generating outline'
  if (status === 'processing_explaining') return 'Generating chapter explanations'
  if (status === 'ready') return 'Ready for learning'
  if (status === 'no-subtitle') return 'No subtitle available'
  if (status === 'error') return 'Pipeline failed'
  return status || 'Unknown'
}

function isProcessing(status: string) {
  return status === 'queued' || status.startsWith('processing')
}

const NotebookDetail: NextPage = () => {
  const router = useRouter()
  const { id } = router.query
  const { data: notebook } = useSWR<Notebook>(id ? `/api/notebooks/${id}` : null, fetcher)
  const { data: videos = [], mutate } = useSWR<Video[]>(id ? `/api/notebooks/${id}/videos` : null, fetcher, {
    refreshInterval: 3500,
  })

  const [urlInput, setUrlInput] = useState('')
  const [showImportModal, setShowImportModal] = useState(false)
  const [importError, setImportError] = useState('')
  const [lastBatchId, setLastBatchId] = useState<string>('')
  const [expandMode, setExpandMode] = useState<ImportExpandMode>('current')
  const [importInterpretationMode, setImportInterpretationMode] = useState<InterpretationMode>('concise')

  const [selected, setSelected] = useState<string[]>([])
  const [loadingImport, setLoadingImport] = useState(false)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<MainTab>('learn')
  const [activeVideoId, setActiveVideoId] = useState<string>('')
  const [subtitleSearch, setSubtitleSearch] = useState<string>('')
  const [showAssistantPanel, setShowAssistantPanel] = useState(true)
  const [reimportingVideoId, setReimportingVideoId] = useState<string>('')

  const { data: initialHistory = [] } = useSWR<ChatMessage[]>(
    id && activeVideoId ? `/api/notebooks/${id}/chats?videoId=${encodeURIComponent(activeVideoId)}` : null,
    fetcher,
  )
  const [input, setInput] = useState('')
  const { data: batchSummary } = useSWR<ImportBatchSummary>(
    lastBatchId ? `/api/import-batches/${lastBatchId}` : null,
    fetcher,
    { refreshInterval: 2500 },
  )
  const { data: batchItems = [] } = useSWR<ImportBatchItem[]>(
    lastBatchId ? `/api/import-batches/${lastBatchId}/items` : null,
    fetcher,
    { refreshInterval: 2500 },
  )
  const { data: defaultInterpretationModeData } = useSWR<{ mode: InterpretationMode }>(
    '/api/settings/interpretation-mode',
    fetcher,
  )
  const shouldShowBatchPanel = Boolean(
    batchSummary && (batchSummary.stats.processing > 0 || batchSummary.stats.failed > 0),
  )

  const chatHelpers = useChat({
    api: '/api/chat',
    initialMessages: (initialHistory || []) as any,
    body: {
      notebookId: id,
      videoIds: [],
    },
  } as any) as any

  const { messages, sendMessage, status, setMessages } = chatHelpers
  const isChatLoading = status === 'streaming' || status === 'submitted'
  const historySyncKeyRef = useRef<string>('')

  useEffect(() => {
    const history = initialHistory || []
    const signature = history.map((m: any) => `${m.id}:${m.created_at}`).join('|')
    const syncKey = `${activeVideoId}::${signature}`
    if (historySyncKeyRef.current === syncKey) return
    historySyncKeyRef.current = syncKey
    setMessages(history as any)
  }, [initialHistory, activeVideoId])

  useEffect(() => {
    if (!videos.length) {
      setActiveVideoId('')
      return
    }
    if (!activeVideoId || !videos.find((v) => v.id === activeVideoId)) {
      setActiveVideoId(videos[0].id)
    }
  }, [videos, activeVideoId])

  useEffect(() => {
    const mode = defaultInterpretationModeData?.mode
    if (mode === 'detailed' || mode === 'concise') {
      setImportInterpretationMode(mode)
    }
  }, [defaultInterpretationModeData?.mode])

  const filteredVideos = useMemo(
    () => videos.filter((v) => v.title.toLowerCase().includes(search.toLowerCase())),
    [videos, search],
  )

  const activeVideo = useMemo(() => videos.find((v) => v.id === activeVideoId) || null, [videos, activeVideoId])

  const chatVideoIds = useMemo(() => (activeVideoId ? [activeVideoId] : []), [activeVideoId])
  const transcriptLines = useMemo(
    () =>
      String(activeVideo?.transcript || '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    [activeVideo?.transcript],
  )

  const subtitleMatchedIndexes = useMemo(() => {
    const q = subtitleSearch.trim().toLowerCase()
    if (!q) return []
    const matches: number[] = []
    transcriptLines.forEach((line, idx) => {
      if (line.toLowerCase().includes(q)) matches.push(idx)
    })
    return matches
  }, [subtitleSearch, transcriptLines])

  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, isChatLoading])

  useEffect(() => {
    if (activeTab !== 'subtitle') return
    if (!subtitleMatchedIndexes.length) return
    const firstId = `subtitle-line-${subtitleMatchedIndexes[0]}`
    document.getElementById(firstId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [activeTab, subtitleMatchedIndexes.join(',')])

  const toggleSelect = (vid: string) => {
    setSelected((prev) => (prev.includes(vid) ? prev.filter((i) => i !== vid) : [...prev, vid]))
  }

  const handleBatchDelete = async () => {
    if (selected.length === 0) return
    if (!confirm(`Delete ${selected.length} videos?`)) return
    for (const vid of selected) {
      await fetch(`/api/videos/${vid}`, { method: 'DELETE' })
    }
    setSelected([])
    mutate()
  }

  const handleImport = async () => {
    if (!id || !urlInput.trim()) return
    setImportError('')
    setLoadingImport(true)
    try {
      const res = await fetch('/api/videos/import-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notebookId: id,
          urls: urlInput,
          expandMode,
          interpretationMode: importInterpretationMode,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || res.statusText)
      setLastBatchId(json.batchId)
      setShowImportModal(false)
      setUrlInput('')
      mutate()
    } catch (e: any) {
      setImportError(e?.message || 'Import failed')
    } finally {
      setLoadingImport(false)
    }
  }

  const handleAsk = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const text = input.trim()
    if (!text || !id || !activeVideoId) return
    setInput('')
    await sendMessage(
      { text },
      {
        body: {
          notebookId: id,
          videoIds: chatVideoIds,
        },
      },
    )
  }

  const handleReimportCurrent = async () => {
    if (!activeVideoId) return
    setReimportingVideoId(activeVideoId)
    try {
      const res = await fetch(`/api/videos/${activeVideoId}/reimport`, {
        method: 'POST',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json?.error || `Re-import failed (${res.status})`)
      }
      mutate()
    } catch (e: any) {
      alert(e?.message || 'Re-import failed')
    } finally {
      setReimportingVideoId('')
    }
  }

  const renderProcessingPanel = (video: Video) => {
    const current = video.status
    const steps = [
      { key: 'queued', label: 'Queued' },
      { key: 'processing_subtitle', label: 'Subtitle' },
      { key: 'processing_outline', label: 'Outline' },
      { key: 'processing_explaining', label: 'Chapter Explaining' },
      { key: 'ready', label: 'Done' },
    ]
    const rank: Record<string, number> = {
      queued: 0,
      processing_subtitle: 1,
      processing_outline: 2,
      processing_explaining: 3,
      ready: 4,
      error: 4,
      'no-subtitle': 4,
    }
    const idx = rank[current] ?? 0

    return (
      <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border-strong bg-card p-6 dark:border-white/10 dark:bg-[#131b36]">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-text-main dark:text-white">{video.title}</h2>
            <p className="mt-1 text-sm text-text-muted dark:text-white/60">{getStageDescription(video.status)}</p>
          </div>
          <span className="rounded-full bg-black/10 px-3 py-1 text-xs text-text-muted dark:bg-white/10 dark:text-white/80">
            Processing
          </span>
        </div>

        <div className="mt-6 grid grid-cols-5 gap-3">
          {steps.map((step, i) => {
            const done = i < idx
            const active = i === idx && isProcessing(current)
            return (
              <div key={step.key} className="flex items-center gap-2">
                <div
                  className={`h-2 w-2 rounded-full ${
                    done ? 'bg-green-400' : active ? 'animate-pulse bg-yellow-300' : 'bg-white/20'
                  }`}
                />
                <span
                  className={`text-xs ${
                    done || active ? 'text-text-main dark:text-white/90' : 'text-text-muted dark:text-white/40'
                  }`}
                >
                  {step.label}
                </span>
              </div>
            )
          })}
        </div>

        <div className="mt-8 space-y-3">
          <div className="h-5 w-2/3 animate-pulse rounded bg-black/10 dark:bg-white/10" />
          <div className="h-4 w-full animate-pulse rounded bg-black/10 dark:bg-white/10" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-black/10 dark:bg-white/10" />
          <div className="h-4 w-4/6 animate-pulse rounded bg-black/10 dark:bg-white/10" />
        </div>

        <div className="mt-auto rounded-lg border border-border-strong bg-black/5 p-4 text-sm text-text-muted dark:border-white/10 dark:bg-white/5 dark:text-white/70">
          You can continue importing other URLs, taking notes, or switching to another completed video.
        </div>
      </div>
    )
  }

  const renderLearnPanel = () => {
    if (!activeVideo) {
      return (
        <div className="flex h-full items-center justify-center rounded-xl border border-border-strong bg-card text-text-muted dark:border-white/10 dark:bg-[#131b36] dark:text-white/60">
          Import videos to start learning.
        </div>
      )
    }

    if (activeVideo.status === 'error' || activeVideo.status === 'no-subtitle') {
      return (
        <div className="flex h-full flex-col rounded-xl border border-red-500/30 bg-card p-6 dark:bg-[#131b36]">
          <h2 className="text-2xl font-semibold text-text-main dark:text-white">{activeVideo.title}</h2>
          <p className="mt-3 text-red-300">{activeVideo.summary || 'Processing failed.'}</p>
          <button
            onClick={handleReimportCurrent}
            disabled={reimportingVideoId === activeVideo.id}
            className="mt-6 w-fit rounded-lg bg-red-500/20 px-4 py-2 text-sm text-red-200 hover:bg-red-500/30 disabled:opacity-60"
          >
            {reimportingVideoId === activeVideo.id ? 'Re-importing...' : 'Re-import Video'}
          </button>
        </div>
      )
    }

    if (isProcessing(activeVideo.status)) {
      return renderProcessingPanel(activeVideo)
    }

    const chapters = activeVideo.chapters || []
    return (
      <div className="grid h-full grid-cols-12 gap-4 overflow-hidden">
        <div className="col-span-12 overflow-y-auto rounded-xl border border-border-strong bg-card p-6 dark:border-white/10 dark:bg-[#131b36] lg:col-span-10">
          <div className="mb-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-2xl font-semibold text-text-main dark:text-white">{activeVideo.title}</h2>
              <button
                onClick={handleReimportCurrent}
                disabled={reimportingVideoId === activeVideo.id || isProcessing(activeVideo.status)}
                className="dark:border-white/15 shrink-0 rounded-md border border-border-strong bg-black/5 px-3 py-1.5 text-xs text-text-main hover:border-blue-400/50 hover:bg-blue-500/10 disabled:opacity-60 dark:bg-white/5 dark:text-white/90"
              >
                {reimportingVideoId === activeVideo.id ? 'Re-importing...' : 'Re-import'}
              </button>
            </div>
            <div className="markdown-body mt-3 text-base leading-8 text-slate-800 dark:text-slate-100">
              <Markdown>{activeVideo.summary || 'No summary yet.'}</Markdown>
            </div>
          </div>

          <div className="space-y-4">
            {chapters.length === 0 ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-100">
                <p className="font-semibold">No chapters available yet.</p>
                <p className="mt-1 text-xs opacity-90">
                  {activeVideo.last_error
                    ? `Reason: ${activeVideo.last_error}`
                    : 'Reason is not available yet. The model may still be processing or returned an invalid outline format.'}
                </p>
                <p className="mt-2 text-xs opacity-90">
                  You can click <span className="font-semibold">Re-import</span> above to rerun subtitle download and
                  interpretation.
                </p>
              </div>
            ) : (
              chapters.map((chapter, idx) => (
                <section
                  key={idx}
                  id={`chapter-${idx}`}
                  className="dark:border-white/15 rounded-lg border border-slate-300/80 bg-white p-5 shadow-sm dark:bg-[#0f1a35]"
                >
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {idx + 1}. {chapter.title}
                    {chapter.time ? (
                      <span className="ml-2 text-xs text-slate-500 dark:text-slate-300/70">{chapter.time}</span>
                    ) : null}
                  </h3>
                  <div className="markdown-body mt-3 text-base leading-8 text-slate-800 dark:text-slate-100">
                    <Markdown>{chapter.summary || ''}</Markdown>
                  </div>
                </section>
              ))
            )}
          </div>
        </div>

        <aside className="col-span-12 flex flex-col gap-3 overflow-y-auto rounded-xl border border-border-strong bg-card p-4 dark:border-white/10 dark:bg-[#131b36] lg:col-span-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">Outline</h3>
          {chapters.length === 0 ? (
            <p className="text-xs text-slate-600 dark:text-slate-300/80">No outline yet.</p>
          ) : (
            chapters.map((chapter, idx) => (
              <button
                key={idx}
                onClick={() =>
                  document.getElementById(`chapter-${idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
                className="dark:border-white/15 rounded-md border border-slate-300/80 bg-white px-3 py-2 text-left text-sm text-slate-800 hover:border-blue-400/50 hover:bg-blue-500/10 dark:bg-white/10 dark:text-slate-100"
              >
                <div className="text-xs text-slate-500 dark:text-slate-300/75">Chapter {idx + 1}</div>
                <div className="line-clamp-2 mt-1 text-slate-900 dark:text-slate-100">{chapter.title}</div>
              </button>
            ))
          )}
        </aside>
      </div>
    )
  }

  const highlightSubtitleLine = (line: string, query: string) => {
    const q = query.trim()
    if (!q) return line
    const regex = new RegExp(`(${escapeRegExp(q)})`, 'ig')
    const parts = line.split(regex)
    return parts.map((part, idx) =>
      part.toLowerCase() === q.toLowerCase() ? (
        <mark key={idx} className="rounded bg-yellow-300/80 px-0.5 text-black">
          {part}
        </mark>
      ) : (
        <span key={idx}>{part}</span>
      ),
    )
  }

  const renderSubtitlePanel = () => {
    if (!activeVideo) {
      return (
        <div className="flex h-full items-center justify-center rounded-xl border border-border-strong bg-card text-text-muted dark:border-white/10 dark:bg-[#131b36] dark:text-white/60">
          Select a video to view subtitles.
        </div>
      )
    }

    if (!activeVideo.transcript) {
      return (
        <div className="flex h-full flex-col rounded-xl border border-border-strong bg-card p-6 dark:border-white/10 dark:bg-[#131b36]">
          <h2 className="text-xl font-semibold text-text-main dark:text-white">{activeVideo.title}</h2>
          <p className="mt-2 text-sm text-text-muted dark:text-white/60">
            Source subtitles are not available yet. You can re-import this video after subtitle download finishes.
          </p>
        </div>
      )
    }

    const q = subtitleSearch.trim()
    const matchCount = subtitleMatchedIndexes.length

    return (
      <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border-strong bg-card p-4 dark:border-white/10 dark:bg-[#131b36]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="truncate text-lg font-semibold text-text-main dark:text-white">{activeVideo.title}</h2>
          <div className="text-xs text-text-muted dark:text-white/60">
            Lines: {transcriptLines.length}
            {q ? ` · Matches: ${matchCount}` : ''}
          </div>
        </div>

        <div className="mb-3 flex h-10 w-full items-center rounded-lg border border-border-strong bg-white px-3 dark:border-white/20 dark:bg-black/20">
          <span className="material-symbols-outlined mr-2 !text-[20px] text-text-muted dark:text-[#9da6b9]">
            search
          </span>
          <input
            className="flex-1 bg-transparent text-sm text-text-main placeholder:text-text-muted focus:outline-none dark:text-white dark:placeholder:text-white/40"
            placeholder="Search subtitle text"
            value={subtitleSearch}
            onChange={(e) => setSubtitleSearch(e.target.value)}
          />
        </div>

        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto rounded-lg border border-border-strong bg-black/5 p-3 dark:border-white/10 dark:bg-white/5">
          {transcriptLines.map((line, idx) => {
            const matched = q && line.toLowerCase().includes(q.toLowerCase())
            return (
              <div
                key={idx}
                id={`subtitle-line-${idx}`}
                className={`grid grid-cols-[56px_1fr] gap-3 rounded px-2 py-1 text-sm ${
                  matched ? 'bg-yellow-400/15' : ''
                }`}
              >
                <span className="text-xs text-text-muted dark:text-white/50">#{idx + 1}</span>
                <div className="whitespace-pre-wrap break-words text-text-main dark:text-white/90">
                  {highlightSubtitleLine(line, subtitleSearch)}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>{notebook?.title || 'Notebook'} · Professor</title>
      </Head>
      <div className="flex h-screen w-full flex-col overflow-hidden bg-surface font-display text-text-main dark:bg-background-dark dark:text-[#E0E0E0]">
        <header className="flex shrink-0 items-center justify-between whitespace-nowrap border-b border-border-strong px-5 py-2 dark:border-white/10">
          <div className="flex items-center gap-4 text-text-main dark:text-white">
            <img src="/logo.svg" alt="Professor logo" className="h-5 w-5" />
            <h2 className="text-base font-bold text-text-main dark:text-white">Professor</h2>
            <div className="flex items-center gap-2">
              <span className="text-base font-medium text-text-muted dark:text-white/30">/</span>
              <a
                className="text-sm font-medium text-text-muted hover:text-text-main dark:text-white/60 dark:hover:text-white"
                href="/"
              >
                Notebooks
              </a>
              <span className="text-base font-medium text-text-muted dark:text-white/30">/</span>
              <span className="text-sm font-medium text-text-main dark:text-white">{notebook?.title || ''}</span>
            </div>
          </div>
          <div className="flex flex-1 justify-end gap-6">
            <a
              className="text-sm font-medium text-text-main hover:text-text-muted dark:text-white/80 dark:hover:text-white"
              href="/settings"
            >
              Settings
            </a>
            <div className="flex items-center gap-3">
              <ModeToggle />
              <div
                className="size-8 shrink-0 rounded-full bg-cover bg-center"
                style={{ backgroundImage: "url('/assets/img-1724d1e1231a1a90.jpg')" }}
              />
            </div>
          </div>
        </header>

        <main className="grid flex-1 grid-cols-12 gap-4 overflow-hidden p-4">
          <div className="col-span-12 flex flex-col gap-4 overflow-hidden rounded-lg border border-border-strong bg-card p-4 shadow-[0_10px_30px_rgba(12,18,38,0.05)] dark:border-transparent dark:bg-white/5 dark:shadow-none lg:col-span-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase text-text-muted dark:text-white/40">Videos</h3>
              <div className="flex gap-2">
                {selected.length > 0 && (
                  <button
                    onClick={handleBatchDelete}
                    className="rounded bg-red-100 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400"
                  >
                    Delete ({selected.length})
                  </button>
                )}
                <button
                  onClick={() => {
                    setShowImportModal(true)
                    setImportError('')
                    setUrlInput('')
                    setExpandMode('current')
                    setImportInterpretationMode(
                      defaultInterpretationModeData?.mode === 'detailed' ? 'detailed' : 'concise',
                    )
                  }}
                  className="rounded bg-accent px-2 py-1 text-xs font-medium text-text-main hover:bg-accent/90 dark:bg-primary dark:text-white"
                >
                  Import
                </button>
              </div>
            </div>

            <div className="shrink-0">
              <div className="flex h-10 w-full items-center rounded-lg border border-border-strong bg-white px-3 dark:border-white/20 dark:bg-black/20">
                <span className="material-symbols-outlined mr-2 !text-[20px] text-text-muted dark:text-[#9da6b9]">
                  search
                </span>
                <input
                  className="flex-1 bg-transparent text-sm text-text-main placeholder:text-text-muted focus:outline-none dark:text-white dark:placeholder:text-white/40"
                  placeholder="Search videos"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="-mr-1 flex-1 space-y-2 overflow-y-auto pr-1">
              {filteredVideos.map((video) => {
                const active = video.id === activeVideoId
                const meta = getVideoStatusMeta(video.status)
                const processing = isProcessing(video.status)
                return (
                  <button
                    key={video.id}
                    onClick={() => setActiveVideoId(video.id)}
                    className={`w-full rounded-md border p-3 text-left transition ${
                      active
                        ? 'border-blue-400/50 bg-blue-500/10'
                        : 'border-transparent bg-transparent hover:border-border-strong hover:bg-black/5 dark:hover:border-white/20 dark:hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={selected.includes(video.id)}
                        onChange={(e) => {
                          e.stopPropagation()
                          toggleSelect(video.id)
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-0.5 h-4 w-4 rounded"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p
                            className="truncate text-sm font-medium text-text-main dark:text-white"
                            title={video.title}
                          >
                            {video.title}
                          </p>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${meta.pill}`}>
                            {meta.label}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-text-muted dark:text-white/60">
                          {processing ? (
                            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-yellow-300" />
                          ) : null}
                          <span>{getStageDescription(video.status)}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })}

              {filteredVideos.length === 0 && (
                <div className="py-6 text-center text-sm text-text-muted dark:text-white/40">No videos.</div>
              )}
            </div>
          </div>

          <div className="col-span-12 flex h-full flex-col overflow-hidden lg:col-span-9">
            <div className="mb-3 flex shrink-0 items-center justify-between">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-text-main dark:text-white">{notebook?.title || 'Notebook'}</h1>
                <button
                  onClick={() => setShowAssistantPanel((v) => !v)}
                  className="dark:border-white/15 rounded-full border border-border-strong bg-black/5 px-3 py-1.5 text-xs text-text-muted hover:text-text-main dark:bg-white/5 dark:text-white/70 dark:hover:text-white"
                >
                  {showAssistantPanel ? 'Hide AI Panel' : 'Show AI Panel'}
                </button>
                <span className="dark:text-white/55 text-xs text-text-muted">看不懂或想深入，可继续提问</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <button
                  onClick={() => setActiveTab('learn')}
                  className={`rounded-full px-3 py-1.5 ${
                    activeTab === 'learn'
                      ? 'bg-blue-500/20 text-blue-700 dark:text-blue-200'
                      : 'bg-black/5 text-text-muted hover:text-text-main dark:bg-white/5 dark:text-white/60 dark:hover:text-white'
                  }`}
                >
                  Learning
                </button>
                <button
                  onClick={() => setActiveTab('notes')}
                  className={`rounded-full px-3 py-1.5 ${
                    activeTab === 'notes'
                      ? 'bg-blue-500/20 text-blue-700 dark:text-blue-200'
                      : 'bg-black/5 text-text-muted hover:text-text-main dark:bg-white/5 dark:text-white/60 dark:hover:text-white'
                  }`}
                >
                  Notes
                </button>
                <button
                  onClick={() => setActiveTab('subtitle')}
                  className={`rounded-full px-3 py-1.5 ${
                    activeTab === 'subtitle'
                      ? 'bg-blue-500/20 text-blue-700 dark:text-blue-200'
                      : 'bg-black/5 text-text-muted hover:text-text-main dark:bg-white/5 dark:text-white/60 dark:hover:text-white'
                  }`}
                >
                  Subtitle
                </button>
              </div>
            </div>

            {shouldShowBatchPanel && (
              <div className="mb-4 shrink-0 rounded-xl border border-border-strong bg-card px-4 py-3 text-sm text-text-main dark:border-white/10 dark:bg-[#111a33] dark:text-white/90">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">Background Import Task</p>
                    <p className="text-xs text-text-muted dark:text-white/60">Batch #{batchSummary.id.slice(0, 8)}</p>
                  </div>
                  <span className="text-xs text-text-muted dark:text-white/60">Auto refreshing</span>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-2 text-xs">
                  <div>Total: {batchSummary.stats.total}</div>
                  <div>Ready: {batchSummary.stats.ready}</div>
                  <div>Processing: {batchSummary.stats.processing}</div>
                  <div>Failed: {batchSummary.stats.failed}</div>
                </div>
                <div className="mt-3 max-h-24 space-y-1 overflow-y-auto text-xs">
                  {batchItems.slice(0, 8).map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded bg-black/5 px-2 py-1 dark:bg-white/5"
                    >
                      <span className="truncate pr-3">{item.title}</span>
                      <span className={getVideoStatusMeta(item.status).color}>{item.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'learn' ? (
              <div className="min-h-0 flex-1 overflow-hidden">{renderLearnPanel()}</div>
            ) : activeTab === 'subtitle' ? (
              <div className="min-h-0 flex-1 overflow-hidden">{renderSubtitlePanel()}</div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border-strong bg-card p-6 text-text-main dark:border-white/10 dark:bg-[#131b36] dark:text-white/80">
                <h2 className="text-xl font-semibold text-text-main dark:text-white">Notebook Notes</h2>
                <p className="mt-2 text-sm text-text-muted dark:text-white/60">
                  Notes workspace is kept as-is. You can continue adding and organizing notes here while videos process
                  in background.
                </p>
              </div>
            )}

            {showAssistantPanel ? (
              <div className="mt-4 shrink-0 rounded-xl border border-border-strong bg-card p-4 dark:border-white/10 dark:bg-[#131b36]">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-text-main dark:text-white">Ask Follow-up Questions</p>
                  <p className="max-w-[60%] truncate text-xs text-text-muted dark:text-white/60">
                    Current video: {activeVideo?.title || 'None selected'}
                  </p>
                </div>

                <div className="max-h-48 space-y-3 overflow-y-auto pr-1">
                  {messages.length > 0 ? (
                    messages.map((msg: any) => {
                      const text = (
                        msg.parts
                          ?.filter((p: any) => p.type === 'text')
                          .map((p: any) => p.text)
                          .join('') ||
                        msg.content ||
                        ''
                      ).trim()

                      return (
                        <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          {msg.role === 'user' ? (
                            <div className="max-w-[85%] whitespace-pre-wrap rounded-xl bg-blue-600 px-3 py-2 text-sm text-white">
                              {text}
                            </div>
                          ) : (
                            <div className="markdown-body max-w-[85%] rounded-xl bg-black/5 px-3 py-2 text-sm text-slate-800 dark:bg-white/5 dark:text-slate-100">
                              <Markdown>{text}</Markdown>
                            </div>
                          )}
                        </div>
                      )
                    })
                  ) : (
                    <p className="text-xs text-text-muted dark:text-white/50">
                      Ask anything you do not understand from the interpretation.
                    </p>
                  )}
                  {isChatLoading ? <p className="text-xs text-text-muted dark:text-white/50">Thinking...</p> : null}
                  <div ref={bottomRef} />
                </div>

                <form onSubmit={handleAsk} className="mt-3 flex items-center gap-2">
                  <textarea
                    rows={1}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    className="dark:border-white/15 min-h-[40px] flex-1 resize-none rounded-md border border-border-strong bg-white px-3 py-2 text-sm text-text-main placeholder:text-text-muted focus:outline-none dark:bg-black/20 dark:text-white dark:placeholder:text-white/40"
                    placeholder="Ask a question about the current interpretation..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleAsk()
                      }
                    }}
                  />
                  <button
                    type="submit"
                    disabled={isChatLoading || !input.trim()}
                    className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                  >
                    Send
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        </main>

        {showImportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-xl border border-border-strong bg-card p-6 text-text-main shadow-2xl dark:border-white/10 dark:bg-[#1a1a1b] dark:text-white">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Import videos</h3>
                <button
                  className="text-text-muted hover:text-text-main dark:text-white/60 dark:hover:text-white"
                  onClick={() => setShowImportModal(false)}
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="mt-4 space-y-4">
                <textarea
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder={`Paste one or multiple Bilibili URLs.\nSupport separators: newline, space, comma, semicolon.`}
                  rows={8}
                  className="w-full rounded-md border border-border-strong bg-white px-3 py-2 text-sm text-text-main placeholder:text-text-muted focus:border-accent focus:outline-none dark:border-white/20 dark:bg-black/20 dark:text-white dark:placeholder:text-white/50"
                />
                <div className="dark:border-white/15 rounded-md border border-border-strong bg-white/60 px-3 py-2 text-sm dark:bg-black/20">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted dark:text-white/60">
                    Import scope
                  </p>
                  <div className="flex flex-col gap-2">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        name="expandMode"
                        value="current"
                        checked={expandMode === 'current'}
                        onChange={() => setExpandMode('current')}
                      />
                      <span>Only current video/page (recommended)</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        name="expandMode"
                        value="all"
                        checked={expandMode === 'all'}
                        onChange={() => setExpandMode('all')}
                      />
                      <span>Expand all pages/episodes from each URL</span>
                    </label>
                  </div>
                </div>
                <div className="dark:border-white/15 rounded-md border border-border-strong bg-white/60 px-3 py-2 text-sm dark:bg-black/20">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted dark:text-white/60">
                    Interpretation mode
                  </p>
                  <div className="flex flex-col gap-2">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        name="interpretationMode"
                        value="concise"
                        checked={importInterpretationMode === 'concise'}
                        onChange={() => setImportInterpretationMode('concise')}
                      />
                      <span>Concise (faster, compressed)</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        name="interpretationMode"
                        value="detailed"
                        checked={importInterpretationMode === 'detailed'}
                        onChange={() => setImportInterpretationMode('detailed')}
                      />
                      <span>Detailed (preserve more details)</span>
                    </label>
                  </div>
                </div>
                {importError && <p className="text-sm text-red-500 dark:text-red-400">{importError}</p>}
                <p className="text-xs text-text-muted dark:text-white/50">
                  Import runs in background. You can continue learning and asking questions.
                </p>

                <div className="mt-4 flex justify-end gap-2">
                  <button
                    onClick={() => setShowImportModal(false)}
                    className="rounded-lg border border-border-strong px-3 py-2 text-sm text-text-main hover:border-accent/70 dark:border-white/20 dark:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={loadingImport || !urlInput.trim()}
                    className="rounded-lg bg-success px-4 py-2 text-sm font-semibold text-white hover:bg-success/90 disabled:opacity-50 dark:bg-primary"
                  >
                    {loadingImport ? 'Submitting...' : 'Start background import'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

export default NotebookDetail
