import { PlayCircle, Sparkles, MonitorPlay, FileText, FileCode2, File, Lock, Brain, Bot } from 'lucide-react'
import Link from 'next/link'

export default function Variant2() {
  return (
    <div className="min-h-screen bg-[#f6f6f8] font-sans text-slate-900 selection:bg-primary/30 dark:bg-[#101622] dark:text-slate-100">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between whitespace-nowrap px-8 py-5 lg:px-20">
        <div className="flex items-center gap-3 text-slate-900 dark:text-slate-100">
          <div className="h-6 w-6 text-primary">
            <svg className="h-full w-full" fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
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
          <h2 className="text-xl font-bold leading-tight tracking-tight">Professor</h2>
        </div>
        <div className="flex items-center gap-8">
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
            <button className="hidden h-10 cursor-pointer items-center justify-center rounded-lg px-5 text-sm font-semibold tracking-wide text-slate-600 transition-colors hover:bg-slate-200/50 dark:text-slate-300 dark:hover:bg-slate-800/50 sm:flex">
              Log in
            </button>
            <button className="flex h-10 cursor-pointer items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold tracking-wide text-white shadow-sm shadow-primary/20 transition-colors hover:bg-primary/90">
              Sign up
            </button>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col justify-center px-4 py-12 lg:px-20">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-12 lg:flex-row lg:gap-20">
          <div className="z-10 flex w-full flex-col gap-8 lg:w-1/2">
            <div className="inline-flex w-fit items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-semibold tracking-wide text-primary">
              <Sparkles className="h-4 w-4" />
              FlashNote AI V2.0 is Live
            </div>
            <div className="flex flex-col gap-5 text-left">
              <h1 className="text-4xl font-black leading-[1.15] tracking-tight text-slate-900 dark:text-white lg:text-5xl xl:text-6xl">
                从信息流到知识库，
                <br className="hidden lg:block" />
                构建你的 AI 专属学习引擎。
              </h1>
              <p className="max-w-xl text-lg font-medium leading-relaxed text-slate-600 dark:text-slate-400">
                Convert videos and documents into a structured learning database. Supported by Bilibili, YouTube, PDF,
                and MD. Stop browsing, start learning.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <button className="flex h-14 cursor-pointer items-center justify-center rounded-xl bg-primary px-8 text-lg font-bold tracking-wide text-white shadow-lg shadow-primary/25 transition-all hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-xl">
                Start Building for Free
                <span className="material-symbols-outlined ml-2 text-xl">arrow_forward</span>
              </button>
              <button className="flex h-14 cursor-pointer items-center justify-center rounded-xl border-2 border-slate-200 bg-white px-8 text-lg font-bold tracking-wide text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
                <PlayCircle className="mr-2 text-xl" />
                Watch Demo
              </button>
            </div>
            <div className="mt-4 flex items-center gap-6 border-t border-slate-200 pt-6 dark:border-slate-800">
              <span className="text-sm font-semibold uppercase tracking-wider text-slate-500">Works With</span>
              <div className="flex items-center gap-4 text-slate-400 dark:text-slate-500">
                <span title="YouTube">
                  <MonitorPlay className="h-6 w-6 cursor-pointer transition-colors hover:text-primary" />
                </span>
                <span title="PDF">
                  <FileText className="h-6 w-6 cursor-pointer transition-colors hover:text-primary" />
                </span>
                <span title="Markdown">
                  <FileCode2 className="h-6 w-6 cursor-pointer transition-colors hover:text-primary" />
                </span>
                <span title="Web Articles">
                  <File className="h-6 w-6 cursor-pointer transition-colors hover:text-primary" />
                </span>
              </div>
            </div>
          </div>

          <div className="relative flex h-[600px] w-full items-center justify-center lg:w-1/2">
            <div className="absolute inset-0 z-0 -rotate-6 scale-95 rounded-[3rem] bg-gradient-to-tr from-primary/5 to-transparent"></div>
            <div className="perspective-1000 relative z-10 w-full max-w-lg">
              {/* Batch Import Floating Card */}
              <div className="absolute -right-8 -top-8 z-10 w-64 rotate-3 transform rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-2xl transition-all duration-300 hover:z-30 hover:rotate-0">
                <div className="mb-3 flex items-center gap-3 border-b border-slate-700 pb-3">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <h3 className="text-sm font-bold text-white">Batch Import</h3>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 rounded-lg bg-slate-800 p-2 text-xs text-slate-300">
                    <div className="h-2 w-2 animate-pulse rounded-full bg-green-500"></div>
                    <span>bilibili.com/video/BV1...</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg bg-slate-800 p-2 text-xs text-slate-300">
                    <div className="h-2 w-2 animate-pulse rounded-full bg-green-500"></div>
                    <span>bilibili.com/video/BV2...</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-600 bg-slate-800/50 p-2 text-xs text-slate-500">
                    <div className="h-2 w-2 rounded-full bg-slate-600"></div>
                    <span>Processing...</span>
                  </div>
                </div>
              </div>

              {/* Main Mockup Card */}
              <div className="relative z-20 w-full -rotate-1 transform overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl transition-transform duration-300 hover:rotate-0 dark:border-slate-800 dark:bg-[#151b28]">
                <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex gap-1.5">
                    <div className="h-3 w-3 rounded-full bg-rose-400"></div>
                    <div className="h-3 w-3 rounded-full bg-amber-400"></div>
                    <div className="h-3 w-3 rounded-full bg-emerald-400"></div>
                  </div>
                  <div className="mx-auto flex items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-1 font-mono text-xs text-slate-500 shadow-sm dark:border-slate-700/50 dark:bg-[#1a2130]">
                    <Lock className="h-3 w-3" />
                    professor.ai/notebook/ai-history
                  </div>
                </div>
                <div className="p-6">
                  <h2 className="mb-2 font-serif text-xl font-bold text-slate-900 dark:text-white">
                    History of Neural Networks
                  </h2>
                  <div className="mb-6 flex gap-2">
                    <span className="rounded bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                      AI Generated
                    </span>
                    <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      Structured
                    </span>
                  </div>
                  <div className="space-y-4">
                    <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
                      <h4 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-200">
                        <Brain className="h-4 w-4 text-primary" />
                        Deep Explanation
                      </h4>
                      <p className="font-serif text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                        The perceptron was the first mathematical model of a biological neuron, proposed by Rosenblatt
                        in 1958. It established the foundation for modern deep learning architectures by demonstrating
                        that machines could "learn" simple functions through iterative weight adjustments.
                      </p>
                    </div>
                    <div>
                      <h4 className="mb-3 text-sm font-bold text-slate-800 dark:text-slate-200">
                        Key Concepts Extracted
                      </h4>
                      <ul className="space-y-2">
                        <li className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                          <div className="h-1 w-1 rounded-full bg-primary"></div>
                          Perceptron Model (1958)
                        </li>
                        <li className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                          <div className="h-1 w-1 rounded-full bg-primary"></div>
                          Backpropagation Algorithm
                        </li>
                        <li className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                          <div className="h-1 w-1 rounded-full bg-primary"></div>
                          Activation Functions
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* Professor AI Chat Floating Card */}
              <div className="absolute -left-12 -bottom-10 z-30 w-72 -rotate-3 transform rounded-xl border border-primary/30 bg-slate-900 bg-opacity-95 p-4 shadow-2xl backdrop-blur-md transition-all duration-300 hover:rotate-0">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Professor AI Chat</h3>
                    <p className="text-[10px] text-slate-400">Context: Neural Networks</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="rounded-lg rounded-tl-none bg-slate-800 p-3 text-xs text-slate-300">
                    How did backpropagation solve the XOR problem mentioned in video 2?
                  </div>
                  <div className="rounded-lg rounded-tr-none border border-primary/30 bg-primary/20 p-3 text-xs text-slate-200">
                    Based on your imported videos, backpropagation allowed multi-layer networks to adjust hidden
                    weights, breaking the linear separability constraint that limited early perceptrons when facing the
                    XOR problem...
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
