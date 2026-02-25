import Head from 'next/head'
import { NextPage } from 'next'
import useSWR from 'swr'
import { useRouter } from 'next/router'
import { useState } from 'react'
import { ModeToggle } from '~/components/mode-toggle'

type Notebook = {
  id: string
  title: string
  description?: string
  updatedAt: string
  createdAt: string
}

const fetcher = (url: string) => fetch(url).then((res) => res.json())

const Home: NextPage = () => {
  const router = useRouter()
  const { data: notebooks, mutate } = useSWR<Notebook[]>('/api/notebooks', fetcher)
  const [creating, setCreating] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createTitle, setCreateTitle] = useState('')
  const [createDesc, setCreateDesc] = useState('')
  const [titleFilter, setTitleFilter] = useState('')
  const [descFilter, setDescFilter] = useState('')

  const filteredNotebooks = (notebooks || []).filter((nb) => {
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
      alert('Please enter a notebook title.')
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
      alert(`Create failed: ${res.statusText}`)
      return
    }
    const created = await res.json()
    mutate((prev) => (prev ? [created, ...prev] : [created]), false)
    setCreating(false)
    setCreateTitle('')
    setCreateDesc('')
    setShowCreateModal(false)
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
                    href="/"
                  >
                    Notebooks
                  </a>
                  <a
                    className="text-sm font-medium text-text-muted transition-colors hover:text-text-main dark:text-white/60 dark:hover:text-white/80"
                    href="/settings"
                  >
                    Settings
                  </a>
                </nav>
                <div className="flex items-center gap-3">
                  <ModeToggle />
                  <div
                    className="h-8 w-8 rounded-full bg-cover bg-center"
                    data-alt="User avatar image"
                    style={{ backgroundImage: "url('/assets/img-3a5b20d76c536ed6.jpg')" }}
                  />
                </div>
              </div>
            </header>
          </div>
          <main className="flex flex-1 justify-center px-6 py-8 sm:py-12">
            <div className="w-full max-w-7xl">
              <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
                <h1 className="text-3xl font-bold tracking-tight text-text-main dark:text-slate-100 sm:text-4xl">
                  Notebooks
                </h1>
                <div className="flex items-center gap-2">
                  <input
                    value={titleFilter}
                    onChange={(e) => setTitleFilter(e.target.value)}
                    placeholder="Filter by title"
                    className="h-10 rounded-md border border-border-strong bg-white px-2 text-sm text-text-main placeholder:text-text-muted focus:border-accent focus:outline-none dark:border-white/20 dark:bg-black/20 dark:text-white dark:placeholder:text-white/50"
                  />
                  <input
                    value={descFilter}
                    onChange={(e) => setDescFilter(e.target.value)}
                    placeholder="Filter by description"
                    className="h-10 rounded-md border border-border-strong bg-white px-2 text-sm text-text-main placeholder:text-text-muted focus:border-accent focus:outline-none dark:border-white/20 dark:bg-black/20 dark:text-white dark:placeholder:text-white/50"
                  />
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex h-10 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-bold leading-normal text-text-main transition-colors hover:bg-accent/90 disabled:opacity-50 dark:bg-primary dark:text-white dark:hover:bg-primary/90"
                  >
                    <span className="material-symbols-outlined text-base">add</span>
                    <span className="truncate">New Notebook</span>
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
                        Updated: {new Date(notebook.updatedAt).toLocaleDateString()}
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
                <h3 className="text-lg font-semibold">New Notebook</h3>
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
                  placeholder="Notebook title"
                  className="h-10 w-full rounded-md border border-border-strong bg-white px-3 text-sm text-text-main placeholder:text-text-muted focus:border-accent focus:outline-none dark:border-white/20 dark:bg-black/20 dark:text-white dark:placeholder:text-white/50"
                />
                <textarea
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                  placeholder="Description (optional)"
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
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={creating || !createTitle.trim()}
                  className="rounded-lg bg-success px-4 py-2 text-sm font-semibold text-white hover:bg-success/90 disabled:opacity-50 dark:bg-primary dark:hover:bg-primary/90"
                >
                  {creating ? 'Creating...' : 'Create'}
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
