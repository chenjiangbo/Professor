import Head from 'next/head'
import { NextPage } from 'next'
import useSWR from 'swr'
import { useRouter } from 'next/router'
import { useState } from 'react'
import { ModeToggle } from '~/components/mode-toggle'
import LanguageSwitcher from '~/components/LanguageSwitcher'
import { useAppLanguage } from '~/hooks/useAppLanguage'
import MembershipBadge from '~/components/MembershipBadge'
import type { SubscriptionTier } from '~/lib/billing/repo'

type Notebook = {
  id: string
  title: string
  description?: string
  updatedAt: string
  createdAt: string
}

type MePayload = {
  user_id: string
  tier: SubscriptionTier
}

const fetcher = async (url: string) => {
  const res = await fetch(url)
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

const meFetcher = async (url: string): Promise<MePayload | null> => {
  const res = await fetch(url)
  const data = await res.json()
  if (!res.ok) {
    return null
  }
  if (!data?.user_id || !data?.tier) {
    return null
  }
  return data as MePayload
}

const Home: NextPage = () => {
  const router = useRouter()
  const { data: notebooks, mutate } = useSWR<Notebook[]>('/api/notebooks', fetcher)
  const { data: me } = useSWR<MePayload | null>('/api/auth/me', meFetcher)
  const { language, setLanguage } = useAppLanguage()
  const isZh = language === 'zh-CN'
  const tx = (en: string, zh: string) => (isZh ? zh : en)
  const [creating, setCreating] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createTitle, setCreateTitle] = useState('')
  const [createDesc, setCreateDesc] = useState('')
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
    const res = await fetch('/api/notebooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: createTitle, description: createDesc }),
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

  return (
    <>
      <Head>
        <title>Notebooks · Professor</title>
      </Head>
      <div className="relative flex min-h-screen w-full flex-col bg-surface text-text-main dark:bg-background-dark dark:text-white">
        <div className="flex h-full grow flex-col">
          <div className="flex w-full justify-center">
            <header className="flex w-full max-w-7xl items-center justify-between whitespace-nowrap border-b border-border-strong px-6 py-4 dark:border-white/10 sm:px-10">
              <div className="flex items-center gap-3 text-text-main dark:text-white">
                <img src="/logo.svg" alt="Professor logo" className="h-7 w-7" />
                <h2 className="text-xl font-bold text-text-main dark:text-slate-100">Professor</h2>
              </div>
              <div className="flex flex-1 items-center justify-end gap-6 sm:gap-8">
                <nav className="hidden items-center gap-6 sm:flex">
                  <a
                    className="text-sm font-medium text-text-main transition-colors hover:text-text-muted dark:text-white dark:hover:text-white/80"
                    href="/notebooks"
                  >
                    {tx('Notebooks', '笔记本')}
                  </a>
                  <a
                    className="text-sm font-medium text-text-muted transition-colors hover:text-text-main dark:text-white/60 dark:hover:text-white/80"
                    href="/"
                  >
                    {tx('Hero', '首页')}
                  </a>
                  <a
                    className="text-sm font-medium text-text-muted transition-colors hover:text-text-main dark:text-white/60 dark:hover:text-white/80"
                    href="/settings"
                  >
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
                    <span className="max-w-[180px] truncate text-text-main dark:text-slate-100">
                      {me?.user_id || '-'}
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
                        handleDeleteNotebook(notebook.id, notebook.title)
                      }}
                      className="bg-black/45 hover:bg-black/65 absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full text-white opacity-0 transition group-hover:opacity-100"
                      title="Delete notebook"
                      aria-label="Delete notebook"
                    >
                      <span className="material-symbols-outlined text-base">delete</span>
                    </button>
                    <div
                      className="aspect-[16/9] w-full flex-shrink-0 rounded-t-xl bg-cover bg-center bg-no-repeat"
                      data-alt={notebook.title}
                      style={{
                        backgroundImage: `url("/assets/img-${
                          ['0d3fd8d9589da2d0', 'd9fe1a795da73d42', 'e3c7b66368cd4032'][idx % 3]
                        }.jpg")`,
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
      </div>
    </>
  )
}

export default Home
