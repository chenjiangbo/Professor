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
import type { SubscriptionTier } from '~/lib/billing/repo'

type Video = {
  id: string
  title: string
  duration?: string
  status: string
  platform?: string
  source_type?: 'bilibili' | 'youtube' | 'douyin' | 'text' | 'file'
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
  cover_url?: string | null
  cover_status?: 'none' | 'queued' | 'generating' | 'ready' | 'error'
  coverUpdatedAt?: string | null
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
type InterpretationMode = 'concise' | 'detailed' | 'extract' | 'none'
type MainTab = 'learn' | 'subtitle' | 'notes'
type ImportTab = 'url' | 'text' | 'files'
type ImportLocalFile = {
  id: string
  name: string
  mimeType: string
  size: number
  contentBase64: string
}

type MePayload = {
  user_id: string
  tier: SubscriptionTier
}

type NotebookCoverUpload = {
  file: File
  previewUrl: string
  name: string
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const meFetcher = async (url: string): Promise<MePayload | null> => {
  const res = await fetch(url)
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.user_id || !data?.tier) return null
  return data as MePayload
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isDouyinUrl(input: string) {
  try {
    const u = new URL(String(input || '').trim())
    const host = u.hostname.toLowerCase()
    return host === 'v.douyin.com' || host.endsWith('douyin.com') || host.endsWith('iesdouyin.com')
  } catch {
    return false
  }
}

function splitInputUrls(input: string) {
  return String(input || '')
    .split(/[\n,，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function getUtf8Length(input: string) {
  return new TextEncoder().encode(String(input || '')).length
}

function getNotebookCoverUrl(notebook?: Notebook | null) {
  if (!notebook || notebook.cover_status !== 'ready' || !notebook.cover_url) return null
  const version = encodeURIComponent(String(notebook.coverUpdatedAt || ''))
  return `/api/notebooks/${notebook.id}/cover?v=${version}`
}

async function readImageFileAsUpload(file: File): Promise<NotebookCoverUpload> {
  const allowed = new Set(['image/png', 'image/jpeg', 'image/webp'])
  if (!allowed.has(file.type)) {
    throw new Error('Unsupported cover image type. Only PNG, JPEG, and WebP are allowed.')
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error('Cover image is too large. Current limit is 8MB.')
  }

  const previewUrl = URL.createObjectURL(file)
  return {
    file,
    previewUrl,
    name: file.name,
  }
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

function formatTimestamp(value: string | undefined, language: 'zh-CN' | 'en-US') {
  if (!value) return '--'
  const time = new Date(value)
  if (Number.isNaN(time.getTime())) return '--'
  const locale = language === 'zh-CN' ? 'zh-CN' : 'en-US'
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(time)
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
  if (kind === 'douyin' || video.platform === 'douyin') {
    return {
      label: 'DY',
      icon: 'movie',
      badge:
        'border border-fuchsia-300 bg-fuchsia-100 text-fuchsia-900 dark:border-fuchsia-500/20 dark:bg-fuchsia-500/20 dark:text-fuchsia-200',
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
  if (mode === 'extract')
    return {
      label: 'Extract',
      badge:
        'border border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-300/50 dark:bg-emerald-500/30 dark:text-emerald-50',
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
  const { data: notebook, mutate: mutateNotebook } = useSWR<Notebook>(id ? `/api/notebooks/${id}` : null, fetcher)
  const { data: me } = useSWR<MePayload | null>('/api/auth/me', meFetcher)
  const { data: videosData, mutate } = useSWR<Video[]>(
    id ? `/api/notebooks/${id}/videos?lang=${encodeURIComponent(language)}` : null,
    fetcher,
    {
      refreshInterval: 3500,
    },
  )
  const videos = useMemo(() => (Array.isArray(videosData) ? videosData : []), [videosData])

  const [urlInput, setUrlInput] = useState('')
  const [textTitleInput, setTextTitleInput] = useState('')
  const [textBodyInput, setTextBodyInput] = useState('')
  const [importFiles, setImportFiles] = useState<ImportLocalFile[]>([])
  const [importTab, setImportTab] = useState<ImportTab>('url')
  const [showImportModal, setShowImportModal] = useState(false)
  const [importError, setImportError] = useState('')
  const [importNotice, setImportNotice] = useState('')
  const [lastBatchId, setLastBatchId] = useState<string>('')
  const [expandMode, setExpandMode] = useState<ImportExpandMode>('current')
  const [importInterpretationMode, setImportInterpretationMode] = useState<InterpretationMode>('concise')

  const [selected, setSelected] = useState<string[]>([])
  const [loadingImport, setLoadingImport] = useState(false)
  const [exportingZip, setExportingZip] = useState(false)
  const [exportIncludeInterpretation, setExportIncludeInterpretation] = useState(true)
  const [exportIncludeSubtitle, setExportIncludeSubtitle] = useState(false)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [showEditNotebookModal, setShowEditNotebookModal] = useState(false)
  const [editingNotebook, setEditingNotebook] = useState(false)
  const [editNotebookTitle, setEditNotebookTitle] = useState('')
  const [editNotebookDescription, setEditNotebookDescription] = useState('')
  const [editNotebookCover, setEditNotebookCover] = useState<NotebookCoverUpload | null>(null)
  const [activeTab, setActiveTab] = useState<MainTab>('learn')
  const [activeVideoId, setActiveVideoId] = useState<string>('')
  const [subtitleSearch, setSubtitleSearch] = useState<string>('')
  const [copiedTranscript, setCopiedTranscript] = useState(false)
  const [copiedInterpretation, setCopiedInterpretation] = useState(false)
  const [showAssistantPanel, setShowAssistantPanel] = useState(true)
  const [assistantMaximized, setAssistantMaximized] = useState(false)
  const [reimportingVideoId, setReimportingVideoId] = useState<string>('')
  const tier = me?.tier || 'free'
  const importDailyLimit = tier === 'premium' ? null : tier === 'pro' ? 15 : 5
  const canExportZip = false
  const transcriptByteLimit = 90000
  const textByteLength = getUtf8Length(textBodyInput.trim())
  const textWillTruncate = textByteLength > transcriptByteLimit

  const { data: initialHistoryData } = useSWR<ChatMessage[]>(
    id && activeVideoId ? `/api/notebooks/${id}/chats?videoId=${encodeURIComponent(activeVideoId)}` : null,
    fetcher,
  )
  const initialHistory = useMemo(
    () => (Array.isArray(initialHistoryData) ? initialHistoryData : []),
    [initialHistoryData],
  )
  const [input, setInput] = useState('')
  const [isChatInputComposing, setIsChatInputComposing] = useState(false)
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null)
  const exportMenuRef = useRef<HTMLDivElement | null>(null)
  const { data: batchSummary } = useSWR<ImportBatchSummary>(
    lastBatchId ? `/api/import-batches/${lastBatchId}` : null,
    fetcher,
    { refreshInterval: 2500 },
  )
  const { data: batchItemsData } = useSWR<ImportBatchItem[]>(
    lastBatchId ? `/api/import-batches/${lastBatchId}/items` : null,
    fetcher,
    { refreshInterval: 2500 },
  )
  const batchItems = useMemo(() => (Array.isArray(batchItemsData) ? batchItemsData : []), [batchItemsData])
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

  const autoResizeChatInput = (el?: HTMLTextAreaElement | null) => {
    const target = el || chatInputRef.current
    if (!target) return
    target.style.height = 'auto'
    const nextHeight = Math.max(40, Math.min(target.scrollHeight, 220))
    target.style.height = `${nextHeight}px`
    target.style.overflowY = target.scrollHeight > 220 ? 'auto' : 'hidden'
  }

  useEffect(() => {
    const history = initialHistory || []
    const signature = history.map((m: any) => `${m.id}:${m.created_at}`).join('|')
    const syncKey = `${activeVideoId}::${signature}`
    if (historySyncKeyRef.current === syncKey) return
    historySyncKeyRef.current = syncKey
    setMessages(history as any)
  }, [initialHistory, activeVideoId])

  useEffect(() => {
    autoResizeChatInput()
  }, [input])

  useEffect(() => {
    if (!exportMenuOpen) return
    const onPointerDown = (event: MouseEvent) => {
      const node = exportMenuRef.current
      if (!node) return
      if (node.contains(event.target as Node)) return
      setExportMenuOpen(false)
    }
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExportMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onEscape)
    }
  }, [exportMenuOpen])

  useEffect(() => {
    setCopiedInterpretation(false)
  }, [activeVideoId])

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
    setEditNotebookTitle(String(notebook?.title || ''))
    setEditNotebookDescription(String(notebook?.description || ''))
  }, [notebook?.id, notebook?.title, notebook?.description])

  useEffect(() => {
    const mode = defaultInterpretationModeData?.mode
    if (mode === 'detailed' || mode === 'concise' || mode === 'extract' || mode === 'none') {
      setImportInterpretationMode(mode)
    }
  }, [defaultInterpretationModeData?.mode])

  useEffect(() => {
    if (importTab === 'text' || importTab === 'files') {
      setImportInterpretationMode('none')
      return
    }
    const mode = defaultInterpretationModeData?.mode
    setImportInterpretationMode(
      mode === 'detailed' ? 'detailed' : mode === 'extract' ? 'extract' : mode === 'none' ? 'none' : 'concise',
    )
  }, [importTab, defaultInterpretationModeData?.mode])

  const filteredVideos = useMemo(() => {
    const query = search.trim().toLowerCase()
    return [...videos]
      .sort((a, b) => {
        const aTs = new Date(a.created_at || 0).getTime()
        const bTs = new Date(b.created_at || 0).getTime()
        return bTs - aTs
      })
      .filter((v) =>
        query
          ? String(v.title || '')
              .toLowerCase()
              .includes(query)
          : true,
      )
  }, [videos, search])

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

  const handleExportNotebook = async () => {
    if (!id) return
    setExportMenuOpen(false)
    if (!canExportZip) {
      alert(tx('Notebook export is currently unavailable.', '笔记本导出当前不可用。'))
      return
    }
    if (!exportIncludeInterpretation && !exportIncludeSubtitle) {
      alert(tx('Please select at least one export content type.', '请至少勾选一种导出内容。'))
      return
    }
    setExportingZip(true)
    try {
      const params = new URLSearchParams({
        lang: language,
        includeInterpretation: exportIncludeInterpretation ? '1' : '0',
        includeSubtitle: exportIncludeSubtitle ? '1' : '0',
      })
      const res = await fetch(`/api/notebooks/${id}/export?${params.toString()}`)
      if (!res.ok) {
        const json = await parseResponseJsonSafe(res)
        throw new Error(json?.error || tx('Export failed.', '导出失败。'))
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const filename = `${
        String(notebook?.title || 'notebook')
          .replace(/[<>:\"/\\|?*\u0000-\u001F]/g, ' ')
          .trim() || 'notebook'
      }.zip`
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      alert(e?.message || tx('Export failed.', '导出失败。'))
    } finally {
      setExportingZip(false)
    }
  }

  const handleImport = async () => {
    if (!id) return
    setImportError('')
    setImportNotice('')
    setLoadingImport(true)
    try {
      let res: Response
      if (importTab === 'url') {
        if (!urlInput.trim()) throw new Error(tx('Please paste at least one URL.', '请至少粘贴一个 URL。'))
        const parsedUrls = splitInputUrls(urlInput)
        if (parsedUrls.some((url) => isDouyinUrl(url))) {
          throw new Error(
            tx(
              'Douyin import is temporarily unavailable. Please import Bilibili or YouTube URLs.',
              '抖音导入暂不支持，请先导入 Bilibili 或 YouTube 链接。',
            ),
          )
        }
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
        throw new Error(tx('File import is temporarily unavailable.', '文件导入暂不支持。'))
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
      setImportNotice(tx('Import task submitted and running in background.', '导入任务已提交，正在后台处理。'))
      mutate()
      setShowImportModal(false)
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

  const handleReimportCurrent = async (mode: 'concise' | 'detailed' | 'extract') => {
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

  const handleSaveNotebook = async () => {
    if (!id || !editNotebookTitle.trim()) {
      alert(tx('Please enter a notebook title.', '请输入 Notebook 标题。'))
      return
    }

    setEditingNotebook(true)
    try {
      const formData = new FormData()
      formData.append('title', editNotebookTitle)
      formData.append('description', editNotebookDescription)
      if (editNotebookCover?.file) {
        formData.append('cover', editNotebookCover.file)
      }
      const res = await fetch(`/api/notebooks/${id}`, {
        method: 'PATCH',
        body: formData,
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json?.error || tx(`Save failed (${res.status})`, `保存失败（${res.status}）`))
      }
      mutateNotebook()
      if (editNotebookCover?.previewUrl) URL.revokeObjectURL(editNotebookCover.previewUrl)
      setEditNotebookCover(null)
      setShowEditNotebookModal(false)
    } catch (e: any) {
      alert(e?.message || tx('Save failed', '保存失败'))
    } finally {
      setEditingNotebook(false)
    }
  }

  const renderReimportMenu = (video: Video) => {
    const loading = reimportingVideoId === video.id
    return (
      <details className="group relative inline-block">
        <summary
          title={loading ? 'Re-importing...' : 'Re-import options'}
          aria-label={loading ? 'Re-importing...' : 'Re-import options'}
          className={`dark:border-white/15 inline-flex h-8 w-8 list-none items-center justify-center rounded-md border border-border-strong bg-black/5 text-text-main hover:border-blue-400/50 hover:bg-blue-500/10 dark:bg-white/5 dark:text-white/90 ${
            loading ? 'pointer-events-none opacity-60' : ''
          }`}
        >
          <span className={`material-symbols-outlined !text-[18px] ${loading ? 'animate-spin' : ''}`}>refresh</span>
        </summary>
        <div className="dark:border-white/15 absolute right-0 top-full z-20 mt-2 w-44 rounded-md border border-border-strong bg-card p-1 shadow-lg dark:bg-[#1a1f35]">
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
          <button
            onClick={(e) => {
              e.preventDefault()
              const details = e.currentTarget.closest('details') as HTMLDetailsElement | null
              if (details) details.open = false
              handleReimportCurrent('extract')
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs text-text-main hover:bg-blue-500/10 dark:text-white"
          >
            <span className="material-symbols-outlined !text-[16px]">facts</span>
            <span>Re-import · Extract (Minimal)</span>
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
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-red-300">
              {tx('Processing failed', '处理失败')}
            </h2>
            {canReimport ? renderReimportMenu(activeVideo) : null}
          </div>
          <p className="mt-3 text-red-300">{activeVideo.summary || tx('Processing failed.', '处理失败。')}</p>
          {(activeVideo.source_type === 'bilibili' ||
            activeVideo.source_type === 'youtube' ||
            activeVideo.source_type === 'douyin') && (
            <p className="mt-2 text-xs text-amber-200">
              {tx('If subtitle download failed, check your platform credentials in ', '若字幕下载失败，请先检查 ')}
              <a href="/settings" className="font-semibold underline">
                {tx('Settings', '设置')}
              </a>
              {tx('.', '。')}
            </p>
          )}
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
    const interpretationCopyText = [
      compactSummary ? `## ${tx('Learning Overview', '学习总览')}\n\n${compactSummary}` : '',
      ...chapters.map((chapter, idx) => {
        const chapterTitle = String(chapter?.title || '').trim() || tx('Untitled chapter', '未命名章节')
        const chapterSummary = String(chapter?.summary || '').trim()
        return chapterSummary ? `## ${idx + 1}. ${chapterTitle}\n\n${chapterSummary}` : ''
      }),
    ]
      .filter(Boolean)
      .join('\n\n')
    const copyInterpretationButton = (
      <button
        type="button"
        disabled={!interpretationCopyText}
        onClick={async () => {
          if (!interpretationCopyText) return
          try {
            await navigator.clipboard.writeText(interpretationCopyText)
            setCopiedInterpretation(true)
            setTimeout(() => setCopiedInterpretation(false), 1200)
          } catch {
            setCopiedInterpretation(false)
          }
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border-strong bg-white text-text-main hover:border-accent/70 disabled:opacity-40 dark:border-white/20 dark:bg-black/20 dark:text-white/90"
        title={tx('Copy interpretation content', '复制解读内容')}
        aria-label={tx('Copy interpretation content', '复制解读内容')}
      >
        <span className="material-symbols-outlined !text-[16px]">
          {copiedInterpretation ? 'check' : 'content_copy'}
        </span>
      </button>
    )

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
                  {copyInterpretationButton}
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
                  {copyInterpretationButton}
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
                {compactSummary
                  ? compactSummary
                  : activeVideo.interpretation_mode === 'none'
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
                  <h3 className="text-lg font-semibold text-blue-700 dark:text-blue-300">
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
                <div className="line-clamp-2 mt-1 text-blue-700 dark:text-blue-300">{chapter.title}</div>
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
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border-strong bg-white text-text-main hover:border-accent/70 dark:border-white/20 dark:bg-black/20 dark:text-white/90"
            title={tx('Copy full source text', '复制完整原文')}
            aria-label={tx('Copy full source text', '复制完整原文')}
          >
            <span className="material-symbols-outlined !text-[16px]">
              {copiedTranscript ? 'check' : 'content_copy'}
            </span>
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
                className="inline-flex items-center gap-1 text-sm font-medium text-text-muted hover:text-text-main dark:text-white/60 dark:hover:text-white"
                href="/notebooks"
              >
                <span className="material-symbols-outlined text-[16px]">menu_book</span>
                {tx('Notebooks', '笔记本')}
              </a>
              <span className="text-base font-medium text-text-muted dark:text-white/30">/</span>
              <span className="text-sm font-medium text-text-main dark:text-white">{notebook?.title || ''}</span>
            </div>
          </div>
          <div className="flex flex-1 items-center justify-end gap-6">
            <button
              type="button"
              onClick={() => setShowEditNotebookModal(true)}
              className="inline-flex items-center gap-1 text-sm font-medium text-text-main hover:text-text-muted dark:text-white/80 dark:hover:text-white"
            >
              <span className="material-symbols-outlined text-[16px]">edit_square</span>
              {tx('Edit notebook', '编辑 Notebook')}
            </button>
            <a
              className="inline-flex items-center gap-1 text-sm font-medium text-text-main hover:text-text-muted dark:text-white/80 dark:hover:text-white"
              href="/settings"
            >
              <span className="material-symbols-outlined text-[16px]">settings</span>
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

        <main className="flex flex-1 flex-col gap-4 overflow-hidden p-4">
          <div className="grid min-h-0 flex-1 grid-cols-12 gap-4 overflow-hidden">
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
                  {canExportZip ? (
                    <div ref={exportMenuRef} className="relative inline-flex">
                      <div className="inline-flex overflow-hidden rounded border border-border-strong bg-white dark:border-white/20 dark:bg-black/20">
                        <button
                          onClick={handleExportNotebook}
                          disabled={exportingZip || !canExportZip}
                          title={tx('Export notebook', '导出笔记本')}
                          className="cursor-pointer px-2 py-1 text-xs font-medium text-text-main hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-60 dark:text-white/90"
                        >
                          {exportingZip ? tx('Exporting...', '导出中...') : tx('Export', '导出')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setExportMenuOpen((v) => !v)}
                          className="cursor-pointer border-l border-border-strong px-1 text-text-main hover:bg-accent/10 dark:border-white/20 dark:text-white/90"
                          aria-label={tx('Export options', '导出选项')}
                          title={tx('Export options', '导出选项')}
                        >
                          <span className="material-symbols-outlined !text-[16px]">arrow_drop_down</span>
                        </button>
                      </div>
                      {exportMenuOpen ? (
                        <div className="absolute right-0 top-full z-20 mt-2 w-48 rounded-md border border-border-strong bg-card p-2 shadow-lg dark:border-white/20 dark:bg-[#1a1f35]">
                          <label className="mb-2 flex cursor-pointer select-none items-center gap-2 text-xs text-text-main dark:text-white/90">
                            <input
                              type="checkbox"
                              checked={exportIncludeInterpretation}
                              onChange={(e) => setExportIncludeInterpretation(e.target.checked)}
                              className="h-3.5 w-3.5 cursor-pointer accent-blue-600"
                            />
                            <span>{tx('Deep interpretation', '深度解读')}</span>
                          </label>
                          <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-text-main dark:text-white/90">
                            <input
                              type="checkbox"
                              checked={exportIncludeSubtitle}
                              onChange={(e) => setExportIncludeSubtitle(e.target.checked)}
                              className="h-3.5 w-3.5 cursor-pointer accent-blue-600"
                            />
                            <span>{tx('Subtitles', '字幕')}</span>
                          </label>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <button
                    onClick={() => {
                      setShowImportModal(true)
                      setImportError('')
                      setImportNotice('')
                      setUrlInput('')
                      setTextTitleInput('')
                      setTextBodyInput('')
                      setImportFiles([])
                      setImportTab('url')
                      setExpandMode('current')
                      setImportInterpretationMode(
                        defaultInterpretationModeData?.mode === 'detailed'
                          ? 'detailed'
                          : defaultInterpretationModeData?.mode === 'extract'
                          ? 'extract'
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
                  const createdAtTs = new Date(video.created_at || 0).getTime()
                  const updatedAtTs = new Date(video.updated_at || 0).getTime()
                  const hasInterpretedTime =
                    Number.isFinite(createdAtTs) &&
                    Number.isFinite(updatedAtTs) &&
                    updatedAtTs - createdAtTs > 1000 &&
                    (video.status === 'ready' || video.status === 'error' || video.status === 'no-subtitle')
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
                          <div className="dark:text-white/45 mt-1 flex items-center gap-3 text-[11px] text-text-muted/90">
                            <span
                              className="inline-flex items-center gap-1"
                              title={tx('Imported time', '导入时间')}
                              aria-label={tx('Imported time', '导入时间')}
                            >
                              <span className="material-symbols-outlined !text-[13px]">download</span>
                              <span>{formatTimestamp(video.created_at, language)}</span>
                            </span>
                            {hasInterpretedTime ? (
                              <span
                                className="inline-flex items-center gap-1"
                                title={tx('Last interpretation time', '最近解读时间')}
                                aria-label={tx('Last interpretation time', '最近解读时间')}
                              >
                                <span className="material-symbols-outlined !text-[13px]">auto_awesome</span>
                                <span>{formatTimestamp(video.updated_at, language)}</span>
                              </span>
                            ) : null}
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
                      Notes stay available. You can keep writing and organizing notes while videos process in
                      background.
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

                  <div
                    className={`${assistantMaximized ? 'min-h-0 flex-1' : 'max-h-48'} space-y-3 overflow-y-auto pr-1`}
                  >
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
                            <div
                              key={msg.id}
                              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
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
                      ref={chatInputRef}
                      rows={1}
                      value={input}
                      onChange={(e) => {
                        setInput(e.target.value)
                        autoResizeChatInput(e.currentTarget)
                      }}
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
          </div>
        </main>

        {showImportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
            <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border-strong bg-card p-6 text-text-main shadow-2xl dark:border-white/10 dark:bg-[#1a1a1b] dark:text-white">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{tx('Import resources', '导入资源')}</h3>
                <button
                  className="text-text-muted hover:text-text-main dark:text-white/60 dark:hover:text-white"
                  disabled={loadingImport}
                  onClick={() => setShowImportModal(false)}
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="mt-4 space-y-4 overflow-y-auto pr-1">
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
                      {tab === 'url' ? 'URL' : tab === 'text' ? tx('Text', '文本') : tx('Files', '文件')}
                    </button>
                  ))}
                </div>
                {importTab === 'url' ? (
                  <>
                    <div className="rounded-md border border-border-strong bg-white/60 px-3 py-2 text-xs text-text-muted dark:border-white/20 dark:bg-black/20 dark:text-white/60">
                      {tx('Supported video sites:', '当前支持视频网站：')}{' '}
                      <span className="font-semibold text-text-main dark:text-white">Bilibili</span> /{' '}
                      <span className="font-semibold text-text-main dark:text-white">YouTube</span> /{' '}
                      <span className="font-semibold text-text-main dark:text-white">Douyin</span>
                    </div>
                    <textarea
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder={tx(
                        'Paste one or more video URLs (Bilibili / YouTube / Douyin).\nSupported separators: new line, space, comma, semicolon.',
                        '粘贴一个或多个视频链接（Bilibili / YouTube / Douyin）。\n支持分隔符：换行、空格、逗号、分号。',
                      )}
                      rows={8}
                      className="w-full rounded-md border border-border-strong bg-white px-3 py-2 text-sm text-text-main placeholder:text-text-muted focus:border-accent focus:outline-none dark:border-white/20 dark:bg-black/20 dark:text-white dark:placeholder:text-white/50"
                    />
                    <div className="dark:border-white/15 rounded-md border border-border-strong bg-white/60 px-3 py-2 text-sm dark:bg-black/20">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted dark:text-white/60">
                        {tx('Import scope', '导入范围')}
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
                          <span>
                            {tx('Import current video/part only (Recommended)', '仅导入当前视频/分P（推荐）')}
                          </span>
                        </label>
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="radio"
                            name="expandMode"
                            value="all"
                            checked={expandMode === 'all'}
                            onChange={() => setExpandMode('all')}
                          />
                          <span>
                            {tx(
                              'Expand each URL to all parts/episodes (Bilibili multi-part / YouTube playlist only)',
                              '展开每个链接的全部分P/剧集（仅支持 Bilibili 多分P / YouTube 播放列表）',
                            )}
                          </span>
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
                      placeholder={tx('Title (optional)', '标题（可选）')}
                      className="w-full rounded-md border border-border-strong bg-white px-3 py-2 text-sm text-text-main placeholder:text-text-muted focus:border-accent focus:outline-none dark:border-white/20 dark:bg-black/20 dark:text-white dark:placeholder:text-white/50"
                    />
                    <textarea
                      value={textBodyInput}
                      onChange={(e) => setTextBodyInput(e.target.value)}
                      rows={10}
                      placeholder={tx('Paste text content to import', '粘贴要导入的文本内容')}
                      className="w-full rounded-md border border-border-strong bg-white px-3 py-2 text-sm text-text-main placeholder:text-text-muted focus:border-accent focus:outline-none dark:border-white/20 dark:bg-black/20 dark:text-white dark:placeholder:text-white/50"
                    />
                    <div className="text-xs text-text-muted dark:text-white/50">
                      {tx('Characters', '字符数')}: {textBodyInput.trim().length} | {tx('UTF-8 bytes', 'UTF-8 字节')}:{' '}
                      {textByteLength}
                    </div>
                    {textWillTruncate ? (
                      <div className="rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
                        {tx(
                          `This text exceeds ${transcriptByteLimit.toLocaleString()} UTF-8 bytes. The extra part will be truncated before interpretation.`,
                          `当前文本超过 ${transcriptByteLimit.toLocaleString()} UTF-8 字节，超出部分在解读前会被截断。`,
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {importTab === 'files' ? (
                  <div className="space-y-3">
                    <div className="rounded-md border border-amber-300/60 bg-amber-50 px-4 py-4 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
                      {tx(
                        'File import is temporarily unavailable. Please use URL or Text for now.',
                        '文件导入功能暂不支持，请先使用 URL 或 Text 导入。',
                      )}
                    </div>
                  </div>
                ) : null}
                <div className="dark:border-white/15 rounded-md border border-border-strong bg-white/60 px-3 py-2 text-sm dark:bg-black/20">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted dark:text-white/60">
                    {tx('Interpretation mode', '解读模式')}
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
                      <span>
                        {tx(
                          'Import only (keep source text only, no summary/interpretation)',
                          '仅导入（仅保留原文/字幕，不生成总结或解读）',
                        )}
                      </span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        name="interpretationMode"
                        value="concise"
                        checked={importInterpretationMode === 'concise'}
                        onChange={() => setImportInterpretationMode('concise')}
                      />
                      <span>{tx('Concise (faster, more compressed)', '简明（更快、更精炼）')}</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        name="interpretationMode"
                        value="detailed"
                        checked={importInterpretationMode === 'detailed'}
                        onChange={() => setImportInterpretationMode('detailed')}
                      />
                      <span>{tx('Detailed (keeps more details)', '详细（保留更多细节）')}</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        name="interpretationMode"
                        value="extract"
                        checked={importInterpretationMode === 'extract'}
                        onChange={() => setImportInterpretationMode('extract')}
                      />
                      <span>{tx('Extract (minimal knowledge distillation)', '提取（极简知识提炼）')}</span>
                    </label>
                  </div>
                </div>
                {importError && <p className="text-sm text-red-500 dark:text-red-400">{importError}</p>}
                {importNotice && <p className="text-sm text-green-600 dark:text-green-400">{importNotice}</p>}
                <p className="text-xs text-text-muted dark:text-white/50">
                  {tx(
                    'Import runs in background. URL video import also supports import-only mode: subtitles/source text will be kept, while summary/interpretation is skipped.',
                    '导入会在后台执行。URL 视频导入也支持仅导入模式：保留字幕/原文，不生成总结或解读。',
                  )}
                </p>
                {importTab === 'url' ? (
                  <p className="text-xs text-text-muted dark:text-white/50">
                    {tx(
                      'URL import currently supports Bilibili, YouTube, and Douyin.',
                      'URL 导入当前支持 Bilibili、YouTube 和 Douyin。',
                    )}
                  </p>
                ) : null}
                <p className="text-xs text-text-muted dark:text-white/50">
                  {importDailyLimit === null
                    ? tx('Daily import limit: unlimited (Premium).', '每日导入上限：无限制（Premium）。')
                    : tx(
                        `Daily import limit: ${importDailyLimit} items (${tier.toUpperCase()}).`,
                        `每日导入上限：${importDailyLimit} 条（${tier.toUpperCase()}）。`,
                      )}
                </p>
                <p className="text-xs text-text-muted dark:text-white/50">
                  {tx(
                    `Long subtitles/text may be truncated before interpretation (current cap: ${transcriptByteLimit.toLocaleString()} UTF-8 bytes).`,
                    `字幕或文本过长时会在解读前截断（当前上限：${transcriptByteLimit.toLocaleString()} UTF-8 字节）。`,
                  )}
                </p>

                <div className="mt-4 flex justify-end gap-2">
                  <button
                    disabled={loadingImport}
                    onClick={() => setShowImportModal(false)}
                    className="rounded-lg border border-border-strong px-3 py-2 text-sm text-text-main hover:border-accent/70 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/20 dark:text-white"
                  >
                    {tx('Cancel', '取消')}
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={
                      loadingImport ||
                      (importTab === 'url' && !urlInput.trim()) ||
                      (importTab === 'text' && !textBodyInput.trim()) ||
                      importTab === 'files'
                    }
                    className="rounded-lg bg-success px-4 py-2 text-sm font-semibold text-white hover:bg-success/90 disabled:opacity-50 dark:bg-primary"
                  >
                    {loadingImport ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="material-symbols-outlined animate-spin !text-[16px]">progress_activity</span>
                        <span>{tx('Importing...', '导入中...')}</span>
                      </span>
                    ) : (
                      tx('Start import', '开始导入')
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showEditNotebookModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
            <div className="w-full max-w-xl rounded-xl border border-border-strong bg-card p-6 text-text-main shadow-2xl dark:border-white/10 dark:bg-[#1a1a1b] dark:text-white">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{tx('Edit notebook', '编辑 Notebook')}</h3>
                <button
                  className="text-text-muted hover:text-text-main dark:text-white/60 dark:hover:text-white"
                  onClick={() => {
                    if (editingNotebook) return
                    if (editNotebookCover?.previewUrl) URL.revokeObjectURL(editNotebookCover.previewUrl)
                    setEditNotebookCover(null)
                    setShowEditNotebookModal(false)
                  }}
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="mt-4 space-y-3">
                <input
                  value={editNotebookTitle}
                  onChange={(e) => setEditNotebookTitle(e.target.value)}
                  placeholder={tx('Notebook title', 'Notebook 标题')}
                  className="h-10 w-full rounded-md border border-border-strong bg-white px-3 text-sm text-text-main placeholder:text-text-muted focus:border-accent focus:outline-none dark:border-white/20 dark:bg-black/20 dark:text-white dark:placeholder:text-white/50"
                />
                <textarea
                  value={editNotebookDescription}
                  onChange={(e) => setEditNotebookDescription(e.target.value)}
                  placeholder={tx('Description (optional)', '描述（可选）')}
                  rows={3}
                  className="w-full rounded-md border border-border-strong bg-white px-3 py-2 text-sm text-text-main placeholder:text-text-muted focus:border-accent focus:outline-none dark:border-white/20 dark:bg-black/20 dark:text-white dark:placeholder:text-white/50"
                />
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-text-main dark:text-white">
                    {tx('Replace cover image (optional)', '替换封面图片（可选）')}
                  </label>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={async (e) => {
                      const inputEl = e.currentTarget
                      const file = inputEl.files?.[0]
                      if (!file) return
                      try {
                        if (editNotebookCover?.previewUrl) URL.revokeObjectURL(editNotebookCover.previewUrl)
                        const upload = await readImageFileAsUpload(file)
                        setEditNotebookCover(upload)
                      } catch (error: any) {
                        alert(
                          isZh
                            ? error?.message
                                ?.replace(
                                  'Unsupported cover image type. Only PNG, JPEG, and WebP are allowed.',
                                  '封面图片格式不支持，仅支持 PNG、JPEG、WebP。',
                                )
                                ?.replace(
                                  'Cover image is too large. Current limit is 8MB.',
                                  '封面图片过大，当前限制为 8MB。',
                                ) || '读取封面失败'
                            : error?.message || 'Failed to read cover image',
                        )
                      } finally {
                        inputEl.value = ''
                      }
                    }}
                    className="block w-full text-sm text-text-main file:mr-3 file:rounded-md file:border-0 file:bg-accent/20 file:px-3 file:py-2 file:text-sm file:font-medium dark:text-white dark:file:bg-white/10"
                  />
                  {editNotebookCover ? (
                    <div className="dark:border-white/15 overflow-hidden rounded-lg border border-border-strong">
                      <img
                        src={editNotebookCover.previewUrl}
                        alt="Notebook cover preview"
                        className="aspect-[16/9] w-full object-cover"
                      />
                    </div>
                  ) : getNotebookCoverUrl(notebook) ? (
                    <div className="dark:border-white/15 overflow-hidden rounded-lg border border-border-strong">
                      <img
                        src={getNotebookCoverUrl(notebook) || ''}
                        alt="Current notebook cover"
                        className="aspect-[16/9] w-full object-cover"
                      />
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => {
                    if (editingNotebook) return
                    if (editNotebookCover?.previewUrl) URL.revokeObjectURL(editNotebookCover.previewUrl)
                    setEditNotebookCover(null)
                    setShowEditNotebookModal(false)
                  }}
                  className="rounded-lg border border-border-strong px-3 py-2 text-sm text-text-main hover:border-accent/70 dark:border-white/20 dark:text-white"
                >
                  {tx('Cancel', '取消')}
                </button>
                <button
                  onClick={handleSaveNotebook}
                  disabled={editingNotebook || !editNotebookTitle.trim()}
                  className="rounded-lg bg-success px-4 py-2 text-sm font-semibold text-white hover:bg-success/90 disabled:opacity-50 dark:bg-primary dark:hover:bg-primary/90"
                >
                  {editingNotebook ? tx('Saving...', '保存中...') : tx('Save', '保存')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

export default NotebookDetail
