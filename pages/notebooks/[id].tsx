// @ts-nocheck
import Head from 'next/head'
import { NextPage } from 'next'
import { useRouter } from 'next/router'
import useSWR from 'swr'
import { useMemo, useState, useRef, useEffect } from 'react'
import { useChat } from '@ai-sdk/react'
import { ModeToggle } from '~/components/mode-toggle'
import LanguageSwitcher from '~/components/LanguageSwitcher'
import { useAppLanguage } from '~/hooks/useAppLanguage'
import Markdown from 'marked-react'

type Video = {
  id: string
  title: string
  duration?: string
  status: string
  platform?: string
  source_type?: 'bilibili' | 'youtube' | 'text' | 'file'
  source_mime?: string
  source_url?: string
  generation_profile?: 'full_interpretation' | 'summary_only' | 'import_only'
  interpretation_mode?: InterpretationMode
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
type InterpretationMode = 'concise' | 'detailed' | 'none'
type MainTab = 'learn' | 'subtitle' | 'notes'
type ImportTab = 'url' | 'text' | 'files'
type ImportLocalFile = {
  id: string
  name: string
  mimeType: string
  size: number
  contentBase64: string
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function parseResponseJsonSafe(res: Response) {
  const raw = await res.text()
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return { error: raw.slice(0, 500) }
  }
}

function getVideoStatusMeta(status: string, language: 'zh-CN' | 'en-US') {
  const zh = language === 'zh-CN'
  if (status === 'ready')
    return { label: zh ? '完成' : 'Done', color: 'text-green-500', pill: 'bg-green-500/15 text-green-300' }
  if (status === 'error' || status === 'no-subtitle') {
    return { label: zh ? '失败' : 'Failed', color: 'text-red-500', pill: 'bg-red-500/15 text-red-300' }
  }
  if (status === 'queued')
    return { label: zh ? '排队中' : 'Queued', color: 'text-yellow-500', pill: 'bg-yellow-500/15 text-yellow-200' }
  if (status === 'processing_subtitle') {
    return { label: zh ? '字幕' : 'Subtitle', color: 'text-amber-400', pill: 'bg-amber-500/15 text-amber-200' }
  }
  if (status === 'processing_outline') {
    return { label: zh ? '大纲' : 'Outline', color: 'text-blue-400', pill: 'bg-blue-500/15 text-blue-200' }
  }
  if (status === 'processing_summary') {
    return { label: zh ? '总结' : 'Summary', color: 'text-sky-400', pill: 'bg-sky-500/15 text-sky-200' }
  }
  if (status === 'processing_explaining') {
    return { label: zh ? '解读中' : 'Explaining', color: 'text-violet-300', pill: 'bg-violet-500/15 text-violet-200' }
  }
  if (status.includes('processing')) {
    return { label: zh ? '处理中' : 'Processing', color: 'text-yellow-500', pill: 'bg-yellow-500/15 text-yellow-200' }
  }
  return { label: status || (zh ? '未知' : 'Unknown'), color: 'text-slate-400', pill: 'bg-slate-500/15 text-slate-300' }
}

function getStageDescription(status: string, language: 'zh-CN' | 'en-US') {
  const zh = language === 'zh-CN'
  if (status === 'queued') return zh ? '排队等待中' : 'Waiting in queue'
  if (status === 'processing_extract') return zh ? '提取文本中' : 'Extracting text'
  if (status === 'processing_summary') return zh ? '生成总结中' : 'Generating summary'
  if (status === 'processing_subtitle') return zh ? '下载字幕中（BBDown）' : 'Downloading subtitles (BBDown)'
  if (status === 'processing_outline') return zh ? '生成大纲中' : 'Generating outline'
  if (status === 'processing_explaining') return zh ? '生成章节解读中' : 'Generating chapter interpretation'
  if (status === 'ready') return zh ? '可开始学习' : 'Ready to learn'
  if (status === 'no-subtitle') return zh ? '无可用字幕' : 'No subtitles available'
  if (status === 'error') return zh ? '处理流程失败' : 'Pipeline failed'
  return status || (zh ? '未知' : 'Unknown')
}

function isProcessing(status: string) {
  return status === 'queued' || status.startsWith('processing')
}

function getSourceTypeMeta(video: Video) {
  const kind =
    video.source_type || (video.platform === 'text' || video.platform === 'file' ? video.platform : 'bilibili')
  if (kind === 'text') {
    return {
      label: 'Text',
      icon: 'notes',
      badge:
        'border border-blue-300 bg-blue-100 text-blue-900 dark:border-blue-500/20 dark:bg-blue-500/15 dark:text-blue-200',
    }
  }
  if (kind === 'file') {
    return {
      label: 'File',
      icon: 'description',
      badge:
        'border border-slate-300 bg-slate-200 text-slate-900 dark:border-slate-500/20 dark:bg-slate-500/20 dark:text-slate-200',
    }
  }
  if (kind === 'youtube' || video.platform === 'youtube') {
    return {
      label: 'YT',
      icon: 'play_circle',
      badge:
        'border border-rose-300 bg-rose-100 text-rose-900 dark:border-rose-500/20 dark:bg-rose-500/20 dark:text-rose-200',
    }
  }
  return {
    label: 'Bili',
    icon: 'smart_display',
    badge: 'border border-red-300 bg-red-100 text-red-900 dark:border-red-500/20 dark:bg-red-500/20 dark:text-red-200',
  }
}

function getInterpretationModeMeta(mode?: InterpretationMode) {
  if (mode === 'detailed')
    return {
      label: 'Detailed',
      badge:
        'border border-indigo-300 bg-indigo-100 text-indigo-900 dark:border-indigo-300/50 dark:bg-indigo-500/30 dark:text-indigo-50',
    }
  if (mode === 'none')
    return {
      label: 'Import only',
      badge:
        'border border-zinc-300 bg-zinc-100 text-zinc-900 dark:border-zinc-300/45 dark:bg-zinc-500/30 dark:text-zinc-50',
    }
  return {
    label: 'Concise',
    badge: 'border border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-300/50 dark:bg-sky-500/30 dark:text-sky-50',
  }
}

const NotebookDetail: NextPage = () => {
  const router = useRouter()
  const { id } = router.query
  const { language, setLanguage } = useAppLanguage()
  const isZh = language === 'zh-CN'
  const tx = (en: string, zh: string) => (isZh ? zh : en)
  const { data: notebook } = useSWR<Notebook>(id ? `/api/notebooks/${id}` : null, fetcher)
  const { data: videos = [], mutate } = useSWR<Video[]>(
    id ? `/api/notebooks/${id}/videos?lang=${encodeURIComponent(language)}` : null,
    fetcher,
    {
      refreshInterval: 3500,
    },
  )

  const [urlInput, setUrlInput] = useState('')
  const [textTitleInput, setTextTitleInput] = useState('')
  const [textBodyInput, setTextBodyInput] = useState('')
  const [importFiles, setImportFiles] = useState<ImportLocalFile[]>([])
  const [importTab, setImportTab] = useState<ImportTab>('url')
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
  const [copiedTranscript, setCopiedTranscript] = useState(false)
  const [showAssistantPanel, setShowAssistantPanel] = useState(true)
  const [assistantMaximized, setAssistantMaximized] = useState(false)
  const [reimportingVideoId, setReimportingVideoId] = useState<string>('')

  const { data: initialHistory = [] } = useSWR<ChatMessage[]>(
    id && activeVideoId ? `/api/notebooks/${id}/chats?videoId=${encodeURIComponent(activeVideoId)}` : null,
    fetcher,
  )
  const [input, setInput] = useState('')
  const [isChatInputComposing, setIsChatInputComposing] = useState(false)
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
      contentLanguage: language,
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
    if (mode === 'detailed' || mode === 'concise' || mode === 'none') {
      setImportInterpretationMode(mode)
    }
  }, [defaultInterpretationModeData?.mode])

  useEffect(() => {
    if (importTab === 'text' || importTab === 'files') {
      setImportInterpretationMode('none')
      return
    }
    const mode = defaultInterpretationModeData?.mode
    setImportInterpretationMode(mode === 'detailed' ? 'detailed' : mode === 'none' ? 'none' : 'concise')
  }, [importTab, defaultInterpretationModeData?.mode])

  const filteredVideos = useMemo(
    () => videos.filter((v) => v.title.toLowerCase().includes(search.toLowerCase())),
    [videos, search],
  )

  const activeVideo = useMemo(() => videos.find((v) => v.id === activeVideoId) || null, [videos, activeVideoId])

  const chatVideoIds = useMemo(() => (activeVideoId ? [activeVideoId] : []), [activeVideoId])
  const transcriptLines = useMemo(
    () =>
      String(activeVideo?.transcript || '')
        .replace(/\r/g, '')
        .split('\n')
        .map((line) => line.replace(/\t/g, '  ')),
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
    if (!confirm(tx(`Delete ${selected.length} selected resources?`, `确认删除 ${selected.length} 条资源吗？`))) return
    for (const vid of selected) {
      await fetch(`/api/videos/${vid}`, { method: 'DELETE' })
    }
    setSelected([])
    mutate()
  }

  const handleImport = async () => {
    if (!id) return
    setImportError('')
    setLoadingImport(true)
    try {
      let res: Response
      if (importTab === 'url') {
        if (!urlInput.trim()) throw new Error(tx('Please paste at least one URL.', '请至少粘贴一个 URL。'))
        res = await fetch('/api/videos/import-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            notebookId: id,
            urls: urlInput,
            expandMode,
            interpretationMode: importInterpretationMode,
            contentLanguage: language,
          }),
        })
      } else if (importTab === 'text') {
        if (!textBodyInput.trim()) throw new Error(tx('Please paste text content first.', '请先粘贴文本内容。'))
        res = await fetch('/api/sources/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            notebookId: id,
            interpretationMode: importInterpretationMode,
            contentLanguage: language,
            items: [{ type: 'text', title: textTitleInput, text: textBodyInput }],
          }),
        })
      } else {
        if (!importFiles.length) throw new Error(tx('Please select at least one file.', '请至少选择一个文件。'))
        res = await fetch('/api/sources/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            notebookId: id,
            interpretationMode: importInterpretationMode,
            contentLanguage: language,
            items: importFiles.map((f) => ({
              type: 'file',
              name: f.name,
              mimeType: f.mimeType,
              contentBase64: f.contentBase64,
            })),
          }),
        })
      }
      const json = await parseResponseJsonSafe(res)
      if (!res.ok) {
        const itemErrors = Array.isArray((json as any)?.errors)
          ? (json as any).errors
              .map((e: any) => `#${Number(e?.index) + 1}: ${e?.reason || 'Unknown error'}`)
              .join(' | ')
          : ''
        const previewErrors = Array.isArray((json as any)?.previewErrors)
          ? (json as any).previewErrors
              .map((e: any) => `${e?.url || 'unknown'}: ${e?.reason || 'Unknown error'}`)
              .join(' | ')
          : ''
        throw new Error(
          `${(json as any)?.error || 'Request failed'}${itemErrors ? ` (${itemErrors})` : ''}${
            previewErrors ? ` (${previewErrors})` : ''
          }`.trim(),
        )
      }
      setLastBatchId(json.batchId)
      setShowImportModal(false)
      setUrlInput('')
      setTextTitleInput('')
      setTextBodyInput('')
      setImportFiles([])
      setImportTab('url')
      mutate()
    } catch (e: any) {
      setImportError(e?.message || tx('Import failed', '导入失败'))
    } finally {
      setLoadingImport(false)
    }
  }

  const handlePickFiles = async (fileList: FileList | null) => {
    const files = Array.from(fileList || [])
    if (!files.length) return
    const MAX_SINGLE_FILE_SIZE = 24 * 1024 * 1024
    const oversized = files.find((f) => f.size > MAX_SINGLE_FILE_SIZE)
    if (oversized) {
      setImportError(
        tx(
          `File too large: ${oversized.name}. Current per-file limit is 24MB.`,
          `文件过大：${oversized.name}。当前单文件限制为 24MB。`,
        ),
      )
      return
    }
    const mapped = await Promise.all(
      files.map(
        (file) =>
          new Promise<ImportLocalFile>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => {
              const result = String(reader.result || '')
              const payload = result.includes(',') ? result.split(',')[1] : result
              resolve({
                id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
                name: file.name,
                mimeType: file.type || 'application/octet-stream',
                size: file.size,
                contentBase64: payload,
              })
            }
            reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`))
            reader.readAsDataURL(file)
          }),
      ),
    )
    setImportFiles((prev) => [...prev, ...mapped])
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
          contentLanguage: language,
        },
      },
    )
  }

  const handleReimportCurrent = async (mode: 'concise' | 'detailed') => {
    if (!activeVideoId) return
    setReimportingVideoId(activeVideoId)
    try {
      const res = await fetch(`/api/videos/${activeVideoId}/reimport`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interpretationMode: mode, contentLanguage: language }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json?.error || tx(`Reimport failed (${res.status})`, `重新导入失败（${res.status}）`))
      }
      mutate()
    } catch (e: any) {
      alert(e?.message || tx('Reimport failed', '重新导入失败'))
    } finally {
      setReimportingVideoId('')
    }
  }

  const renderReimportMenu = (video: Video) => {
    const loading = reimportingVideoId === video.id
    return (
      <details className="group relative">
        <summary
          title={loading ? 'Re-importing...' : 'Re-import options'}
          aria-label={loading ? 'Re-importing...' : 'Re-import options'}
          className={`dark:border-white/15 inline-flex h-8 w-8 list-none items-center justify-center rounded-md border border-border-strong bg-black/5 text-text-main hover:border-blue-400/50 hover:bg-blue-500/10 dark:bg-white/5 dark:text-white/90 ${
            loading ? 'pointer-events-none opacity-60' : ''
          }`}
        >
          <span className={`material-symbols-outlined !text-[18px] ${loading ? 'animate-spin' : ''}`}>refresh</span>
        </summary>
        <div className="dark:border-white/15 absolute right-0 z-20 mt-2 w-44 rounded-md border border-border-strong bg-card p-1 shadow-lg dark:bg-[#1a1f35]">
          <button
            onClick={(e) => {
              e.preventDefault()
              const details = e.currentTarget.closest('details') as HTMLDetailsElement | null
              if (details) details.open = false
              handleReimportCurrent('concise')
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs text-text-main hover:bg-blue-500/10 dark:text-white"
          >
            <span className="material-symbols-outlined !text-[16px]">compress</span>
            <span>Re-import · Concise</span>
          </button>
          <button
            onClick={(e) => {
              e.preventDefault()
              const details = e.currentTarget.closest('details') as HTMLDetailsElement | null
              if (details) details.open = false
              handleReimportCurrent('detailed')
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs text-text-main hover:bg-blue-500/10 dark:text-white"
          >
            <span className="material-symbols-outlined !text-[16px]">match_case</span>
            <span>Re-import · Detailed</span>
          </button>
        </div>
      </details>
    )
  }

  const renderProcessingPanel = (video: Video) => {
    const current = video.status
    const isDirectSource = video.source_type === 'text' || video.source_type === 'file'
    const steps = isDirectSource
      ? [
          { key: 'queued', label: 'Queued' },
          { key: 'processing_extract', label: 'Extract' },
          { key: 'processing_summary', label: 'Summary' },
          { key: 'ready', label: 'Done' },
        ]
      : [
          { key: 'queued', label: 'Queued' },
          { key: 'processing_subtitle', label: 'Subtitle' },
          { key: 'processing_outline', label: 'Outline' },
          { key: 'processing_explaining', label: 'Chapter Explaining' },
          { key: 'ready', label: 'Done' },
        ]
    const rank: Record<string, number> = isDirectSource
      ? {
          queued: 0,
          processing_extract: 1,
          processing_summary: 2,
          ready: 3,
          error: 3,
          'no-subtitle': 3,
        }
      : {
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
            <p className="mt-1 text-sm text-text-muted dark:text-white/60">
              {getStageDescription(video.status, language)}
            </p>
          </div>
          <span className="rounded-full bg-black/10 px-3 py-1 text-xs text-text-muted dark:bg-white/10 dark:text-white/80">
            Processing
          </span>
        </div>

        <div className={`mt-6 grid gap-3 ${steps.length === 4 ? 'grid-cols-4' : 'grid-cols-5'}`}>
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
          You can continue importing URLs, taking notes, or switching to completed resources.
        </div>
      </div>
    )
  }

  const renderLearnPanel = () => {
    if (!activeVideo) {
      return (
        <div className="flex h-full items-center justify-center rounded-xl border border-border-strong bg-card text-text-muted dark:border-white/10 dark:bg-[#131b36] dark:text-white/60">
          {tx('Import sources to start learning.', '请先导入资源开始学习。')}
        </div>
      )
    }

    if (activeVideo.status === 'error' || activeVideo.status === 'no-subtitle') {
      const canReimport = Boolean(activeVideo.id)
      return (
        <div className="flex h-full flex-col rounded-xl border border-red-500/30 bg-card p-6 dark:bg-[#131b36]">
          <p className="mt-3 text-red-300">{activeVideo.summary || tx('Processing failed.', '处理失败。')}</p>
          {(activeVideo.source_type === 'bilibili' || activeVideo.source_type === 'youtube') && (
            <p className="mt-2 text-xs text-amber-200">
              {tx('If subtitle download failed, check your platform credentials in ', '若字幕下载失败，请先检查 ')}
              <a href="/settings" className="font-semibold underline">
                {tx('Settings', '设置')}
              </a>
              {tx('.', '。')}
            </p>
          )}
          {canReimport ? <div className="mt-6">{renderReimportMenu(activeVideo)}</div> : null}
        </div>
      )
    }

    if (isProcessing(activeVideo.status)) {
      return renderProcessingPanel(activeVideo)
    }

    const chapters = activeVideo.chapters || []
    const compactSummary = String(activeVideo.summary || '')
      .replace(/^##\s*(Learning Overview|Learning Overview|Learning Overview|Overview)\s*\n+/i, '')
      .trim()
    const isSummaryOnly =
      activeVideo.generation_profile === 'summary_only' ||
      activeVideo.generation_profile === 'import_only' ||
      activeVideo.interpretation_mode === 'none'
    const canReimport = Boolean(activeVideo.id)
    return (
      <div className="grid h-full grid-cols-12 gap-4 overflow-hidden">
        <div className="col-span-12 overflow-y-auto rounded-xl border border-border-strong bg-card p-6 dark:border-white/10 dark:bg-[#131b36] lg:col-span-10">
          <div className="mb-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">
                {tx('Learning Overview', '学习总览')}
              </h2>
              {canReimport ? (
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`rounded px-2 py-0.5 text-[11px] font-semibold ${getSourceTypeMeta(activeVideo).badge}`}
                  >
                    {getSourceTypeMeta(activeVideo).label}
                  </span>
                  <span
                    className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                      getInterpretationModeMeta(activeVideo.interpretation_mode).badge
                    }`}
                  >
                    {getInterpretationModeMeta(activeVideo.interpretation_mode).label}
                  </span>
                  {renderReimportMenu(activeVideo)}
                </div>
              ) : (
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`rounded px-2 py-0.5 text-[11px] font-semibold ${getSourceTypeMeta(activeVideo).badge}`}
                  >
                    {getSourceTypeMeta(activeVideo).label}
                  </span>
                  <span
                    className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                      getInterpretationModeMeta(activeVideo.interpretation_mode).badge
                    }`}
                  >
                    {getInterpretationModeMeta(activeVideo.interpretation_mode).label}
                  </span>
                </div>
              )}
            </div>
            <div className="markdown-body mt-3 text-base leading-8 text-slate-800 dark:text-slate-100">
              <Markdown>
                {compactSummary || activeVideo.interpretation_mode === 'none'
                  ? tx(
                      'This resource is import-only. No summary/interpretation was generated.',
                      '该资源为仅导入模式，未生成总结/解读。',
                    )
                  : tx('No summary yet.', '暂无总结。')}
              </Markdown>
            </div>
          </div>

          <div className="space-y-4">
            {chapters.length === 0 ? (
              isSummaryOnly ? null : (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-100">
                  <p className="font-semibold">
                    {tx('No chapter content has been generated yet.', '暂未生成章节内容。')}
                  </p>
                  <p className="mt-1 text-xs opacity-90">
                    {activeVideo.last_error
                      ? `Reason: ${activeVideo.last_error}`
                      : tx(
                          'Reason unavailable. The model may still be processing, or the outline format was invalid.',
                          '原因暂不可用。模型可能仍在处理，或返回的大纲格式无效。',
                        )}
                  </p>
                  <p className="mt-2 text-xs opacity-90">
                    {isZh ? (
                      <>
                        你可以点击上方 <span className="font-semibold">重新导入</span>，重新执行字幕下载和解读流程。
                      </>
                    ) : (
                      <>
                        You can click <span className="font-semibold">Re-import</span> above to rerun subtitle download
                        and interpretation.
                      </>
                    )}
                  </p>
                </div>
              )
            ) : (
              chapters.map((chapter, idx) => (
                <section
                  key={idx}
                  id={`chapter-${idx}`}
                  className="dark:border-white/15 rounded-lg border border-slate-300/80 bg-white p-5 shadow-sm dark:bg-[#0f1a35]"
                >
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {idx + 1}. {chapter.title}
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
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">
            {tx('Outline', '大纲')}
          </h3>
          {chapters.length === 0 ? (
            <p className="text-xs text-slate-600 dark:text-slate-300/80">
              {isSummaryOnly
                ? tx('Import-only mode does not generate outline.', '仅导入模式下不生成大纲。')
                : tx('Outline not generated yet.', '暂未生成大纲。')}
            </p>
          ) : (
            chapters.map((chapter, idx) => (
              <button
                key={idx}
                onClick={() =>
                  document.getElementById(`chapter-${idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
                className="dark:border-white/15 rounded-md border border-slate-300/80 bg-white px-3 py-2 text-left text-sm text-slate-800 hover:border-blue-400/50 hover:bg-blue-500/10 dark:bg-white/10 dark:text-slate-100"
              >
                <div className="text-xs text-slate-500 dark:text-slate-300/75">
                  {tx('Chapter', '章节')} {idx + 1}
                </div>
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
          Select a source to view content.
        </div>
      )
    }

    if (!activeVideo.transcript) {
      return (
        <div className="flex h-full flex-col rounded-xl border border-border-strong bg-card p-6 dark:border-white/10 dark:bg-[#131b36]">
          <h2 className="text-xl font-semibold text-text-main dark:text-white">{activeVideo.title}</h2>
          <p className="mt-2 text-sm text-text-muted dark:text-white/60">
            {tx(
              'Source content is currently unavailable. Re-import after processing is complete.',
              '源内容暂不可用。可在处理完成后重新导入。',
            )}
          </p>
        </div>
      )
    }

    const sourceMime = String(activeVideo.source_mime || '').toLowerCase()
    const sourceUrl = String(activeVideo.source_url || '').toLowerCase()
    const isMarkdownSource = sourceMime.includes('markdown') || sourceUrl.endsWith('.md')
    const q = subtitleSearch.trim()
    const matchCount = subtitleMatchedIndexes.length

    return (
      <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border-strong bg-card p-4 dark:border-white/10 dark:bg-[#131b36]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-xs text-text-muted dark:text-white/60">
            Lines: {transcriptLines.length}
            {q ? ` · Matches: ${matchCount}` : ''}
          </div>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(String(activeVideo.transcript || ''))
                setCopiedTranscript(true)
                setTimeout(() => setCopiedTranscript(false), 1200)
              } catch {
                setCopiedTranscript(false)
              }
            }}
            className="inline-flex items-center gap-1 rounded-md border border-border-strong bg-white px-2 py-1 text-xs text-text-main hover:border-accent/70 dark:border-white/20 dark:bg-black/20 dark:text-white/90"
            title={tx('Copy full source text', '复制完整原文')}
          >
            <span className="material-symbols-outlined !text-[16px]">content_copy</span>
            <span>{copiedTranscript ? tx('Copied', '已复制') : tx('Copy', '复制')}</span>
          </button>
        </div>

        <div className="mb-3 flex h-10 w-full items-center rounded-lg border border-border-strong bg-white px-3 dark:border-white/20 dark:bg-black/20">
          <span className="material-symbols-outlined mr-2 !text-[20px] text-text-muted dark:text-[#9da6b9]">
            search
          </span>
          <input
            className="flex-1 bg-transparent text-sm text-text-main placeholder:text-text-muted focus:outline-none dark:text-white dark:placeholder:text-white/40"
            placeholder="Search source text"
            value={subtitleSearch}
            onChange={(e) => setSubtitleSearch(e.target.value)}
          />
        </div>

        {isMarkdownSource && !q ? (
          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border-strong bg-black/5 p-4 dark:border-white/10 dark:bg-white/5">
            <article className="markdown-body text-slate-800 dark:text-slate-100">
              <Markdown>{activeVideo.transcript}</Markdown>
            </article>
          </div>
        ) : (
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
        )}
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
            <a href="/" className="hover:opacity-85 flex items-center gap-2">
              <img src="/logo.svg" alt="Professor logo" className="h-5 w-5" />
              <h2 className="text-base font-bold text-text-main dark:text-white">Professor</h2>
            </a>
            <div className="flex items-center gap-2">
              <span className="text-base font-medium text-text-muted dark:text-white/30">/</span>
              <a
                className="text-sm font-medium text-text-muted hover:text-text-main dark:text-white/60 dark:hover:text-white"
                href="/notebooks"
              >
                {tx('Notebooks', '笔记本')}
              </a>
              <span className="text-base font-medium text-text-muted dark:text-white/30">/</span>
              <span className="text-sm font-medium text-text-main dark:text-white">{notebook?.title || ''}</span>
            </div>
          </div>
          <div className="flex flex-1 items-center justify-end gap-6">
            <a
              className="text-sm font-medium text-text-main hover:text-text-muted dark:text-white/80 dark:hover:text-white"
              href="/settings"
            >
              {tx('Settings', '设置')}
            </a>
            <div className="flex items-center gap-3">
              <LanguageSwitcher language={language} onChange={setLanguage} />
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
              <h3 className="text-sm font-semibold uppercase text-text-muted dark:text-white/40">
                {tx('Sources', '资源')}
              </h3>
              <div className="flex gap-2">
                {selected.length > 0 && (
                  <button
                    onClick={handleBatchDelete}
                    className="rounded bg-red-100 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400"
                  >
                    {tx(`Delete (${selected.length})`, `删除（${selected.length}）`)}
                  </button>
                )}
                <button
                  onClick={() => {
                    setShowImportModal(true)
                    setImportError('')
                    setUrlInput('')
                    setTextTitleInput('')
                    setTextBodyInput('')
                    setImportFiles([])
                    setImportTab('url')
                    setExpandMode('current')
                    setImportInterpretationMode(
                      defaultInterpretationModeData?.mode === 'detailed'
                        ? 'detailed'
                        : defaultInterpretationModeData?.mode === 'none'
                        ? 'none'
                        : 'concise',
                    )
                  }}
                  className="rounded bg-accent px-2 py-1 text-xs font-medium text-text-main hover:bg-accent/90 dark:bg-primary dark:text-white"
                >
                  {tx('Import', '导入')}
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
                  placeholder="Search sources"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="-mr-1 flex-1 space-y-2 overflow-y-auto pr-1">
              {filteredVideos.map((video) => {
                const active = video.id === activeVideoId
                const meta = getVideoStatusMeta(video.status, language)
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
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                getSourceTypeMeta(video).badge
                              }`}
                            >
                              {getSourceTypeMeta(video).label}
                            </span>
                            <span className="material-symbols-outlined !text-[16px] text-text-muted dark:text-white/60">
                              {getSourceTypeMeta(video).icon}
                            </span>
                            <p
                              className="truncate text-sm font-medium text-text-main dark:text-white"
                              title={video.title}
                            >
                              {video.title}
                            </p>
                          </div>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase ${meta.pill}`}>
                            {meta.label}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-text-muted dark:text-white/60">
                          {processing ? (
                            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-yellow-300" />
                          ) : null}
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                              getInterpretationModeMeta(video.interpretation_mode).badge
                            }`}
                          >
                            {getInterpretationModeMeta(video.interpretation_mode).label}
                          </span>
                          <span>{getStageDescription(video.status, language)}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })}

              {filteredVideos.length === 0 && (
                <div className="py-6 text-center text-sm text-text-muted dark:text-white/40">No resources yet.</div>
              )}
            </div>
          </div>

          <div className="col-span-12 flex h-full flex-col overflow-hidden lg:col-span-9">
            <div className="mb-3 flex shrink-0 items-center justify-between">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <h1
                  className="min-w-0 flex-1 truncate text-2xl font-bold text-text-main dark:text-white"
                  title={activeVideo?.title || ''}
                >
                  {activeVideo?.title || 'No resource selected'}
                </h1>
                <button
                  onClick={() =>
                    setShowAssistantPanel((v) => {
                      const next = !v
                      if (!next) setAssistantMaximized(false)
                      return next
                    })
                  }
                  title={showAssistantPanel ? 'Hide AI Panel' : 'Show AI Panel'}
                  aria-label={showAssistantPanel ? 'Hide AI Panel' : 'Show AI Panel'}
                  className="dark:border-white/15 inline-flex h-8 w-8 items-center justify-center rounded-full border border-border-strong bg-black/5 text-text-muted hover:text-text-main dark:bg-white/5 dark:text-white/70 dark:hover:text-white"
                >
                  <span className="material-symbols-outlined !text-[18px]">
                    {showAssistantPanel ? 'right_panel_close' : 'right_panel_open'}
                  </span>
                </button>
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
                  Learn
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
                  Source Text
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
                  <span className="text-xs text-text-muted dark:text-white/60">Auto-refreshing</span>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-2 text-xs">
                  <div>Total: {batchSummary.stats.total}</div>
                  <div>Done：{batchSummary.stats.ready}</div>
                  <div>Processing：{batchSummary.stats.processing}</div>
                  <div>Failed：{batchSummary.stats.failed}</div>
                </div>
                <div className="mt-3 max-h-24 space-y-1 overflow-y-auto text-xs">
                  {batchItems.slice(0, 8).map((item) => {
                    const statusMeta = getVideoStatusMeta(item.status, language)
                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between rounded bg-black/5 px-2 py-1 dark:bg-white/5"
                      >
                        <span className="truncate pr-3">{item.title}</span>
                        <span className={statusMeta.color}>{statusMeta.label}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {!assistantMaximized ? (
              activeTab === 'learn' ? (
                <div className="min-h-0 flex-1 overflow-hidden">{renderLearnPanel()}</div>
              ) : activeTab === 'subtitle' ? (
                <div className="min-h-0 flex-1 overflow-hidden">{renderSubtitlePanel()}</div>
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border-strong bg-card p-6 text-text-main dark:border-white/10 dark:bg-[#131b36] dark:text-white/80">
                  <h2 className="text-xl font-semibold text-text-main dark:text-white">Notebook Notes</h2>
                  <p className="mt-2 text-sm text-text-muted dark:text-white/60">
                    Notes stay available. You can keep writing and organizing notes while videos process in background.
                  </p>
                </div>
              )
            ) : null}

            {showAssistantPanel ? (
              <div
                className={`flex flex-col rounded-xl border border-border-strong bg-card p-4 dark:border-white/10 dark:bg-[#131b36] ${
                  assistantMaximized ? 'min-h-0 flex-1 overflow-hidden' : 'mt-4 shrink-0'
                }`}
              >
                <div className="mb-3 flex shrink-0 items-center justify-between">
                  <p className="text-sm font-semibold text-text-main dark:text-white">Ask follow-up</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setAssistantMaximized((v) => !v)}
                      title={assistantMaximized ? 'Minimize' : 'Maximize'}
                      aria-label={assistantMaximized ? 'Minimize' : 'Maximize'}
                      className="inline-flex h-7 w-7 items-center justify-center rounded border border-border-strong text-text-muted hover:text-text-main dark:border-white/20 dark:text-white/70 dark:hover:text-white"
                    >
                      <span className="material-symbols-outlined !text-[16px]">
                        {assistantMaximized ? 'close_fullscreen' : 'open_in_full'}
                      </span>
                    </button>
                  </div>
                </div>

                <div className={`${assistantMaximized ? 'min-h-0 flex-1' : 'max-h-48'} space-y-3 overflow-y-auto pr-1`}>
                  {messages.length > 0
                    ? messages.map((msg: any) => {
                        const text = (
                          msg.parts
                            ?.filter((p: any) => p.type === 'text')
                            .map((p: any) => p.text)
                            .join('') ||
                          msg.content ||
                          ''
                        ).trim()
                        const toolParts = (msg.parts || []).filter((p: any) =>
                          typeof p?.type === 'string' ? p.type.startsWith('tool-') : false,
                        )

                        return (
                          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            {msg.role === 'user' ? (
                              <div className="max-w-[85%] whitespace-pre-wrap rounded-xl bg-blue-600 px-3 py-2 text-sm text-white">
                                {text}
                              </div>
                            ) : (
                              <div className="flex max-w-[92%] items-start gap-2">
                                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border-strong bg-black/5 dark:border-white/20 dark:bg-white/10">
                                  <img src="/logo.svg" alt="Professor AI" className="h-4 w-4 opacity-90" />
                                </span>
                                <div className="min-w-0 flex-1 space-y-2">
                                  {toolParts.length > 0 ? (
                                    <div className="space-y-1">
                                      {toolParts.map((part: any, idx: number) => {
                                        const state = String(part?.state || '')
                                        const input = part?.input || part?.args || {}
                                        const query =
                                          typeof input?.query === 'string' ? input.query : JSON.stringify(input || {})
                                        const statusLabel =
                                          state === 'output-available'
                                            ? 'Retrieval done'
                                            : state === 'input-available'
                                            ? 'Retrieving...'
                                            : 'Tool running...'
                                        return (
                                          <div
                                            key={`${msg.id}-tool-${idx}`}
                                            className="dark:border-white/15 rounded-lg border border-border-strong bg-black/5 px-3 py-2 text-xs text-text-muted dark:bg-white/5 dark:text-white/70"
                                          >
                                            🔍 {statusLabel} {query ? `: ${query}` : ''}
                                          </div>
                                        )
                                      })}
                                    </div>
                                  ) : null}
                                  <div className="markdown-body rounded-xl bg-black/5 px-3 py-2 text-sm text-slate-800 dark:bg-white/5 dark:text-slate-100">
                                    <Markdown>{text}</Markdown>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })
                    : null}
                  {isChatLoading ? <p className="text-xs text-text-muted dark:text-white/50">Thinking...</p> : null}
                  <div ref={bottomRef} />
                </div>

                <form onSubmit={handleAsk} className="mt-3 flex shrink-0 items-center gap-2">
                  <textarea
                    rows={1}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onCompositionStart={() => setIsChatInputComposing(true)}
                    onCompositionEnd={() => setIsChatInputComposing(false)}
                    className="dark:border-white/15 min-h-[40px] flex-1 resize-none rounded-md border border-border-strong bg-white px-3 py-2 text-sm text-text-main placeholder:text-text-muted focus:outline-none dark:bg-black/20 dark:text-white dark:placeholder:text-white/40"
                    placeholder={tx(
                      'Ask a question; Enter to send, Shift+Enter for newline',
                      '输入问题；Enter 发送，Shift+Enter 换行',
                    )}
                    onKeyDown={(e) => {
                      const nativeEvt = e.nativeEvent as KeyboardEvent
                      if (isChatInputComposing || nativeEvt.isComposing || nativeEvt.keyCode === 229) return
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
                <h3 className="text-lg font-semibold">Import resources</h3>
                <button
                  className="text-text-muted hover:text-text-main dark:text-white/60 dark:hover:text-white"
                  onClick={() => setShowImportModal(false)}
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="mt-4 space-y-4">
                <div className="flex items-center gap-2 text-xs">
                  {(['url', 'text', 'files'] as ImportTab[]).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setImportTab(tab)}
                      className={`rounded-full px-3 py-1.5 ${
                        importTab === tab
                          ? 'bg-blue-500/20 text-blue-700 dark:text-blue-200'
                          : 'bg-black/5 text-text-muted hover:text-text-main dark:bg-white/5 dark:text-white/60 dark:hover:text-white'
                      }`}
                    >
                      {tab === 'url' ? 'URL' : tab === 'text' ? 'Text' : 'Files'}
                    </button>
                  ))}
                </div>
                {importTab === 'url' ? (
                  <>
                    <textarea
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder={`Paste one or more video URLs (Bilibili / YouTube).\nSupported separators: new line, space, comma, semicolon.`}
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
                          <span>Import current video/part only (Recommended)</span>
                        </label>
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="radio"
                            name="expandMode"
                            value="all"
                            checked={expandMode === 'all'}
                            onChange={() => setExpandMode('all')}
                          />
                          <span>Expand each URL to all parts/episodes</span>
                        </label>
                      </div>
                    </div>
                  </>
                ) : null}
                {importTab === 'text' ? (
                  <div className="space-y-3">
                    <input
                      value={textTitleInput}
                      onChange={(e) => setTextTitleInput(e.target.value)}
                      placeholder="Title (optional)"
                      className="w-full rounded-md border border-border-strong bg-white px-3 py-2 text-sm text-text-main placeholder:text-text-muted focus:border-accent focus:outline-none dark:border-white/20 dark:bg-black/20 dark:text-white dark:placeholder:text-white/50"
                    />
                    <textarea
                      value={textBodyInput}
                      onChange={(e) => setTextBodyInput(e.target.value)}
                      rows={10}
                      placeholder="Paste text content to import"
                      className="w-full rounded-md border border-border-strong bg-white px-3 py-2 text-sm text-text-main placeholder:text-text-muted focus:border-accent focus:outline-none dark:border-white/20 dark:bg-black/20 dark:text-white dark:placeholder:text-white/50"
                    />
                    <div className="text-xs text-text-muted dark:text-white/50">
                      Characters: {textBodyInput.trim().length}
                    </div>
                  </div>
                ) : null}
                {importTab === 'files' ? (
                  <div className="space-y-3">
                    <label className="block cursor-pointer rounded-md border border-dashed border-border-strong bg-white/50 px-4 py-6 text-center text-sm text-text-muted hover:border-accent/50 dark:border-white/20 dark:bg-black/20 dark:text-white/60">
                      <input
                        type="file"
                        className="hidden"
                        multiple
                        accept=".txt,.md,.srt,.vtt,.ass,.pdf,.docx"
                        onChange={(e) => handlePickFiles(e.target.files)}
                      />
                      Click to select files (.txt/.md/.srt/.vtt/.ass/.pdf/.docx)
                    </label>
                    <div className="max-h-40 space-y-2 overflow-y-auto">
                      {importFiles.map((f) => (
                        <div
                          key={f.id}
                          className="dark:border-white/15 flex items-center justify-between rounded-md border border-border-strong bg-black/5 px-3 py-2 text-xs dark:bg-white/5"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-text-main dark:text-white">{f.name}</div>
                            <div className="text-text-muted dark:text-white/50">
                              {f.mimeType || 'Unknown'} · {(f.size / 1024).toFixed(1)} KB
                            </div>
                          </div>
                          <button
                            onClick={() => setImportFiles((prev) => prev.filter((x) => x.id !== f.id))}
                            className="ml-3 rounded border border-red-500/30 px-2 py-1 text-red-500 hover:bg-red-500/10"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      {importFiles.length === 0 ? (
                        <div className="text-xs text-text-muted dark:text-white/50">No files selected yet.</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                <div className="dark:border-white/15 rounded-md border border-border-strong bg-white/60 px-3 py-2 text-sm dark:bg-black/20">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted dark:text-white/60">
                    Interpretation mode
                  </p>
                  <div className="flex flex-col gap-2">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        name="interpretationMode"
                        value="none"
                        checked={importInterpretationMode === 'none'}
                        onChange={() => setImportInterpretationMode('none')}
                      />
                      <span>Import only (no summary/interpretation)</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        name="interpretationMode"
                        value="concise"
                        checked={importInterpretationMode === 'concise'}
                        onChange={() => setImportInterpretationMode('concise')}
                      />
                      <span>Concise (faster, more compressed)</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        name="interpretationMode"
                        value="detailed"
                        checked={importInterpretationMode === 'detailed'}
                        onChange={() => setImportInterpretationMode('detailed')}
                      />
                      <span>Detailed (keeps more details)</span>
                    </label>
                  </div>
                </div>
                {importError && <p className="text-sm text-red-500 dark:text-red-400">{importError}</p>}
                <p className="text-xs text-text-muted dark:text-white/50">
                  Import runs in background. Text/file defaults to import-only; you can switch to concise or detailed
                  mode.
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
                    disabled={
                      loadingImport ||
                      (importTab === 'url' && !urlInput.trim()) ||
                      (importTab === 'text' && !textBodyInput.trim()) ||
                      (importTab === 'files' && importFiles.length === 0)
                    }
                    className="rounded-lg bg-success px-4 py-2 text-sm font-semibold text-white hover:bg-success/90 disabled:opacity-50 dark:bg-primary"
                  >
                    {loadingImport ? 'Submitting...' : 'Start import'}
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
