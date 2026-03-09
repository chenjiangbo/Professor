import Head from 'next/head'
import { NextPage } from 'next'
import useSWR from 'swr'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { ModeToggle } from '~/components/mode-toggle'
import LanguageSwitcher from '~/components/LanguageSwitcher'
import { useAppLanguage } from '~/hooks/useAppLanguage'
import MembershipBadge from '~/components/MembershipBadge'
import type { SubscriptionTier } from '~/lib/billing/repo'

type NotebookCoverUpload = {
  file: File
  previewUrl: string
  name: string
}

type Notebook = {
  id: string
  title: string
  description?: string
  updatedAt: string
  createdAt: string
  cover_url?: string | null
  cover_status?: 'none' | 'queued' | 'generating' | 'ready' | 'error'
  coverUpdatedAt?: string | null
}

type MePayload = {
  user_id: string
  user_email?: string | null
  display_name?: string | null
  tier: SubscriptionTier
}

function formatUserLabel(me: MePayload | null | undefined): string {
  const raw = String(me?.display_name || me?.user_email || me?.user_id || '').trim()
  if (!raw) return '-'
  if (raw.length <= 16) return raw
  return `${raw.slice(0, 8)}...${raw.slice(-4)}`
}

function getNotebookCoverImage(notebook: Notebook, idx: number): string {
  if (notebook.cover_status === 'ready' && notebook.cover_url) {
    const version = encodeURIComponent(String(notebook.coverUpdatedAt || notebook.updatedAt || ''))
    return `/api/notebooks/${notebook.id}/cover?v=${version}`
  }
  return `/assets/img-${['0d3fd8d9589da2d0', 'd9fe1a795da73d42', 'e3c7b66368cd4032'][idx % 3]}.jpg`
}

