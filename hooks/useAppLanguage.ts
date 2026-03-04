import { useEffect, useState } from 'react'
import { normalizeAppLanguage, type AppLanguage } from '~/lib/i18n'

const STORAGE_KEY = 'professor_app_language'

function detectBrowserLanguage(): AppLanguage {
  if (typeof navigator === 'undefined') return 'en-US'
  const raw = String(navigator.language || '').toLowerCase()
  return raw.startsWith('zh') ? 'zh-CN' : 'en-US'
}

export function useAppLanguage() {
  const [language, setLanguage] = useState<AppLanguage>('en-US')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null
    const next = stored ? normalizeAppLanguage(stored) : detectBrowserLanguage()
    setLanguage(next)
    setReady(true)
  }, [])

  const updateLanguage = (next: AppLanguage) => {
    setLanguage(next)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next)
    }
  }

  return { language, setLanguage: updateLanguage, ready }
}

export type { AppLanguage }
