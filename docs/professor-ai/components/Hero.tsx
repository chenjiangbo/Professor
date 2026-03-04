import { Sparkles, PlayCircle } from 'lucide-react'

export default function Hero() {
  return (
    <div className="mb-16 flex max-w-3xl flex-col items-center gap-6 text-center">
      <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">
        <Sparkles className="h-4 w-4" />
        The Ultimate Digital Stationery
      </div>
      <h1 className="text-4xl font-black leading-tight tracking-tight text-slate-900 dark:text-slate-100 md:text-5xl lg:text-6xl">
        Transform Videos into <br className="hidden md:block" /> Structured Knowledge
      </h1>
      <p className="max-w-2xl text-lg text-slate-600 dark:text-slate-400 md:text-xl">
        Experience the premium research tool. Convert any document or video into a structured learning database. Your
        intelligent notebook awaits.
      </p>
      <div className="mt-4 flex w-full flex-col gap-4 sm:w-auto sm:flex-row">
        <button className="flex h-14 w-full cursor-pointer items-center justify-center rounded-xl bg-primary px-8 text-base font-bold text-white shadow-lg shadow-primary/30 transition-colors hover:bg-primary/90 sm:w-auto">
          创建我的第一个 Notebook
        </button>
        <button className="flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-slate-100 px-8 text-base font-bold text-slate-900 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 sm:w-auto">
          <PlayCircle className="h-5 w-5" />
          Watch Demo
        </button>
      </div>
    </div>
  )
}
