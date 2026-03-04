import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css' // Global styles

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })

export const metadata: Metadata = {
  title: 'Professor AI',
  description: 'Transform Videos into Structured Knowledge',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body
        className="bg-white font-sans text-slate-900 antialiased dark:bg-[#0a0c10] dark:text-slate-100"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  )
}
