import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-slate-200 bg-white py-8 px-6 text-center dark:border-slate-800 dark:bg-[#0a0c10]">
      <div className="mb-4 flex flex-wrap items-center justify-center gap-6">
        <Link className="text-sm text-slate-500 transition-colors hover:text-primary" href="#">
          Privacy Policy
        </Link>
        <Link className="text-sm text-slate-500 transition-colors hover:text-primary" href="#">
          Terms of Service
        </Link>
        <Link className="text-sm text-slate-500 transition-colors hover:text-primary" href="#">
          Contact Us
        </Link>
      </div>
      <p className="text-sm text-slate-400">© 2024 FlashNote AI. All rights reserved.</p>
    </footer>
  )
}