const fetcher = async (url: string) => {
  const res = await fetch(url)
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

const meFetcher = async (url: string): Promise<MePayload | null> => {
  const res = await fetch(url)
  if (res.status === 401) {
    const err = new Error('Unauthorized') as Error & { status?: number }
    err.status = 401
    throw err
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const err = new Error(`auth/me failed: ${res.status}`) as Error & { status?: number }
    err.status = res.status
    throw err
  }
  if (!data?.user_id || !data?.tier) {
    throw new Error('Invalid auth/me payload')
  }
  return data as MePayload
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

const Home: NextPage = () => {
  const router = useRouter()
  const { data: notebooks, mutate } = useSWR<Notebook[]>('/api/notebooks', fetcher)
  const { data: me, error: meError } = useSWR<MePayload | null>('/api/auth/me', meFetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })
  const { language, setLanguage } = useAppLanguage()
  const isZh = language === 'zh-CN'
  const tx = (en: string, zh: string) => (isZh ? zh : en)
  const [creating, setCreating] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editingNotebookId, setEditingNotebookId] = useState('')
  const [createTitle, setCreateTitle] = useState('')
  const [createDesc, setCreateDesc] = useState('')
  const [createCover, setCreateCover] = useState<NotebookCoverUpload | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editCover, setEditCover] = useState<NotebookCoverUpload | null>(null)
  const [titleFilter, setTitleFilter] = useState('')
  const [descFilter, setDescFilter] = useState('')

  const notebookList = Array.isArray(notebooks) ? notebooks : []
  const filteredNotebooks = notebookList.filter((nb) => {
    const titleMatched = !titleFilter.trim() || nb.title.toLowerCase().includes(titleFilter.toLowerCase())
    const descMatched =
      !descFilter.trim() ||
      String(nb.description || '')
        .toLowerCase()
        .includes(descFilter.toLowerCase())
    return titleMatched && descMatched
  })

  const handleCreate = async () => {
    if (!createTitle.trim()) {
      alert(tx('Please enter a notebook title.', '请输入 Notebook 标题。'))
      return
    }
    setCreating(true)
    const formData = new FormData()
    formData.append('title', createTitle)
    formData.append('description', createDesc)
    if (createCover?.file) {
      formData.append('cover', createCover.file)
    }
    const res = await fetch('/api/notebooks', {
      method: 'POST',
      body: formData,
    })
    if (!res.ok) {
      setCreating(false)
      alert(tx(`Creation failed: ${res.statusText}`, `创建失败：${res.statusText}`))
      return
    }
    const created = await res.json()
    mutate((prev) => (Array.isArray(prev) ? [created, ...prev] : [created]), false)
    setCreating(false)
    setCreateTitle('')
    setCreateDesc('')
    if (createCover?.previewUrl) URL.revokeObjectURL(createCover.previewUrl)
    setCreateCover(null)
    setShowCreateModal(false)
    mutate()
  }

  const handleDeleteNotebook = async (id: string, title: string) => {
    const ok = window.confirm(
      tx(
        `Delete notebook "${title}"? Related resources and chat history will also be deleted.`,
        `确认删除 Notebook「${title}」吗？相关资源与聊天记录会一并删除。`,
      ),
    )
    if (!ok) return
    const res = await fetch(`/api/notebooks/${id}`, { method: 'DELETE' })
    if (!res.ok && res.status !== 204) {
      alert(tx(`Delete failed: ${res.status} ${res.statusText}`, `删除失败：${res.status} ${res.statusText}`))
      return
    }
    mutate((prev) => (Array.isArray(prev) ? prev.filter((nb) => nb.id !== id) : []), false)
    mutate()
  }

  const openEditModal = (notebook: Notebook) => {
    if (editCover?.previewUrl) URL.revokeObjectURL(editCover.previewUrl)
    setEditCover(null)
    setEditingNotebookId(notebook.id)
    setEditTitle(notebook.title)
    setEditDesc(notebook.description || '')
    setShowEditModal(true)
  }

  const handleEditSave = async () => {
    if (!editingNotebookId || !editTitle.trim()) {
      alert(tx('Please enter a notebook title.', '请输入 Notebook 标题。'))
      return
    }
    setEditing(true)
    const formData = new FormData()
    formData.append('title', editTitle)
    formData.append('description', editDesc)
    if (editCover?.file) {
      formData.append('cover', editCover.file)
    }
    const res = await fetch(`/api/notebooks/${editingNotebookId}`, {
      method: 'PATCH',
      body: formData,
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setEditing(false)
      alert(json?.error || tx(`Save failed: ${res.statusText}`, `保存失败：${res.statusText}`))
      return
    }
    mutate((prev) => (Array.isArray(prev) ? prev.map((nb) => (nb.id === json.id ? json : nb)) : [json]), false)
    mutate()
    setEditing(false)
    if (editCover?.previewUrl) URL.revokeObjectURL(editCover.previewUrl)
    setEditCover(null)
    setShowEditModal(false)
  }

  useEffect(() => {
    const status = Number((meError as { status?: number } | undefined)?.status || 0)
    if (!router.isReady || status !== 401) return
    const redirectUrl =
      typeof window !== 'undefined' ? window.location.href : 'https://professor.xipilabs.com/notebooks'
    window.location.href = `https://www.xipilabs.com/login?redirect_url=${encodeURIComponent(redirectUrl)}`
  }, [meError, router.isReady])

  return (
    <>
      <Head>
        <title>Notebooks · Professor</title>
      </Head>
      <div className="relative flex min-h-screen w-full flex-col bg-surface text-text-main dark:bg-background-dark dark:text-white">
        <div className="flex h-full grow flex-col">
          <div className="flex w-full justify-center">
            <header className="flex w-full max-w-7xl items-center justify-between whitespace-nowrap border-b border-border-strong px-6 py-4 dark:border-white/10 sm:px-10">
              <a
                href="/"
                className="hover:opacity-85 flex items-center gap-3 text-text-main transition-opacity dark:text-white"
              >
                <img src="/logo.svg" alt="Professor logo" className="h-7 w-7" />
                <h2 className="text-xl font-bold text-text-main dark:text-slate-100">Professor</h2>
              </a>
              <div className="flex flex-1 items-center justify-end gap-6 sm:gap-8">
                <nav className="hidden items-center gap-6 sm:flex">
                  <a
                    className="inline-flex items-center gap-1 text-sm font-medium text-text-main transition-colors hover:text-text-muted dark:text-white dark:hover:text-white/80"
                    href="/notebooks"
                  >
                    <span className="material-symbols-outlined text-[16px]">menu_book</span>
                    {tx('Notebooks', '笔记本')}
                  </a>
                  <a
                    className="inline-flex items-center gap-1 text-sm font-medium text-text-muted transition-colors hover:text-text-main dark:text-white/60 dark:hover:text-white/80"
                    href="/settings"
                  >
                    <span className="material-symbols-outlined text-[16px]">settings</span>
                    {tx('Settings', '设置')}
                  </a>
                </nav>
                <div className="flex items-center gap-3">
                  <LanguageSwitcher language={language} onChange={setLanguage} />
                  <ModeToggle />
                  <div className="inline-flex items-center gap-2 rounded-full border border-border-strong bg-white px-2.5 py-1 text-xs dark:border-white/20 dark:bg-white/5">
                    <span className="material-symbols-outlined text-[14px] text-text-muted dark:text-slate-300">
                      account_circle
                    </span>
                    <span
                      className="max-w-[180px] truncate text-text-main dark:text-slate-100"
                      title={String(me?.display_name || me?.user_email || me?.user_id || '')}
                    >
                      {formatUserLabel(me)}
                    </span>
                    <MembershipBadge tier={me?.tier || 'free'} />
                  </div>
                </div>
              </div>
            </header>
          </div>
          <main className="flex flex-1 justify-center px-6 py-8 sm:py-12">
            <div className="w-full max-w-7xl">
              <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
                <h1 className="text-3xl font-bold tracking-tight text-text-main dark:text-slate-100 sm:text-4xl">
                  {tx('Notebooks', '笔记本')}
                </h1>
                <div className="flex items-center gap-2">
                  <input
                    value={titleFilter}
                    onChange={(e) => setTitleFilter(e.target.value)}
                    placeholder={tx('Filter by title', '按标题筛选')}
                    className="h-10 rounded-md border border-border-strong bg-white px-2 text-sm text-text-main placeholder:text-text-muted focus:border-accent focus:outline-none dark:border-white/20 dark:bg-black/20 dark:text-white dark:placeholder:text-white/50"
                  />
                  <input
                    value={descFilter}
                    onChange={(e) => setDescFilter(e.target.value)}
                    placeholder={tx('Filter by description', '按描述筛选')}
                    className="h-10 rounded-md border border-border-strong bg-white px-2 text-sm text-text-main placeholder:text-text-muted focus:border-accent focus:outline-none dark:border-white/20 dark:bg-black/20 dark:text-white dark:placeholder:text-white/50"
                  />
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex h-10 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-bold leading-normal text-text-main transition-colors hover:bg-accent/90 disabled:opacity-50 dark:bg-primary dark:text-white dark:hover:bg-primary/90"
                  >
                    <span className="material-symbols-outlined text-base">add</span>
                    <span className="truncate">{tx('New Notebook', '新建 Notebook')}</span>
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {filteredNotebooks.map((notebook, idx) => (
                  <div
                    key={notebook.id}
                    onClick={() => router.push(`/notebooks/${notebook.id}`)}
                    className="group relative flex flex-col items-stretch justify-start rounded-xl border border-border-strong bg-card shadow-[0_10px_30px_rgba(12,18,38,0.08)] transition-all hover:scale-[1.01] hover:shadow-lg dark:border-transparent dark:bg-[#1c1f27] dark:shadow-[0_0_12px_rgba(0,0,0,0.2)]"
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        openEditModal(notebook)
                      }}
                      className="absolute right-11 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-sky-200 bg-sky-600 text-white opacity-0 shadow-sm transition hover:bg-sky-700 group-hover:opacity-100 dark:border-sky-400/40 dark:bg-sky-500 dark:hover:bg-sky-400"
                      title="Edit notebook"
                      aria-label="Edit notebook"
                    >
                      <span className="material-symbols-outlined text-[18px]">edit</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteNotebook(notebook.id, notebook.title)
                      }}
                      className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-200 bg-rose-600 text-white opacity-0 shadow-sm transition hover:bg-rose-700 group-hover:opacity-100 dark:border-rose-400/40 dark:bg-rose-500 dark:hover:bg-rose-400"
                      title="Delete notebook"
                      aria-label="Delete notebook"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                    <div
                      className="aspect-[16/9] w-full flex-shrink-0 rounded-t-xl bg-cover bg-center bg-no-repeat"
                      data-alt={notebook.title}
                      style={{
                        backgroundImage: `url("${getNotebookCoverImage(notebook, idx)}")`,
                      }}
                    />
                    <div className="flex w-full grow flex-col items-stretch justify-start gap-1 p-5">
                      <p className="text-lg font-bold leading-tight text-text-main dark:text-white">{notebook.title}</p>
                      <p className="text-sm font-normal leading-normal text-text-muted dark:text-slate-400">
                        {notebook.description}
                      </p>
                      <p className="mt-2 text-xs font-normal leading-normal text-text-muted dark:text-slate-500">
                        {tx('Updated:', '更新于')}{' '}
                        {notebook.updatedAt ? new Date(notebook.updatedAt).toLocaleDateString() : '-'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </main>
        </div>
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-xl border border-border-strong bg-card p-6 text-text-main shadow-2xl dark:border-white/10 dark:bg-[#1a1a1b] dark:text-white">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{tx('New Notebook', '新建 Notebook')}</h3>
                <button
                  className="text-text-muted hover:text-text-main dark:text-white/60 dark:hover:text-white"
                  onClick={() => {
                    if (creating) return
                    if (createCover?.previewUrl) URL.revokeObjectURL(createCover.previewUrl)
                    setCreateCover(null)
                    setShowCreateModal(false)
                  }}
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="mt-4 space-y-3">
                <input
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  placeholder={tx('Notebook title', 'Notebook 标题')}
                  className="h-10 w-full rounded-md border border-border-strong bg-white px-3 text-sm text-text-main placeholder:text-text-muted focus:border-accent focus:outline-none dark:border-white/20 dark:bg-black/20 dark:text-white dark:placeholder:text-white/50"
                />
                <textarea
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                  placeholder={tx('Description (optional)', '描述（可选）')}
                  rows={3}
                  className="w-full rounded-md border border-border-strong bg-white px-3 py-2 text-sm text-text-main placeholder:text-text-muted focus:border-accent focus:outline-none dark:border-white/20 dark:bg-black/20 dark:text-white dark:placeholder:text-white/50"
                />
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-text-main dark:text-white">
                    {tx('Cover image (optional)', '封面图片（可选）')}
                  </label>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={async (e) => {
                      const inputEl = e.currentTarget
                      const file = inputEl.files?.[0]
                      if (!file) return
                      try {
                        if (createCover?.previewUrl) URL.revokeObjectURL(createCover.previewUrl)
                        const upload = await readImageFileAsUpload(file)
                        setCreateCover(upload)
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
                  {createCover ? (
                    <div className="dark:border-white/15 overflow-hidden rounded-lg border border-border-strong">
                      <img
                        src={createCover.previewUrl}
                        alt="Notebook cover preview"
                        className="aspect-[16/9] w-full object-cover"
                      />
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => {
                    if (creating) return
                    setShowCreateModal(false)
                  }}
                  className="rounded-lg border border-border-strong px-3 py-2 text-sm text-text-main hover:border-accent/70 dark:border-white/20 dark:text-white"
                >
                  {tx('Cancel', '取消')}
                </button>
                <button
                  onClick={handleCreate}
                  disabled={creating || !createTitle.trim()}
                  className="rounded-lg bg-success px-4 py-2 text-sm font-semibold text-white hover:bg-success/90 disabled:opacity-50 dark:bg-primary dark:hover:bg-primary/90"
                >
                  {creating ? tx('Creating...', '创建中...') : tx('Create', '创建')}
                </button>
              </div>
            </div>
          </div>
        )}
        {showEditModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-xl border border-border-strong bg-card p-6 text-text-main shadow-2xl dark:border-white/10 dark:bg-[#1a1a1b] dark:text-white">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{tx('Edit Notebook', '编辑 Notebook')}</h3>
                <button
                  className="text-text-muted hover:text-text-main dark:text-white/60 dark:hover:text-white"
                  onClick={() => {
                    if (editing) return
                    if (editCover?.previewUrl) URL.revokeObjectURL(editCover.previewUrl)
                    setEditCover(null)
                    setShowEditModal(false)
                  }}
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="mt-4 space-y-3">
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder={tx('Notebook title', 'Notebook 标题')}
                  className="h-10 w-full rounded-md border border-border-strong bg-white px-3 text-sm text-text-main placeholder:text-text-muted focus:border-accent focus:outline-none dark:border-white/20 dark:bg-black/20 dark:text-white dark:placeholder:text-white/50"
                />
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
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
                        if (editCover?.previewUrl) URL.revokeObjectURL(editCover.previewUrl)
                        const upload = await readImageFileAsUpload(file)
                        setEditCover(upload)
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
                  {editCover ? (
                    <div className="dark:border-white/15 overflow-hidden rounded-lg border border-border-strong">
                      <img
                        src={editCover.previewUrl}
                        alt="Notebook cover preview"
                        className="aspect-[16/9] w-full object-cover"
                      />
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => {
                    if (editing) return
                    if (editCover?.previewUrl) URL.revokeObjectURL(editCover.previewUrl)
                    setEditCover(null)
                    setShowEditModal(false)
                  }}
                  className="rounded-lg border border-border-strong px-3 py-2 text-sm text-text-main hover:border-accent/70 dark:border-white/20 dark:text-white"
                >
                  {tx('Cancel', '取消')}
                </button>
                <button
                  onClick={handleEditSave}
                  disabled={editing || !editTitle.trim()}
                  className="rounded-lg bg-success px-4 py-2 text-sm font-semibold text-white hover:bg-success/90 disabled:opacity-50 dark:bg-primary dark:hover:bg-primary/90"
                >
                  {editing ? tx('Saving...', '保存中...') : tx('Save', '保存')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

export default Home
