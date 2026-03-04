import { BookOpen, Globe } from 'lucide-react'
import Link from 'next/link'

export default function Header() {
  return (
    <header className="sticky top-0 z-50 flex items-center justify-between whitespace-nowrap border-b border-solid border-slate-200 bg-white/80 px-6 py-4 backdrop-blur-md dark:border-slate-800 dark:bg-[#0a0c10]/80 lg:px-10">
      <div className="flex items-center gap-3 text-primary">
        <BookOpen className="h-8 w-8" />
        <h2 className="text-xl font-bold leading-tight tracking-tight text-slate-900 dark:text-slate-100">
          FlashNote AI
        </h2>
      </div>
      <div className="flex flex-1 items-center justify-end gap-6">
        <nav className="hidden items-center gap-8 md:flex">
          <Link
            className="text-sm font-medium text-slate-600 transition-colors hover:text-primary dark:text-slate-400 dark:hover:text-primary"
            href="/"
          >
            Variant 3
          </Link>
          <Link
            className="text-sm font-medium text-slate-600 transition-colors hover:text-primary dark:text-slate-400 dark:hover:text-primary"
            href="/variant1"
          >
            Variant 1
          </Link>
          <Link
            className="text-sm font-medium text-slate-600 transition-colors hover:text-primary dark:text-slate-400 dark:hover:text-primary"
            href="/variant2"
          >
            Variant 2
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          <button className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700">
            <Globe className="h-5 w-5" />
          </button>
          <button className="hidden h-9 cursor-pointer items-center justify-center rounded-lg bg-slate-100 px-4 text-sm font-bold text-slate-900 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 sm:flex">
            Login
          </button>
          <button className="flex h-9 cursor-pointer items-center justify-center rounded-lg bg-primary px-5 text-sm font-bold text-white shadow-sm shadow-primary/20 transition-colors hover:bg-primary/90">
            <span>创建我的第一个 Notebook</span>
          </button>
        </div>
      </div>
    </header>
  )
}
