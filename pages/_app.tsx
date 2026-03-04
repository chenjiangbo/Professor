import { Lexend } from '@next/font/google'
// Auth-related dependencies are not used yet, to avoid forcing Supabase env vars.
// import { createBrowserSupabaseClient, Session } from '@supabase/auth-helpers-nextjs'
// import { SessionContextProvider } from '@supabase/auth-helpers-react'
import { Analytics } from '@vercel/analytics/react'
import { ThemeProvider, useTheme } from 'next-themes'
import type { AppProps } from 'next/app'
import React, { useEffect, useState } from 'react'
import CommandMenu from '~/components/CommandMenu'
import { AnalyticsProvider } from '~/components/context/analytics'
import { useSignInModal } from '~/components/sign-in-modal'
import { TailwindIndicator } from '~/components/tailwind-indicator'
import { Toaster } from '~/components/ui/toaster'
import { TooltipProvider } from '~/components/ui/tooltip'
import { cn } from '~/lib/utils'
import '../styles/globals.css'
import '../styles/markdown.css'

const fontDisplay = Lexend({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
})
function MyApp({
  Component,
  pageProps,
}: AppProps<{
  initialSession: any
}>) {
  const { SignInModal, setShowSignInModal: showSingIn } = useSignInModal()

  // Force-sync html class/data-theme so theme switching always applies.
  const ThemeSync = () => {
    const { theme, resolvedTheme } = useTheme()
    useEffect(() => {
      const active = theme === 'system' ? resolvedTheme : theme
      if (active === 'dark') {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
      if (active) {
        document.documentElement.setAttribute('data-theme', active)
      }
    }, [theme, resolvedTheme])
    return null
  }

  return (
    <AnalyticsProvider>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <TooltipProvider>
          <div
            className={cn(
              'min-h-screen bg-surface font-display text-text-main dark:bg-background-dark dark:text-white',
              fontDisplay.variable,
            )}
          >
            <main className="min-h-screen">
              <Component {...pageProps} showSingIn={showSingIn} />
            </main>
            <ThemeSync />
            <Analytics />
            <CommandMenu />
          </div>
          <TailwindIndicator />
          <Toaster />
          <SignInModal />
        </TooltipProvider>
      </ThemeProvider>
    </AnalyticsProvider>
  )
}

export default MyApp
