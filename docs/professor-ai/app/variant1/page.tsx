import { PlayCircle, FastForward, MapPin, Brain, Code, MonitorPlay, List, Send, Sparkles } from 'lucide-react'
import Link from 'next/link'

export default function Variant1() {
  return (
    <div className="min-h-screen bg-[#f6f6f8] font-sans text-slate-900 selection:bg-primary/30 dark:bg-[#101622] dark:text-slate-100">
      <header className="sticky top-0 z-50 flex items-center justify-between whitespace-nowrap border-b border-solid border-slate-200 bg-white/80 px-10 py-4 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/80">
        <div className="flex items-center gap-4 text-slate-900 dark:text-white">
          <div className="h-6 w-6 text-primary">
            <svg fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
              <path
                clipRule="evenodd"
                d="M24 18.4228L42 11.475V34.3663C42 34.7796 41.7457 35.1504 41.3601 35.2992L24 42V18.4228Z"
                fill="currentColor"
                fillRule="evenodd"
              ></path>
              <path
                clipRule="evenodd"
                d="M24 8.18819L33.4123 11.574L24 15.2071L14.5877 11.574L24 8.18819ZM9 15.8487L21 20.4805V37.6263L9 32.9945V15.8487ZM27 37.6263V20.4805L39 15.8487V32.9945L27 37.6263ZM25.354 2.29885C24.4788 1.98402 23.5212 1.98402 22.646 2.29885L4.98454 8.65208C3.7939 9.08038 3 10.2097 3 11.475V34.3663C3 36.0196 4.01719 37.5026 5.55962 38.098L22.9197 44.7987C23.6149 45.0671 24.3851 45.0671 25.0803 44.7987L42.4404 38.098C43.9828 37.5026 45 36.0196 45 34.3663V11.475C45 10.2097 44.2061 9.08038 43.0155 8.65208L25.354 2.29885Z"
                fill="currentColor"
                fillRule="evenodd"
              ></path>
            </svg>
          </div>
          <h2 className="text-xl font-black leading-tight tracking-tight">Professor</h2>
        </div>
        <div className="flex flex-1 justify-end gap-8">
          <div className="hidden items-center gap-8 md:flex">
            <Link className="text-sm font-medium transition-colors hover:text-primary" href="/">
              Variant 3
            </Link>
            <Link className="text-sm font-medium transition-colors hover:text-primary" href="/variant1">
              Variant 1
            </Link>
            <Link className="text-sm font-medium transition-colors hover:text-primary" href="/variant2">
              Variant 2
            </Link>
          </div>
          <div className="flex gap-3">
            <button className="flex h-10 items-center justify-center rounded-lg bg-slate-100 px-5 text-sm font-bold text-slate-900 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700">
              登录
            </button>
            <button className="flex h-10 items-center justify-center rounded-lg bg-primary px-5 text-sm font-bold text-white shadow-sm shadow-primary/20 transition-colors hover:bg-primary/90">
              免费开始使用
            </button>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center px-6 pt-24 pb-32">
        <div className="relative z-10 mb-16 max-w-[800px] text-center">
          <h1 className="mb-6 bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-5xl font-black leading-tight tracking-tight text-transparent dark:from-white dark:to-slate-400 md:text-6xl">
            别再只是“看”视频，
            <br />
            去真正<span className="text-primary">“搞懂”</span>它。
          </h1>
          <p className="mx-auto mb-10 max-w-[640px] text-lg leading-relaxed text-slate-600 dark:text-slate-400 md:text-xl">
            Professor (FlashNote AI) 将视频与文档转化为结构化的学习数据库，让你告别“完整看完”，直接获取核心知识。
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <button className="flex h-14 items-center justify-center rounded-xl bg-primary px-8 text-base font-bold text-white shadow-lg shadow-primary/30 transition-all hover:scale-105 hover:bg-primary/90">
              免费开始使用
            </button>
            <button className="group flex h-14 items-center justify-center rounded-xl border border-slate-200 bg-white px-8 text-base font-bold text-slate-900 transition-all hover:border-primary/50 hover:shadow-md dark:border-slate-700 dark:bg-slate-800 dark:text-white">
              <PlayCircle className="mr-2 text-primary transition-transform group-hover:scale-110" />
              观看演示 Demo
            </button>
          </div>
        </div>

        <div className="perspective-1000 relative z-0 mx-auto w-full max-w-[1200px]">
          <div
            className="absolute -top-12 -left-12 z-20 animate-bounce rounded-xl border border-slate-100 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-800"
            style={{ animationDuration: '3s' }}
          >
            <div className="flex items-center gap-2">
              <FastForward className="h-5 w-5 text-primary" />
              <span className="text-sm font-bold">告别“完整看完”</span>
            </div>
          </div>
          <div
            className="absolute top-1/4 -right-8 z-20 animate-bounce rounded-xl border border-slate-100 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-800"
            style={{ animationDuration: '4s', animationDelay: '1s' }}
          >
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-purple-500" />
              <span className="text-sm font-bold">时间戳定位</span>
            </div>
          </div>

          <div className="rotate-x-2 rotate-y-1 hover:rotate-x-0 hover:rotate-y-0 relative transform overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl ring-1 ring-black/5 transition-transform duration-500 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex h-10 items-center gap-2 border-b border-slate-200 bg-slate-100 px-4 dark:border-slate-700 dark:bg-slate-800">
              <div className="h-3 w-3 rounded-full bg-red-400"></div>
              <div className="h-3 w-3 rounded-full bg-amber-400"></div>
              <div className="h-3 w-3 rounded-full bg-green-400"></div>
              <div className="mx-auto flex h-6 w-64 items-center justify-center rounded bg-white text-center text-xs font-medium text-slate-400 dark:bg-slate-900">
                app.professor.ai
              </div>
            </div>

            <div className="dark:bg-slate-950 flex h-[600px] bg-slate-50">
              {/* Left Sidebar */}
              <div className="flex w-64 flex-col gap-4 border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-2 text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Notebooks
                </div>
                <div className="flex items-center gap-3 rounded-lg bg-primary/10 p-2 font-medium text-primary">
                  <Brain className="h-5 w-5" />
                  Machine Learning
                </div>
                <div className="flex cursor-pointer items-center gap-3 rounded-lg p-2 font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                  <Code className="h-5 w-5" />
                  Indie Dev
                </div>
                <div className="mt-auto">
                  <div className="mb-2 text-xs font-medium text-slate-500">Importing Video...</div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <div className="h-full w-2/3 rounded-full bg-primary"></div>
                  </div>
                </div>
              </div>

              {/* Main Content */}
              <div className="flex flex-1 flex-col overflow-hidden border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-200 p-6 dark:border-slate-800">
                  <h2 className="mb-2 text-2xl font-bold">Understanding Transformer Models</h2>
                  <div className="flex items-center gap-4 text-sm text-slate-500">
                    <span className="flex items-center gap-1">
                      <MonitorPlay className="h-4 w-4" /> Bilibili Source
                    </span>
                    <span>•</span>
                    <span>45 mins</span>
                  </div>
                </div>
                <div className="flex-1 space-y-6 overflow-y-auto p-6">
                  <div className="group relative aspect-video overflow-hidden rounded-xl bg-slate-900">
                    <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 to-transparent p-4">
                      <div className="h-1 w-full overflow-hidden rounded-full bg-white/30">
                        <div className="h-full w-1/3 bg-primary"></div>
                      </div>
                    </div>
                    <PlayCircle className="absolute top-1/2 left-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 transform cursor-pointer text-white opacity-80 transition-transform group-hover:scale-110" />
                  </div>
                  <div className="space-y-4">
                    <h3 className="flex items-center gap-2 text-lg font-bold">
                      <List className="h-5 w-5 text-primary" />
                      Structured Summary
                    </h3>
                    <div className="group flex cursor-pointer gap-4 rounded-xl border border-slate-200 p-4 transition-colors hover:border-primary/30 dark:border-slate-700">
                      <div className="pt-1 font-mono text-sm text-primary">04:15</div>
                      <div>
                        <h4 className="font-bold transition-colors group-hover:text-primary">
                          Self-Attention Mechanism
                        </h4>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                          Explains how inputs interact with each other to determine relevance, bypassing RNN sequential
                          bottlenecks.
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                      <div className="pt-1 font-mono text-sm text-slate-400">12:30</div>
                      <div>
                        <h4 className="font-bold">Multi-Head Attention</h4>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                          Multiple attention layers running in parallel to capture different types of relationships.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Sidebar */}
              <div className="dark:bg-slate-950 flex w-80 flex-col bg-slate-50">
                <div className="flex items-center gap-2 border-b border-slate-200 p-4 dark:border-slate-800">
                  <Sparkles className="h-5 w-5 text-purple-600" />
                  <span className="font-bold">Ask Professor</span>
                </div>
                <div className="flex-1 space-y-4 overflow-y-auto p-4">
                  <div className="flex gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary">
                      U
                    </div>
                    <div className="rounded-2xl rounded-tl-none border border-slate-100 bg-white p-3 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-800">
                      Can you explain how this relates to developer income models?
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-600 dark:bg-purple-900/30">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div className="rounded-2xl rounded-tr-none border border-purple-100 bg-purple-50 p-3 text-sm shadow-sm dark:border-purple-900/30 dark:bg-purple-900/10">
                      <p className="mb-2">
                        Based on the 'Indie Dev' notebook{' '}
                        <span className="mx-1 inline-flex cursor-pointer items-center rounded bg-purple-200 px-1.5 py-0.5 font-mono text-[10px] text-purple-700 hover:bg-purple-300 dark:bg-purple-800 dark:text-purple-300">
                          [1]
                        </span>
                        , understanding models like Transformers allows solo developers to build AI wrappers or niche
                        SaaS products efficiently.
                      </p>
                      <p>Key income models mentioned:</p>
                      <ul className="mt-1 list-disc space-y-1 pl-4 text-slate-600 dark:text-slate-400">
                        <li>
                          Subscription SaaS{' '}
                          <span className="mx-1 inline-flex items-center rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[10px] text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                            [18:20]
                          </span>
                        </li>
                        <li>Pay-per-usage API access</li>
                      </ul>
                    </div>
                  </div>
                </div>
                <div className="border-t border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="relative">
                    <input
                      className="w-full rounded-xl border-none bg-slate-100 py-3 pl-4 pr-10 text-sm outline-none focus:ring-2 focus:ring-primary dark:bg-slate-800"
                      placeholder="Ask anything about your notes..."
                      type="text"
                    />
                    <button className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 transform items-center justify-center text-slate-400 transition-colors hover:text-primary">
                      <Send className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="pointer-events-none absolute -inset-4 -z-10 rounded-[3rem] bg-primary/20 opacity-50 blur-3xl dark:opacity-20"></div>
        </div>
      </main>
    </div>
  )
}
